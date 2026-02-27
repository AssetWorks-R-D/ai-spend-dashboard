import { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { usageRecords, members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "crypto";

const createEntrySchema = z.object({
  memberId: z.string().min(1),
  vendor: z.string().default("replit"),
  spendDollars: z.number().min(0),
  tokens: z.number().int().nullable().optional(),
  periodStart: z.string(),
  periodEnd: z.string(),
});

/** GET /api/manual-entry — list manual entries for tenant */
export async function GET() {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;

  const entries = await db
    .select({
      id: usageRecords.id,
      memberId: usageRecords.memberId,
      memberName: members.name,
      vendor: usageRecords.vendor,
      spendCents: usageRecords.spendCents,
      tokens: usageRecords.tokens,
      periodStart: usageRecords.periodStart,
      periodEnd: usageRecords.periodEnd,
      createdAt: usageRecords.createdAt,
      createdBy: usageRecords.createdBy,
    })
    .from(usageRecords)
    .leftJoin(members, eq(usageRecords.memberId, members.id))
    .where(
      and(
        eq(usageRecords.tenantId, session.user.tenantId),
        eq(usageRecords.sourceType, "manual")
      )
    )
    .orderBy(usageRecords.createdAt);

  return Response.json({ data: entries });
}

/** POST /api/manual-entry — create manual usage record */
export async function POST(request: NextRequest) {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;

  const body = await request.json();
  const parsed = createEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const { memberId, vendor, spendDollars, tokens, periodStart, periodEnd } = parsed.data;

  // Verify member belongs to tenant
  const member = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.id, memberId),
        eq(members.tenantId, session.user.tenantId)
      )
    )
    .limit(1);

  if (member.length === 0) {
    return Response.json(
      { error: { code: "INVALID_MEMBER", message: "Member not found in your organization" } },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  await db.insert(usageRecords).values({
    id,
    tenantId: session.user.tenantId,
    memberId,
    vendor,
    spendCents: Math.round(spendDollars * 100),
    tokens: tokens ?? null,
    periodStart: new Date(periodStart),
    periodEnd: new Date(periodEnd),
    confidence: "medium",
    sourceType: "manual",
    createdBy: session.user.id,
  });

  return Response.json({ data: { id } }, { status: 201 });
}
