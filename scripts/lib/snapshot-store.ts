/**
 * Snapshot store: types, DB I/O, and diff logic for daily-diff sync.
 *
 * Each vendor snapshot is a JSONB blob stored in vendor_snapshots (one row per vendor).
 * Contains per-member cumulative data from the vendor's API or scraper.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { vendorSnapshots } from "../../src/lib/db/schema";
import type { ApiVendor } from "../../src/types/index";

// ─── Types ──────────────────────────────────────────────────────

/** Per-member cumulative data from a vendor */
export interface MemberSnapshot {
  /** Identifier for matching: email or username */
  vendorEmail: string | null;
  vendorUsername: string | null;
  /** Cumulative spend in cents for the current billing cycle */
  spendCents: number;
  /** Cumulative tokens (null if not tracked) */
  tokens: number | null;
  /** Per-member seat cost override (e.g., Claude standard=$25 vs premium=$100).
   *  When set, writeSeatCostRecords uses this instead of the vendor default. */
  seatCostCents?: number;
}

/** Full vendor snapshot: array of member data + metadata */
export interface VendorSnapshot {
  vendor: ApiVendor;
  members: MemberSnapshot[];
  /** Vendor-level totals for pool models (e.g., Replit) */
  vendorTotalCents?: number;
}

/** Delta for a single member between two snapshots */
export interface MemberDelta {
  vendorEmail: string | null;
  vendorUsername: string | null;
  /** Spend delta in cents (positive = new spend) */
  deltaSpendCents: number;
  /** Token delta (null if not tracked) */
  deltaTokens: number | null;
  /** Whether a billing reset was detected */
  billingReset: boolean;
}

/** Result of computing diffs between two snapshots */
export interface SnapshotDiff {
  vendor: ApiVendor;
  deltas: MemberDelta[];
  /** New members not in previous snapshot */
  newMembers: MemberSnapshot[];
  /** Vendor-level delta for pool models */
  vendorTotalDeltaCents?: number;
}

// ─── DB Operations ──────────────────────────────────────────────

export function createDb() {
  const sql = neon(process.env.DATABASE_URL as string);
  return drizzle(sql);
}

/**
 * Load the diff base for computing deltas.
 * Returns `previous_snapshot` (end-of-prior-day state) so that multiple
 * runs in the same day always produce the full day's accumulation.
 * Falls back to `snapshot` if no previous_snapshot exists (first day).
 */
export async function loadDiffBase(
  db: NeonHttpDatabase,
  vendor: ApiVendor,
): Promise<VendorSnapshot | null> {
  const rows = await db
    .select()
    .from(vendorSnapshots)
    .where(eq(vendorSnapshots.vendor, vendor))
    .limit(1);

  if (rows.length === 0) return null;

  // Prefer previous_snapshot (yesterday's final state) for accurate diffs
  const prev = rows[0].previousSnapshot as VendorSnapshot | null;
  if (prev) return prev;

  // First day: no previous_snapshot yet, use current snapshot
  return rows[0].snapshot as VendorSnapshot;
}

/**
 * Save a new snapshot. Handles day rollover:
 * - If captured_at is from a prior day: rotate snapshot → previous_snapshot
 * - If captured_at is from today: just update snapshot (don't touch previous_snapshot)
 * This ensures previous_snapshot always holds end-of-prior-day state.
 */
export async function saveSnapshot(
  db: NeonHttpDatabase,
  vendor: ApiVendor,
  snapshot: VendorSnapshot,
): Promise<void> {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const existing = await db
    .select({
      vendor: vendorSnapshots.vendor,
      snapshot: vendorSnapshots.snapshot,
      capturedAt: vendorSnapshots.capturedAt,
    })
    .from(vendorSnapshots)
    .where(eq(vendorSnapshots.vendor, vendor))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    const capturedAt = row.capturedAt ? new Date(row.capturedAt) : new Date(0);
    const isFromToday = capturedAt >= todayStart;

    if (isFromToday) {
      // Same day: just update snapshot, keep previous_snapshot unchanged
      await db
        .update(vendorSnapshots)
        .set({ snapshot, capturedAt: now })
        .where(eq(vendorSnapshots.vendor, vendor));
    } else {
      // New day: rotate current snapshot → previous_snapshot
      await db
        .update(vendorSnapshots)
        .set({
          previousSnapshot: row.snapshot, // yesterday's final state
          snapshot,
          capturedAt: now,
        })
        .where(eq(vendorSnapshots.vendor, vendor));
    }
  } else {
    // First ever run: insert with no previous_snapshot
    await db.insert(vendorSnapshots).values({
      vendor,
      snapshot,
      capturedAt: now,
    });
  }
}

// ─── Diff Logic ─────────────────────────────────────────────────

/** Create a lookup key for a member from their identifiers */
function memberKey(m: { vendorEmail: string | null; vendorUsername: string | null }): string {
  return (m.vendorEmail?.toLowerCase() || m.vendorUsername?.toLowerCase() || "unknown").trim();
}

/**
 * Compute per-member deltas between current and previous snapshots.
 * Handles billing resets: when currentCumulative < previousCumulative,
 * the delta is currentCumulative (new cycle started).
 */
export function computeDiff(
  current: VendorSnapshot,
  previous: VendorSnapshot,
): SnapshotDiff {
  const prevMap = new Map<string, MemberSnapshot>();
  for (const m of previous.members) {
    prevMap.set(memberKey(m), m);
  }

  const deltas: MemberDelta[] = [];
  const newMembers: MemberSnapshot[] = [];

  for (const curr of current.members) {
    const key = memberKey(curr);
    const prev = prevMap.get(key);

    if (!prev) {
      // New member — no previous data
      newMembers.push(curr);
      continue;
    }

    // Billing reset detection: current < previous means new billing cycle
    const billingReset = curr.spendCents < prev.spendCents;
    const deltaSpendCents = billingReset
      ? curr.spendCents // New cycle: treat current as the full delta
      : curr.spendCents - prev.spendCents;

    // Skip zero deltas (no change since last sync)
    if (deltaSpendCents === 0) continue;

    const deltaTokens =
      curr.tokens !== null && prev.tokens !== null
        ? (billingReset ? curr.tokens : curr.tokens - prev.tokens)
        : null;

    deltas.push({
      vendorEmail: curr.vendorEmail,
      vendorUsername: curr.vendorUsername,
      deltaSpendCents,
      deltaTokens,
      billingReset,
    });
  }

  // Vendor-level delta (for pool models like Replit)
  let vendorTotalDeltaCents: number | undefined;
  if (current.vendorTotalCents !== undefined && previous.vendorTotalCents !== undefined) {
    const resetPool = current.vendorTotalCents < previous.vendorTotalCents;
    vendorTotalDeltaCents = resetPool
      ? current.vendorTotalCents
      : current.vendorTotalCents - previous.vendorTotalCents;
  }

  return {
    vendor: current.vendor,
    deltas,
    newMembers,
    vendorTotalDeltaCents,
  };
}
