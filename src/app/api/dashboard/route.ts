import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getMemberAggregates, getTeamTotals, getVendorSummaries } from "@/lib/db/queries/usage";
import { getTenantBadgeCounts } from "@/lib/db/queries/badges";
import { periodBounds, currentPeriodKey } from "@/lib/utils/date-ranges";
import { db } from "@/lib/db";
import { tenants, usageRecords } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

/** GET /api/dashboard?period=2026-02 — aggregated dashboard data */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") || currentPeriodKey();
  const { start, end } = periodBounds(period);
  const tenantId = session.user.tenantId;

  const [teamTotals, memberCards, vendorSummaries, badgeCounts, tenant, availablePeriods] = await Promise.all([
    getTeamTotals(tenantId, start, end),
    getMemberAggregates(tenantId, start, end),
    getVendorSummaries(tenantId, start, end),
    getTenantBadgeCounts(tenantId),
    db
      .select({ leaderboardDisplayMode: tenants.leaderboardDisplayMode })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .then((rows) => rows[0]),
    db
      .selectDistinct({
        month: sql<string>`to_char(${usageRecords.periodStart} AT TIME ZONE 'UTC', 'YYYY-MM')`,
      })
      .from(usageRecords)
      .where(eq(usageRecords.tenantId, tenantId))
      .orderBy(sql`1`)
      .then((rows) => rows.map((r) => r.month)),
  ]);

  return Response.json({
    data: {
      teamTotals,
      memberCards: memberCards.map((m) => ({
        ...m,
        badgeCount: badgeCounts.get(m.memberId) || 0,
        suggestionSnippet: null,
      })),
      vendorSummaries,
      period,
      displayMode: tenant?.leaderboardDisplayMode || "named",
      availablePeriods,
    },
  });
}
