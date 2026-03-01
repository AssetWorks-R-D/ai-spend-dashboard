/**
 * Vendor snapshot fetchers for the daily-diff sync.
 *
 * These call the same vendor APIs as the Next.js adapters but are standalone
 * (no @/ path aliases) so they work in scripts run via `npx tsx`.
 *
 * Each fetcher returns a VendorSnapshot with OVERAGE ONLY (no seat costs).
 * Seat costs are written separately on the first sync of each calendar month
 * by the orchestrator (sync-all.ts). This prevents double-counting when
 * vendor billing cycles don't align with calendar months.
 */
import type { VendorSnapshot, MemberSnapshot } from "./snapshot-store";

// ─── Shared ─────────────────────────────────────────────────────

interface VendorCredentials {
  [key: string]: string;
}

// ─── Seat Cost Config ───────────────────────────────────────────

export interface SeatCostConfig {
  /** Default seat cost in cents (null = no seat cost, e.g., OpenAI) */
  defaultCents: number | null;
  /** Map of plan_type → cents for vendors with multiple tiers (e.g., Copilot) */
  tiers?: Record<string, number>;
}

/** Seat cost configuration per vendor. Used by the orchestrator to write
 *  seat-cost records on the first sync of each calendar month. */
export const VENDOR_SEAT_COSTS: Record<string, SeatCostConfig> = {
  cursor: { defaultCents: 4000 },          // $40/seat
  copilot: { defaultCents: 3900, tiers: { enterprise: 3900, business: 1900 } },
  openai: { defaultCents: null },           // Pure usage, no seat cost
  claude: { defaultCents: 2500, tiers: { standard: 2500, premium: 10000 } },
  replit: { defaultCents: 2500 },           // $25/seat
};

// ─── Cursor ─────────────────────────────────────────────────────

const CURSOR_SEAT_CENTS = 4000; // $40/seat
const BLENDED_RATE = 6; // $6/1M tokens

function estimateTokens(spendCents: number): number {
  if (spendCents <= 0) return 0;
  return Math.round((spendCents / 100 / BLENDED_RATE) * 1_000_000);
}

export async function fetchCursorSnapshot(credentials: VendorCredentials): Promise<VendorSnapshot> {
  const auth = `Basic ${Buffer.from(`${credentials.apiKey}:`).toString("base64")}`;
  const res = await fetch("https://api.cursor.com/teams/spend", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ searchTerm: "", sortBy: "amount", sortDirection: "desc", page: 1, pageSize: 100 }),
  });

  if (!res.ok) throw new Error(`Cursor API returned ${res.status}: ${res.statusText}`);
  const data = await res.json();

  const members: MemberSnapshot[] = [];
  for (const m of data.teamMemberSpend || []) {
    // Overage only — seat costs written separately on month boundary
    const overageCents = m.spendCents || 0;
    members.push({
      vendorEmail: m.email || null,
      vendorUsername: m.name || null,
      spendCents: overageCents,
      tokens: estimateTokens(overageCents),
    });
  }

  return { vendor: "cursor", members };
}

// ─── Copilot ────────────────────────────────────────────────────

export async function fetchCopilotSnapshot(credentials: VendorCredentials): Promise<VendorSnapshot> {
  const { organization, pat } = credentials;
  const headers = {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const allSeats: Array<{ assignee: { login: string; email?: string }; plan_type?: string }> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(
      `https://api.github.com/orgs/${organization}/copilot/billing/seats?per_page=100&page=${page}`,
      { headers },
    );
    if (!res.ok) throw new Error(`Copilot API returned ${res.status}: ${res.statusText}`);
    const data = await res.json();
    allSeats.push(...(data.seats || []));
    hasMore = (data.seats || []).length === 100;
    page++;
  }

  const members: MemberSnapshot[] = [];
  for (const seat of allSeats) {
    const login = seat.assignee?.login;
    if (!login) continue;
    // Copilot is pure subscription — no variable usage to track.
    // Seat costs written separately on month boundary.
    members.push({
      vendorEmail: seat.assignee?.email || null,
      vendorUsername: login,
      spendCents: 0,
      tokens: null,
    });
  }

  return { vendor: "copilot", members };
}

