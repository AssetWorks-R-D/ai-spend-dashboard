/**
 * Daily sync DB operations: write daily delta records, resolve member IDs.
 *
 * Daily records use periodStart = periodEnd = todayUTC (midnight to 23:59:59.999).
 * Existing queries SUM(spendCents) WHERE periodStart >= X AND periodEnd <= Y
 * work for both old monthly and new daily records.
 */
import { type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import crypto from "crypto";
import {
  usageRecords,
  memberIdentities,
  members,
  tenants,
} from "../../src/lib/db/schema";
import type { ApiVendor, SourceType, Confidence } from "../../src/types/index";
import type { MemberDelta, MemberSnapshot } from "./snapshot-store";

// ─── Types ──────────────────────────────────────────────────────

export interface DailyRecord {
  vendor: ApiVendor;
  vendorEmail: string | null;
  vendorUsername: string | null;
  spendCents: number;
  tokens: number | null;
  confidence: Confidence;
  sourceType: SourceType;
}

// ─── Tenant Resolution ──────────────────────────────────────────

export async function getTenantId(db: NeonHttpDatabase): Promise<string> {
  const rows = await db.select({ id: tenants.id }).from(tenants).limit(1);
  if (rows.length === 0) throw new Error("No tenant found in DB");
  return rows[0].id;
}

// ─── Member Resolution ──────────────────────────────────────────

export async function buildMemberLookup(
  db: NeonHttpDatabase,
  tenantId: string,
  vendor: string,
): Promise<{ resolve: (email: string | null, username: string | null) => string | null; nameMap: Map<string, string> }> {
  // 1. Identity-based lookup (vendor-specific)
  const identityRows = await db
    .select({
      memberId: memberIdentities.memberId,
      vendorUsername: memberIdentities.vendorUsername,
      vendorEmail: memberIdentities.vendorEmail,
    })
    .from(memberIdentities)
    .where(eq(memberIdentities.vendor, vendor));

  const emailToMember = new Map<string, string>();
  const usernameToMember = new Map<string, string>();
  for (const id of identityRows) {
    if (id.vendorEmail) emailToMember.set(id.vendorEmail.toLowerCase(), id.memberId);
    if (id.vendorUsername) usernameToMember.set(id.vendorUsername.toLowerCase(), id.memberId);
  }

  // 2. Fallback: member email lookup
  const memberRows = await db
    .select({ id: members.id, email: members.email, name: members.name })
    .from(members)
    .where(eq(members.tenantId, tenantId));

  const memberEmailMap = new Map<string, string>();
  const nameMap = new Map<string, string>();
  for (const m of memberRows) {
    memberEmailMap.set(m.email.toLowerCase(), m.id);
    nameMap.set(m.id, m.name);
  }

  function resolve(email: string | null, username: string | null): string | null {
    return (
      (email ? emailToMember.get(email.toLowerCase()) : undefined) ??
      (username ? usernameToMember.get(username.toLowerCase()) : undefined) ??
      (email ? memberEmailMap.get(email.toLowerCase()) : undefined) ??
      null
    );
  }

  return { resolve, nameMap };
}

// ─── Daily Record Writing ───────────────────────────────────────

/**
 * Write daily delta records to usage_records.
 * Deletes any existing records for today + vendor + sourceType before inserting.
 */
export async function writeDailyRecords(
  db: NeonHttpDatabase,
  tenantId: string,
  records: DailyRecord[],
  options: { dryRun?: boolean } = {},
): Promise<number> {
  if (records.length === 0) return 0;

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  const vendor = records[0].vendor;
  const sourceTypes = [...new Set(records.map((r) => r.sourceType))];

  if (options.dryRun) return records.length;

  // Delete existing daily records for today
  await db
    .delete(usageRecords)
    .where(
      and(
        eq(usageRecords.tenantId, tenantId),
        eq(usageRecords.vendor, vendor),
        gte(usageRecords.periodStart, todayStart),
        lte(usageRecords.periodEnd, todayEnd),
        inArray(usageRecords.sourceType, sourceTypes),
      ),
    );

  // Resolve member IDs and insert
  const lookup = await buildMemberLookup(db, tenantId, vendor);

  for (const record of records) {
    const memberId = lookup.resolve(record.vendorEmail, record.vendorUsername);

    await db.insert(usageRecords).values({
      id: crypto.randomUUID(),
      tenantId,
      memberId,
      vendor: record.vendor,
      vendorUsername: record.vendorUsername,
      vendorEmail: record.vendorEmail,
      spendCents: record.spendCents,
      tokens: record.tokens,
      periodStart: todayStart,
      periodEnd: todayEnd,
      confidence: record.confidence,
      sourceType: record.sourceType,
    });
  }

  return records.length;
}

/**
 * Convert deltas + new members into DailyRecord array.
 */
export function deltasToRecords(
  vendor: ApiVendor,
  deltas: MemberDelta[],
  newMembers: MemberSnapshot[],
  sourceType: SourceType,
): DailyRecord[] {
  const records: DailyRecord[] = [];

  for (const d of deltas) {
    if (d.deltaSpendCents <= 0) continue; // Skip negative/zero deltas
    records.push({
      vendor,
      vendorEmail: d.vendorEmail,
      vendorUsername: d.vendorUsername,
      spendCents: d.deltaSpendCents,
      tokens: d.deltaTokens,
      confidence: "medium",
      sourceType,
    });
  }

  // New members get their full cumulative as today's delta
  for (const m of newMembers) {
    if (m.spendCents <= 0) continue;
    records.push({
      vendor,
      vendorEmail: m.vendorEmail,
      vendorUsername: m.vendorUsername,
      spendCents: m.spendCents,
      tokens: m.tokens,
      confidence: "medium",
      sourceType,
    });
  }

  return records;
}
