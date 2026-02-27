import { db } from "@/lib/db";
import { badges, usageRecords, members } from "@/lib/db/schema";
import { eq, and, sql, isNotNull } from "drizzle-orm";
import crypto from "crypto";

export type BadgeType =
  | "ai_pioneer"
  | "token_titan"
  | "big_spender"
  | "multi_tool_master"
  | "early_adopter";

export interface BadgeDefinition {
  type: BadgeType;
  name: string;
  description: string;
  icon: string;
  criteria: string;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    type: "ai_pioneer",
    name: "AI Pioneer",
    description: "First to adopt a new AI tool",
    icon: "🚀",
    criteria: "First member to have usage in any vendor",
  },
  {
    type: "token_titan",
    name: "Token Titan",
    description: "Generated over 10M tokens in a single month",
    icon: "⚡",
    criteria: "10M+ tokens in any single month",
  },
  {
    type: "big_spender",
    name: "Big Spender",
    description: "Top spender for the month",
    icon: "💰",
    criteria: "Highest total spend in current period",
  },
  {
    type: "multi_tool_master",
    name: "Multi-Tool Master",
    description: "Active across 3 or more AI tools",
    icon: "🔧",
    criteria: "Usage in 3+ different vendors in a period",
  },
  {
    type: "early_adopter",
    name: "Early Adopter",
    description: "Among the first 5 members tracked",
    icon: "🌟",
    criteria: "One of the first 5 members with usage data",
  },
];

export interface EarnedBadge {
  id: string;
  badgeType: BadgeType;
  earnedAt: string;
  definition: BadgeDefinition;
}

/** Get all badges earned by a specific member */
export async function getMemberBadges(
  memberId: string
): Promise<EarnedBadge[]> {
  const earned = await db
    .select({
      id: badges.id,
      badgeType: badges.badgeType,
      earnedAt: badges.earnedAt,
    })
    .from(badges)
    .where(eq(badges.memberId, memberId));

  return earned.map((b) => ({
    id: b.id,
    badgeType: b.badgeType as BadgeType,
    earnedAt: b.earnedAt.toISOString(),
    definition: BADGE_DEFINITIONS.find((d) => d.type === b.badgeType)!,
  })).filter((b) => b.definition);
}

/** Get badge counts per member for a tenant */
export async function getTenantBadgeCounts(
  tenantId: string
): Promise<Map<string, number>> {
  const counts = await db
    .select({
      memberId: badges.memberId,
      count: sql<number>`count(*)`,
    })
    .from(badges)
    .where(eq(badges.tenantId, tenantId))
    .groupBy(badges.memberId);

  return new Map(counts.map((c) => [c.memberId, Number(c.count)]));
}

/** Compute and award any newly eligible badges for a member */
export async function computeBadgeEligibility(
  tenantId: string,
  memberId: string
): Promise<BadgeType[]> {
  // Get existing badges to avoid duplicates
  const existing = await db
    .select({ badgeType: badges.badgeType })
    .from(badges)
    .where(and(eq(badges.memberId, memberId), eq(badges.tenantId, tenantId)));

  const earnedTypes = new Set(existing.map((b) => b.badgeType));
  const newBadges: BadgeType[] = [];

  // Token Titan: 10M+ tokens total
  if (!earnedTypes.has("token_titan")) {
    const tokenResult = await db
      .select({
        total: sql<number | null>`sum(${usageRecords.tokens})`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.tenantId, tenantId),
          eq(usageRecords.memberId, memberId),
          isNotNull(usageRecords.tokens)
        )
      );
    const totalTokens = Number(tokenResult[0]?.total) || 0;
    if (totalTokens >= 10_000_000) {
      newBadges.push("token_titan");
    }
  }

  // Multi-Tool Master: active in 3+ vendors
  if (!earnedTypes.has("multi_tool_master")) {
    const vendorResult = await db
      .select({
        vendorCount: sql<number>`count(distinct ${usageRecords.vendor})`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.tenantId, tenantId),
          eq(usageRecords.memberId, memberId),
          sql`${usageRecords.spendCents} > 0`
        )
      );
    const vendorCount = Number(vendorResult[0]?.vendorCount) || 0;
    if (vendorCount >= 3) {
      newBadges.push("multi_tool_master");
    }
  }

  // Big Spender: highest spend of all members
  if (!earnedTypes.has("big_spender")) {
    const spendRank = await db
      .select({
        memberId: usageRecords.memberId,
        totalSpend: sql<number>`sum(${usageRecords.spendCents})`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.tenantId, tenantId),
          isNotNull(usageRecords.memberId)
        )
      )
      .groupBy(usageRecords.memberId)
      .orderBy(sql`sum(${usageRecords.spendCents}) desc`)
      .limit(1);

    if (spendRank[0]?.memberId === memberId) {
      newBadges.push("big_spender");
    }
  }

  // Early Adopter: among first 5 members with usage
  if (!earnedTypes.has("early_adopter")) {
    const earlyMembers = await db
      .select({
        memberId: members.id,
      })
      .from(members)
      .where(eq(members.tenantId, tenantId))
      .orderBy(members.createdAt)
      .limit(5);

    if (earlyMembers.some((m) => m.memberId === memberId)) {
      newBadges.push("early_adopter");
    }
  }

  // AI Pioneer: first member to use any vendor
  if (!earnedTypes.has("ai_pioneer")) {
    const firstUser = await db
      .select({
        memberId: usageRecords.memberId,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.tenantId, tenantId),
          isNotNull(usageRecords.memberId)
        )
      )
      .orderBy(usageRecords.periodStart)
      .limit(1);

    if (firstUser[0]?.memberId === memberId) {
      newBadges.push("ai_pioneer");
    }
  }

  // Insert new badges
  if (newBadges.length > 0) {
    await db.insert(badges).values(
      newBadges.map((badgeType) => ({
        id: crypto.randomUUID(),
        memberId,
        tenantId,
        badgeType,
      }))
    );
  }

  return newBadges;
}
