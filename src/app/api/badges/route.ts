import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getMemberBadges, computeBadgeEligibility, BADGE_DEFINITIONS } from "@/lib/db/queries/badges";

/** GET /api/badges?memberId=X — get earned badges */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId");

  if (!memberId) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "memberId is required" } },
      { status: 400 }
    );
  }

  const earned = await getMemberBadges(memberId);

  return Response.json({
    data: {
      earned,
      definitions: BADGE_DEFINITIONS,
    },
  });
}

/** POST /api/badges — compute and award badges for a member */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const body = await request.json();
  const { memberId } = body;

  if (!memberId) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "memberId is required" } },
      { status: 400 }
    );
  }

  const newBadges = await computeBadgeEligibility(session.user.tenantId, memberId);

  return Response.json({
    data: { newBadges },
  });
}
