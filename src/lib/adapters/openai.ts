import type { VendorAdapter, VendorConfig, UsageRecord } from "./types";
import type { DateRange } from "@/types";

/**
 * OpenAI pricing per 1M tokens (as of Feb 2026).
 * Used to estimate per-user spend from token counts since the
 * Costs endpoint doesn't support per-user breakdowns.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // GPT-4o family
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-2024-11-20": { input: 2.5, output: 10 },
  "gpt-4o-2024-08-06": { input: 2.5, output: 10 },
  "gpt-4o-2024-05-13": { input: 5, output: 15 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o-mini-2024-07-18": { input: 0.15, output: 0.6 },
  // GPT-4.1 family
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  // o-series reasoning
  "o1": { input: 15, output: 60 },
  "o1-mini": { input: 1.1, output: 4.4 },
  "o1-pro": { input: 150, output: 600 },
  "o3": { input: 10, output: 40 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "o4-mini": { input: 1.1, output: 4.4 },
  // GPT-4 legacy
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4": { input: 30, output: 60 },
  // GPT-3.5
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  // Embeddings
  "text-embedding-3-large": { input: 0.13, output: 0 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-ada-002": { input: 0.1, output: 0 },
};

/** Default pricing for unknown models: ~$5/1M blended */
const DEFAULT_PRICING = { input: 3, output: 12 };

function getModelPricing(model: string): { input: number; output: number } {
  // Try exact match first, then prefix match
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(key)) return pricing;
  }
  return DEFAULT_PRICING;
}

function estimateSpendCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getModelPricing(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 100); // dollars → cents
}

interface OpenAIUsageBucket {
  input_tokens?: number;
  output_tokens?: number;
  input_cached_tokens?: number;
  num_model_requests?: number;
  user_id?: string | null;
  model?: string | null;
}

interface OpenAIUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export const openaiAdapter: VendorAdapter = {
  vendor: "openai",

  async fetchUsageData(config: VendorConfig, dateRange: DateRange): Promise<UsageRecord[]> {
    const { adminApiKey } = config.credentials;
    const headers = { Authorization: `Bearer ${adminApiKey}` };

    const startTime = Math.floor(dateRange.start.getTime() / 1000);
    const endTime = Math.floor(dateRange.end.getTime() / 1000);

    // 1. Fetch org users for ID→email/name mapping
    const userMap = new Map<string, OpenAIUser>();
    let usersUrl: string | null = "https://api.openai.com/v1/organization/users?limit=100";
    while (usersUrl) {
      const res: Response = await fetch(usersUrl, { headers });
      if (!res.ok) throw new Error(`OpenAI Users API returned ${res.status}: ${res.statusText}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      for (const u of data.data || []) {
        userMap.set(u.id, u);
      }
      usersUrl = data.has_more ? `https://api.openai.com/v1/organization/users?limit=100&after=${data.last_id}` : null;
    }

    // 2. Fetch completions usage grouped by user_id + model
    const perUser = new Map<string, { inputTokens: number; outputTokens: number; totalTokens: number; spendCents: number }>();
    let page: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const url = new URL("https://api.openai.com/v1/organization/usage/completions");
      url.searchParams.set("start_time", String(startTime));
      url.searchParams.set("end_time", String(endTime));
      url.searchParams.set("bucket_width", "1d");
      url.searchParams.set("group_by[]", "user_id");
      url.searchParams.append("group_by[]", "model");
      url.searchParams.set("limit", "30");
      if (page) url.searchParams.set("page", page);

      const res = await fetch(url.toString(), { headers });
      if (!res.ok) throw new Error(`OpenAI Usage API returned ${res.status}: ${res.statusText}`);
      const data = await res.json();

      for (const bucket of data.data || []) {
        for (const result of bucket.results || []) {
          const r = result as OpenAIUsageBucket;
          const userId = r.user_id;
          if (!userId) continue;

          const inputTokens = (r.input_tokens || 0);
          const outputTokens = (r.output_tokens || 0);
          const model = r.model || "unknown";

          const existing = perUser.get(userId) || { inputTokens: 0, outputTokens: 0, totalTokens: 0, spendCents: 0 };
          existing.inputTokens += inputTokens;
          existing.outputTokens += outputTokens;
          existing.totalTokens += inputTokens + outputTokens;
          existing.spendCents += estimateSpendCents(model, inputTokens, outputTokens);
          perUser.set(userId, existing);
        }
      }

      hasMore = data.has_more === true;
      page = data.next_page || null;
    }

    // 3. Also fetch embeddings usage (same pattern)
    page = null;
    hasMore = true;
    while (hasMore) {
      const url = new URL("https://api.openai.com/v1/organization/usage/embeddings");
      url.searchParams.set("start_time", String(startTime));
      url.searchParams.set("end_time", String(endTime));
      url.searchParams.set("bucket_width", "1d");
      url.searchParams.set("group_by[]", "user_id");
      url.searchParams.append("group_by[]", "model");
      url.searchParams.set("limit", "30");
      if (page) url.searchParams.set("page", page);

      const res = await fetch(url.toString(), { headers });
      if (!res.ok) break; // embeddings may not be available
      const data = await res.json();

      for (const bucket of data.data || []) {
        for (const result of bucket.results || []) {
          const r = result as OpenAIUsageBucket;
          const userId = r.user_id;
          if (!userId) continue;

          const inputTokens = (r.input_tokens || 0);
          const model = r.model || "text-embedding-3-small";

          const existing = perUser.get(userId) || { inputTokens: 0, outputTokens: 0, totalTokens: 0, spendCents: 0 };
          existing.inputTokens += inputTokens;
          existing.totalTokens += inputTokens;
          existing.spendCents += estimateSpendCents(model, inputTokens, 0);
          perUser.set(userId, existing);
        }
      }

      hasMore = data.has_more === true;
      page = data.next_page || null;
    }

    // 4. Build usage records
    const records: UsageRecord[] = [];
    for (const [userId, data] of perUser) {
      const user = userMap.get(userId);
      records.push({
        vendor: "openai",
        vendorUsername: user?.name || null,
        vendorEmail: user?.email || null,
        spendCents: data.spendCents,
        tokens: data.totalTokens > 0 ? data.totalTokens : null,
        periodStart: dateRange.start,
        periodEnd: dateRange.end,
        confidence: "medium", // estimated from token pricing
        sourceType: "api",
      });
    }

    return records;
  },

  async testConnection(config: VendorConfig): Promise<boolean> {
    const { adminApiKey } = config.credentials;
    if (!adminApiKey) return false;

    try {
      const res = await fetch("https://api.openai.com/v1/organization/users?limit=1", {
        headers: { Authorization: `Bearer ${adminApiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
