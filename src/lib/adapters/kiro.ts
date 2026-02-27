import type { VendorAdapter, VendorConfig, UsageRecord } from "./types";
import type { DateRange } from "@/types";

export const kiroAdapter: VendorAdapter = {
  vendor: "kiro",

  async fetchUsageData(config: VendorConfig, dateRange: DateRange): Promise<UsageRecord[]> {
    const { teamId, apiKey } = config.credentials;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const startDate = dateRange.start.toISOString().split("T")[0];
      const endDate = dateRange.end.toISOString().split("T")[0];

      const res = await fetch(
        `https://api.kiro.dev/v1/teams/${teamId}/usage?start=${startDate}&end=${endDate}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        throw new Error(`Kiro API returned ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const records: UsageRecord[] = [];

      for (const member of data.members || data.usage || []) {
        records.push({
          vendor: "kiro",
          vendorUsername: member.username || member.name || null,
          vendorEmail: member.email || null,
          spendCents: Math.round((member.spend || member.cost || 0) * 100),
          tokens: member.tokens ?? null,
          periodStart: dateRange.start,
          periodEnd: dateRange.end,
          confidence: "high",
          sourceType: "api",
        });
      }

      return records;
    } finally {
      clearTimeout(timeout);
    }
  },

  async testConnection(config: VendorConfig): Promise<boolean> {
    const { teamId, apiKey } = config.credentials;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(
        `https://api.kiro.dev/v1/teams/${teamId}/usage`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        }
      );
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  },
};
