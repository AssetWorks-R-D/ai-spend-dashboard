#!/usr/bin/env npx tsx
/**
 * Pulls Claude Admin API usage data and summarizes costs.
 */

const API_KEY = process.env.CLAUDE_ADMIN_API_KEY!;
const ORG_ID = process.env.CLAUDE_ORG_ID!;

// Pricing per million tokens (as of early 2026)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 1, output: 5 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
};

interface UsageResult {
  uncached_input_tokens: number;
  cache_read_input_tokens: number;
  cache_creation: { ephemeral_1h_input_tokens: number; ephemeral_5m_input_tokens: number };
  output_tokens: number;
  model: string | null;
  api_key_id: string | null;
}

interface UsageBucket {
  starting_at: string;
  ending_at: string;
  results: UsageResult[];
}

async function fetchUsage(startDate: string, endDate: string): Promise<UsageBucket[]> {
  const all: UsageBucket[] = [];
  let page: string | undefined;

  while (true) {
    const params = new URLSearchParams({
      starting_at: startDate,
      ending_at: endDate,
      bucket_width: "1d",
      limit: "31",
      "group_by[]": "model",
    });
    if (page) params.set("page", page);

    const res = await fetch(
      `https://api.anthropic.com/v1/organizations/usage_report/messages?${params}`,
      {
        headers: {
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
        },
      }
    );
    const json = await res.json() as { data: UsageBucket[]; has_more: boolean; next_page?: string };
    all.push(...json.data);
    if (!json.has_more) break;
    page = json.next_page;
  }
  return all;
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model] || { input: 3, output: 15 }; // default to sonnet pricing
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

async function main() {
  // Get org members
  const membersRes = await fetch("https://api.anthropic.com/v1/organizations/users?limit=50", {
    headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
  });
  const membersData = await membersRes.json() as { data: { id: string; email: string; name: string; role: string }[] };

  console.log("=== CLAUDE ORG MEMBERS ===");
  for (const m of membersData.data) {
    console.log(`  ${m.name} <${m.email}> (${m.role})`);
  }
  console.log(`  Total: ${membersData.data.length} members\n`);

  // Get usage for Jan + Feb 2026
  console.log("=== USAGE: Jan-Feb 2026 ===");
  const buckets = await fetchUsage("2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z");

  const modelTotals: Record<string, { input: number; output: number; cost: number; days: number }> = {};
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let activeDays = 0;

  for (const bucket of buckets) {
    if (bucket.results.length > 0) activeDays++;
    for (const r of bucket.results) {
      const model = r.model || "unknown";
      const input = r.uncached_input_tokens + r.cache_read_input_tokens +
        r.cache_creation.ephemeral_1h_input_tokens + r.cache_creation.ephemeral_5m_input_tokens;
      const output = r.output_tokens;
      const cost = estimateCost(model, input, output);

      if (!modelTotals[model]) modelTotals[model] = { input: 0, output: 0, cost: 0, days: 0 };
      modelTotals[model].input += input;
      modelTotals[model].output += output;
      modelTotals[model].cost += cost;
      modelTotals[model].days++;

      totalInput += input;
      totalOutput += output;
      totalCost += cost;
    }
  }

  for (const [model, t] of Object.entries(modelTotals).sort((a, b) => b[1].cost - a[1].cost)) {
    console.log(`  ${model}:`);
    console.log(`    Input: ${(t.input / 1_000_000).toFixed(2)}M tokens | Output: ${(t.output / 1_000_000).toFixed(2)}M tokens`);
    console.log(`    Est. cost: $${t.cost.toFixed(2)} (${t.days} active days)`);
  }

  console.log(`\n  TOTAL: ${(totalInput / 1_000_000).toFixed(2)}M in + ${(totalOutput / 1_000_000).toFixed(2)}M out`);
  console.log(`  Est. cost: $${totalCost.toFixed(2)} across ${activeDays} active days`);
}

main().catch(console.error);
