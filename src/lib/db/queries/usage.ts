import { db } from "@/lib/db";
import { usageRecords, members, vendorConfigs } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, isNotNull } from "drizzle-orm";
import type { VendorType } from "@/types";

const ALL_VENDORS: VendorType[] = ["cursor", "claude", "copilot", "kiro", "replit"];

export interface LeaderboardEntry {
  rank: number;
  memberId: string;
  memberName: string;
  memberEmail: string;
  totalSpendCents: number;
  totalTokens: number | null;
  previousRank: number | null;
  rankChange: number | null; // positive = climbed, 0 = steady, null = new entrant
  vendors: VendorBreakdown[];
  badgeCount: number;
}

export interface VendorBreakdown {
  vendor: VendorType;
  spendCents: number;
  tokens: number | null;
  confidence: string;
  sourceType: string;
}

export interface MemberAggregate {
  memberId: string;
  memberName: string;
  memberEmail: string;
  totalSpendCents: number;
  totalTokens: number | null;
  vendors: VendorBreakdown[];
}

export interface TeamTotals {
  totalSpendCents: number;
  totalTokens: number | null;
  activeMemberCount: number;
}

export interface VendorSummary {
  vendor: VendorType;
  totalSpendCents: number;
  totalTokens: number | null;
  seatCount: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  sourceType: string;
}

