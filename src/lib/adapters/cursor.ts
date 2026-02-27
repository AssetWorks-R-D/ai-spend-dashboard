import type { VendorAdapter, VendorConfig, UsageRecord } from "./types";
import type { DateRange } from "@/types";

/** Cursor Admin API uses Basic Auth: apiKey as username, empty password */
function basicAuthHeader(apiKey: string): string {
  return `Basic ${btoa(`${apiKey}:`)}`;
}

/**
 * Estimate token burn from spend.
 * Cursor primarily uses Claude Sonnet under the hood.
 * Blended rate assuming ~3:1 input:output ratio:
 *   input: ~$3/1M tokens, output: ~$15/1M tokens
 *   weighted avg ≈ $6/1M tokens
 */
const BLENDED_COST_PER_MILLION_TOKENS = 6; // dollars

function estimateTokensFromSpendCents(spendCents: number): number {
  if (spendCents <= 0) return 0;
  const dollars = spendCents / 100;
  return Math.round((dollars / BLENDED_COST_PER_MILLION_TOKENS) * 1_000_000);
}

export const cursorAdapter: VendorAdapter = {
  vendor: "cursor",

  async fetchUsageData(config: VendorConfig, dateRange: DateRange): Promise<UsageRecord[]> {
    const { apiKey } = config.credentials;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const headers = {
      Authorization: basicAuthHeader(apiKey),
      "Content-Type": "application/json",
    };

    try {
      const spendRes = await fetch("https://api.cursor.com/teams/spend", {
        method: "POST",
        headers,
        body: JSON.stringify({
          searchTerm: "",
          sortBy: "amount",
          sortDirection: "desc",
          page: 1,
          pageSize: 100,
        }),
        signal: controller.signal,
      });

      if (!spendRes.ok) {
        throw new Error(`Cursor API returned ${spendRes.status}: ${spendRes.statusText}`);
      }

      const spendData = await spendRes.json();

      const records: UsageRecord[] = [];

      for (const member of spendData.teamMemberSpend || []) {
        const totalSpendCents = (member.spendCents || 0) + (member.includedSpendCents || 0);
        records.push({
          vendor: "cursor",
          vendorUsername: member.name || null,
          vendorEmail: member.email || null,
          spendCents: totalSpendCents,
          tokens: estimateTokensFromSpendCents(totalSpendCents),
          periodStart: dateRange.start,
          periodEnd: dateRange.end,
          confidence: totalSpendCents > 0 ? "medium" : "high",
          sourceType: "api",
        });
      }

      return records;
    } finally {
      clearTimeout(timeout);
    }
  },

  async testConnection(config: VendorConfig): Promise<boolean> {
    const { apiKey } = config.credentials;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch("https://api.cursor.com/teams/members", {
        headers: {
          Authorization: basicAuthHeader(apiKey),
        },
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  },
};