// ─── OpenAI ─────────────────────────────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "o1": { input: 15, output: 60 },
  "o1-mini": { input: 1.1, output: 4.4 },
  "o3": { input: 10, output: 40 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "o4-mini": { input: 1.1, output: 4.4 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};
const DEFAULT_PRICING = { input: 3, output: 12 };

function getModelPricing(model: string): { input: number; output: number } {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(key)) return pricing;
  }
  return DEFAULT_PRICING;
}

export async function fetchOpenAISnapshot(credentials: VendorCredentials): Promise<VendorSnapshot> {
  const { adminApiKey } = credentials;
  const headers = { Authorization: `Bearer ${adminApiKey}` };

  // Date range: current month UTC
  const now = new Date();
  const startTime = Math.floor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime() / 1000);
  const endTime = Math.floor(now.getTime() / 1000);

  // 1. Fetch org users
  const userMap = new Map<string, { name: string; email: string }>();
  let usersUrl: string | null = "https://api.openai.com/v1/organization/users?limit=100";
  while (usersUrl) {
    const res = await fetch(usersUrl, { headers });
    if (!res.ok) throw new Error(`OpenAI Users API returned ${res.status}: ${res.statusText}`);
    const data: Record<string, unknown> = await res.json();
    for (const u of (data.data as Array<{ id: string; name: string; email: string }>) || []) {
      userMap.set(u.id, { name: u.name, email: u.email });
    }
    usersUrl = data.has_more
      ? `https://api.openai.com/v1/organization/users?limit=100&after=${data.last_id}`
      : null;
  }

  // 2. Fetch completions usage
  const perUser = new Map<string, { tokens: number; spendCents: number }>();

  for (const endpoint of [
    "https://api.openai.com/v1/organization/usage/completions",
    "https://api.openai.com/v1/organization/usage/embeddings",
  ]) {
    let pageToken: string | null = null;
    let hasMore = true;
    while (hasMore) {
      const url = new URL(endpoint);
      url.searchParams.set("start_time", String(startTime));
      url.searchParams.set("end_time", String(endTime));
      url.searchParams.set("bucket_width", "1d");
      url.searchParams.set("group_by[]", "user_id");
      url.searchParams.append("group_by[]", "model");
      url.searchParams.set("limit", "30");
      if (pageToken) url.searchParams.set("page", pageToken);

      const res = await fetch(url.toString(), { headers });
      if (!res.ok) break;
      const data: Record<string, unknown> = await res.json();

      for (const bucket of (data.data as Array<{ results: Array<Record<string, unknown>> }>) || []) {
        for (const r of bucket.results || []) {
          const userId = r.user_id as string | null;
          if (!userId) continue;
          const inputTokens = (r.input_tokens as number) || 0;
          const outputTokens = (r.output_tokens as number) || 0;
          const model = (r.model as string) || "unknown";
          const pricing = getModelPricing(model);
          const cost = Math.round(((inputTokens / 1e6) * pricing.input + (outputTokens / 1e6) * pricing.output) * 100);
          const existing = perUser.get(userId) || { tokens: 0, spendCents: 0 };
          existing.tokens += inputTokens + outputTokens;
          existing.spendCents += cost;
          perUser.set(userId, existing);
        }
      }

      hasMore = (data.has_more as boolean) === true;
      pageToken = (data.next_page as string) || null;
    }
  }

  // 3. Build snapshot
  const members: MemberSnapshot[] = [];
  for (const [userId, data] of perUser) {
    const user = userMap.get(userId);
    members.push({
      vendorEmail: user?.email || null,
      vendorUsername: user?.name || null,
      spendCents: data.spendCents,
      tokens: data.tokens > 0 ? data.tokens : null,
    });
  }

  return { vendor: "openai", members };
}
