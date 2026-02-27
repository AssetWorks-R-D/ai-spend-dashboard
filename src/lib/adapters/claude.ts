import type { VendorAdapter, VendorConfig, UsageRecord } from "./types";
import type { DateRange } from "@/types";

/** Get all dates between start and end as YYYY-MM-DD strings */
function dateRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function adminHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
}

interface ClaudeCodeDayRecord {
  actor?: { email_address?: string; type?: string };
  model_breakdown?: {
    tokens?: { input?: number; output?: number; cache_read?: number; cache_creation?: number };
    estimated_cost?: { amount?: number };
  }[];
}

export const claudeAdapter: VendorAdapter = {
  vendor: "claude",

  async fetchUsageData(config: VendorConfig, range: DateRange): Promise<UsageRecord[]> {
    const { apiKey } = config.credentials;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const days = dateRange(range.start, range.end);
      const userMap = new Map<string, { spendCents: number; tokens: number }>();

      for (const day of days) {
        let page: string | null = null;
        let hasMore = true;

        while (hasMore) {
          const url = new URL("https://api.anthropic.com/v1/organizations/usage_report/claude_code");
          url.searchParams.set("starting_at", day);
          url.searchParams.set("limit", "1000");
          if (page) url.searchParams.set("page", page);

          const res = await fetch(url.toString(), {
            headers: adminHeaders(apiKey),
            signal: controller.signal,
          });

          if (!res.ok) {
            throw new Error(`Claude API returned ${res.status}: ${res.statusText}`);
          }

          const data = await res.json();

          for (const record of data.data || []) {
            const r = record as ClaudeCodeDayRecord;
            const email = r.actor?.email_address;
            if (!email) continue;

            const existing = userMap.get(email) || { spendCents: 0, tokens: 0 };

            for (const model of r.model_breakdown || []) {
              existing.spendCents += model.estimated_cost?.amount || 0;
              const t = model.tokens;
              if (t) {
                existing.tokens +=
                  (t.input || 0) + (t.output || 0) + (t.cache_read || 0) + (t.cache_creation || 0);
              }
            }

            userMap.set(email, existing);
          }

          hasMore = data.has_more === true;
          page = data.next_page || null;
        }
      }

      const records: UsageRecord[] = [];
      for (const [email, data] of userMap) {
        records.push({
          vendor: "claude",
          vendorUsername: null,
          vendorEmail: email,
          spendCents: data.spendCents,
          tokens: data.tokens > 0 ? data.tokens : null,
          periodStart: range.start,
          periodEnd: range.end,
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
    const { apiKey } = config.credentials;
    if (!apiKey) return false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      // Try the admin org endpoint first (works with admin keys)
      const res = await fetch("https://api.anthropic.com/v1/organizations/me", {
        headers: adminHeaders(apiKey),
        signal: controller.signal,
      });
      if (res.ok) return true;

      // Fall back to a simple messages probe (works with regular API keys)
      const probeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          ...adminHeaders(apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: controller.signal,
      });
      return probeRes.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  },
};
