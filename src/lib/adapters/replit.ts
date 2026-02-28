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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      // Test the cookie with a lightweight GraphQL query
      const res = await fetch("https://replit.com/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `connect.sid=${sessionCookie}`,
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          query: "query { currentUser { id username } }",
        }),
        signal: controller.signal,
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data?.data?.currentUser?.id;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  },
};
