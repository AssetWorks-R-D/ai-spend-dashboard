import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getLeaderboardRankings } from "@/lib/db/queries/usage";
import { getTenantBadgeCounts } from "@/lib/db/queries/badges";
import { periodBounds, currentPeriodKey, previousPeriod } from "@/lib/utils/date-ranges";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** GET /api/leaderboard?period=2026-02 */
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
  const tenantId = session.user.tenantId;

  const currentBounds = periodBounds(period);
  const prevKey = previousPeriod(period);
  const prevBounds = periodBounds(prevKey);

  const [rankings, badgeCounts, tenant] = await Promise.all([
    getLeaderboardRankings(
      tenantId,
      currentBounds.start,
      currentBounds.end,
      prevBounds.start,
      prevBounds.end
    ),
    getTenantBadgeCounts(tenantId),
    db
      .select({ leaderboardDisplayMode: tenants.leaderboardDisplayMode })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .then((rows) => rows[0]),
  ]);

  // Attach badge counts to rankings
  const enriched = rankings.map((r) => ({
    ...r,
    badgeCount: badgeCounts.get(r.memberId) || 0,
  }));

  return Response.json({
    data: {
      rankings: enriched,
      displayMode: tenant?.leaderboardDisplayMode || "named",
      period,
    },
  });
}
