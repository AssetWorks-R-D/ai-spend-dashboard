import type { VendorAdapter, VendorConfig, UsageRecord } from "./types";
import type { DateRange } from "@/types";

export const copilotAdapter: VendorAdapter = {
  vendor: "copilot",

  async fetchUsageData(config: VendorConfig, dateRange: DateRange): Promise<UsageRecord[]> {
    const { organization, pat } = config.credentials;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      // Fetch all seat assignments (paginated)
      const allSeats: Array<{
        assignee: { login: string; email?: string };
        plan_type?: string;
        last_activity_at?: string;
      }> = [];

      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const res = await fetch(
          `https://api.github.com/orgs/${organization}/copilot/billing/seats?per_page=100&page=${page}`,
          {
            headers: {
              Authorization: `Bearer ${pat}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
            signal: controller.signal,
          }
        );

        if (!res.ok) {
          throw new Error(`Copilot API returned ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        const seats = data.seats || [];
        allSeats.push(...seats);

        // If we got fewer than 100, we've reached the end
        hasMore = seats.length === 100;
        page++;
      }

      // Per-seat cost: enterprise = $39/seat/mo, business = $19/seat/mo
      const records: UsageRecord[] = [];

      for (const seat of allSeats) {
        const login = seat.assignee?.login;
        if (!login) continue;

        const isEnterprise = seat.plan_type === "enterprise";
        const seatCostCents = isEnterprise ? 3900 : 1900;

        records.push({
          vendor: "copilot",
          vendorUsername: login,
          vendorEmail: seat.assignee?.email || null,
          spendCents: seatCostCents,
          tokens: null,
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
    const { organization, pat } = config.credentials;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(
        `https://api.github.com/orgs/${organization}/copilot/billing/seats?per_page=1`,
        {
          headers: {
            Authorization: `Bearer ${pat}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
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