/** Get per-member aggregates for a tenant within a date range */
export async function getMemberAggregates(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<MemberAggregate[]> {
  // Get all usage records in the period, joined with member info
  const records = await db
    .select({
      memberId: usageRecords.memberId,
      memberName: members.name,
      memberEmail: members.email,
      vendor: usageRecords.vendor,
      spendCents: usageRecords.spendCents,
      tokens: usageRecords.tokens,
      confidence: usageRecords.confidence,
      sourceType: usageRecords.sourceType,
    })
    .from(usageRecords)
    .leftJoin(members, eq(usageRecords.memberId, members.id))
    .where(
      and(
        eq(usageRecords.tenantId, tenantId),
        gte(usageRecords.periodStart, periodStart),
        lte(usageRecords.periodEnd, periodEnd),
        isNotNull(usageRecords.memberId)
      )
    );

  // Group by member
  const memberMap = new Map<string, MemberAggregate>();

  for (const r of records) {
    if (!r.memberId) continue;

    if (!memberMap.has(r.memberId)) {
      memberMap.set(r.memberId, {
        memberId: r.memberId,
        memberName: r.memberName || "Unknown",
        memberEmail: r.memberEmail || "",
        totalSpendCents: 0,
        totalTokens: null,
        vendors: [],
      });
    }

    const agg = memberMap.get(r.memberId)!;
    agg.totalSpendCents += r.spendCents;
    if (r.tokens !== null) {
      agg.totalTokens = (agg.totalTokens || 0) + r.tokens;
    }

    // Check if vendor already exists in breakdown
    const existing = agg.vendors.find((v) => v.vendor === r.vendor);
    if (existing) {
      existing.spendCents += r.spendCents;
      if (r.tokens !== null) {
        existing.tokens = (existing.tokens || 0) + r.tokens;
      }
    } else {
      agg.vendors.push({
        vendor: r.vendor as VendorType,
        spendCents: r.spendCents,
        tokens: r.tokens,
        confidence: r.confidence,
        sourceType: r.sourceType,
      });
    }
  }

  // Add missing vendors with zero values
  for (const agg of memberMap.values()) {
    for (const vendor of ALL_VENDORS) {
      if (!agg.vendors.find((v) => v.vendor === vendor)) {
        agg.vendors.push({
          vendor,
          spendCents: 0,
          tokens: 0,
          confidence: "high",
          sourceType: vendor === "replit" ? "manual" : "api",
        });
      }
    }
  }

  // Sort by total spend descending
  return Array.from(memberMap.values()).sort(
    (a, b) => b.totalSpendCents - a.totalSpendCents
  );
}

/** Get team-level totals */
export async function getTeamTotals(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<TeamTotals> {
  const result = await db
    .select({
      totalSpend: sql<number>`coalesce(sum(${usageRecords.spendCents}), 0)`,
      totalTokens: sql<number | null>`sum(${usageRecords.tokens})`,
      activeMembers: sql<number>`count(distinct ${usageRecords.memberId})`,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.tenantId, tenantId),
        gte(usageRecords.periodStart, periodStart),
        lte(usageRecords.periodEnd, periodEnd),
        isNotNull(usageRecords.memberId)
      )
    );

  const row = result[0];
  return {
    totalSpendCents: Number(row?.totalSpend) || 0,
    totalTokens: row?.totalTokens !== null ? Number(row.totalTokens) : null,
    activeMemberCount: Number(row?.activeMembers) || 0,
  };
}

/** Get per-vendor summaries with sync metadata */
export async function getVendorSummaries(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<VendorSummary[]> {
  // Usage aggregates per vendor
  const usage = await db
    .select({
      vendor: usageRecords.vendor,
      totalSpend: sql<number>`coalesce(sum(${usageRecords.spendCents}), 0)`,
      totalTokens: sql<number | null>`sum(${usageRecords.tokens})`,
      seatCount: sql<number>`count(distinct ${usageRecords.memberId})`,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.tenantId, tenantId),
        gte(usageRecords.periodStart, periodStart),
        lte(usageRecords.periodEnd, periodEnd)
      )
    )
    .groupBy(usageRecords.vendor);

  // Sync metadata
  const configs = await db
    .select({
      vendor: vendorConfigs.vendor,
      lastSyncAt: vendorConfigs.lastSyncAt,
      lastSyncStatus: vendorConfigs.lastSyncStatus,
    })
    .from(vendorConfigs)
    .where(eq(vendorConfigs.tenantId, tenantId));

  const usageMap = new Map(usage.map((u) => [u.vendor, u]));
  const configMap = new Map(configs.map((c) => [c.vendor, c]));

  return ALL_VENDORS.map((vendor) => {
    const u = usageMap.get(vendor);
    const c = configMap.get(vendor);
    return {
      vendor,
      totalSpendCents: Number(u?.totalSpend) || 0,
      totalTokens: u?.totalTokens !== null && u?.totalTokens !== undefined ? Number(u.totalTokens) : null,
      seatCount: Number(u?.seatCount) || 0,
      lastSyncAt: c?.lastSyncAt?.toISOString() ?? null,
      lastSyncStatus: c?.lastSyncStatus ?? null,
      sourceType: vendor === "replit" ? "manual" : "api",
    };
  });
}

/** Get leaderboard rankings with previous-period comparison */
export async function getLeaderboardRankings(
  tenantId: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  previousPeriodStart: Date,
  previousPeriodEnd: Date
): Promise<LeaderboardEntry[]> {
  const [currentMembers, previousMembers] = await Promise.all([
    getMemberAggregates(tenantId, currentPeriodStart, currentPeriodEnd),
    getMemberAggregates(tenantId, previousPeriodStart, previousPeriodEnd),
  ]);

  // Build previous period rank map
  const prevRankMap = new Map<string, number>();
  previousMembers.forEach((m, i) => {
    prevRankMap.set(m.memberId, i + 1);
  });

  return currentMembers.map((m, i) => {
    const rank = i + 1;
    const previousRank = prevRankMap.get(m.memberId) ?? null;
    let rankChange: number | null = null;
    if (previousRank !== null) {
      rankChange = previousRank - rank; // positive = climbed
    }

    return {
      rank,
      memberId: m.memberId,
      memberName: m.memberName,
      memberEmail: m.memberEmail,
      totalSpendCents: m.totalSpendCents,
      totalTokens: m.totalTokens,
      previousRank,
      rankChange,
      vendors: m.vendors,
      badgeCount: 0, // populated later when badge system is built
    };
  });
}
