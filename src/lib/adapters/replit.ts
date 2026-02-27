import type { VendorAdapter, VendorConfig, UsageRecord } from "./types";
import type { DateRange } from "@/types";
import { scrapeReplitUsage, scrapeReplitUsageWithEdge } from "@/lib/scrapers/replit";

export const replitAdapter: VendorAdapter = {
  vendor: "replit",

  async fetchUsageData(config: VendorConfig, dateRange: DateRange): Promise<UsageRecord[]> {
    const { sessionCookie, teamSlug } = config.credentials;

    // Try cookie mode first, fall back to Edge profile
    let result;
    if (sessionCookie) {
      result = await scrapeReplitUsage(sessionCookie, teamSlug || undefined);
    } else {
      // No cookie stored — try Edge browser profile (local dev only)
      result = await scrapeReplitUsageWithEdge(teamSlug || undefined);
    }

    if (result.error) {
      throw new Error(`Replit scraper: ${result.error}`);
    }

    // Aggregate by username
    const userMap = new Map<string, { spendCents: number; categories: string[] }>();

    for (const row of result.rows) {
      const existing = userMap.get(row.username) || { spendCents: 0, categories: [] };
      existing.spendCents += row.spendCents;
      if (!existing.categories.includes(row.category)) {
        existing.categories.push(row.category);
      }
      userMap.set(row.username, existing);
    }

    const records: UsageRecord[] = [];
    for (const [username, data] of userMap) {
      records.push({
        vendor: "replit",
        vendorUsername: username,
        vendorEmail: null,
        spendCents: data.spendCents,
        tokens: null,
        periodStart: dateRange.start,
        periodEnd: dateRange.end,
        confidence: "low",
        sourceType: "scraper",
      });
    }

    return records;
  },

  async testConnection(config: VendorConfig): Promise<boolean> {
    const { sessionCookie } = config.credentials;
    if (!sessionCookie) return false;

    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({
        headless: false,
        args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
      });

      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      });

      await context.addCookies([
        {
          name: "connect.sid",
          value: sessionCookie,
          domain: ".replit.com",
          path: "/",
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ]);

      const page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
      });

      try {
        await page.goto("https://replit.com/~", {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        await page.waitForTimeout(3000);
        return !page.url().includes("/login");
      } finally {
        await browser.close();
      }
    } catch {
      return false;
    }
  },
};
