import type { VendorAdapter, VendorConfig, UsageRecord } from "./types";
import type { DateRange } from "@/types";

export const replitAdapter: VendorAdapter = {
  vendor: "replit",

  async fetchUsageData(config: VendorConfig, dateRange: DateRange): Promise<UsageRecord[]> {
    const { sessionCookie, teamSlug } = config.credentials;

    // Replit requires Playwright (browser scraping) — only works locally.
    // Dynamic import so the adapter doesn't crash on Vercel where Playwright isn't installed.
    let scrapeReplitUsage: typeof import("@/lib/scrapers/replit").scrapeReplitUsage;
    let scrapeReplitUsageWithEdge: typeof import("@/lib/scrapers/replit").scrapeReplitUsageWithEdge;
    try {
      const mod = await import("@/lib/scrapers/replit");
      scrapeReplitUsage = mod.scrapeReplitUsage;
      scrapeReplitUsageWithEdge = mod.scrapeReplitUsageWithEdge;
    } catch {
      throw new Error("Replit sync requires Playwright (local only). Use scripts/seed-replit-data.ts on Vercel.");
    }

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
    // Replit uses browser-based scraping — we can only verify the cookie is set,
    // not test it server-side (Replit's cookie requires full browser session state).
    return !!sessionCookie;
  },
};
