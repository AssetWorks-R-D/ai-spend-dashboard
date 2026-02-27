import { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { usageRecords } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";

const updateEntrySchema = z.object({
  spendDollars: z.number().min(0).optional(),
  tokens: z.number().int().nullable().optional(),
});

/** PUT /api/manual-entry/[id] — update a manual entry */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      { status: 400 }
    );
  }

  // Verify the record exists, is manual, and belongs to tenant
  const existing = await db
    .select({ id: usageRecords.id })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.id, id),
        eq(usageRecords.tenantId, session.user.tenantId),
        eq(usageRecords.sourceType, "manual")
      )
    )
    .limit(1);

  if (existing.length === 0) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Manual entry not found" } },
      { status: 404 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.spendDollars !== undefined) {
    updates.spendCents = Math.round(parsed.data.spendDollars * 100);
  }
  if (parsed.data.tokens !== undefined) {
    updates.tokens = parsed.data.tokens;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(usageRecords).set(updates).where(eq(usageRecords.id, id));
  }

  return Response.json({ data: { id, updated: true } });
}

/** DELETE /api/manual-entry/[id] — delete a manual entry */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;
  const { id } = await params;

  const existing = await db
    .select({ id: usageRecords.id })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.id, id),
        eq(usageRecords.tenantId, session.user.tenantId),
        eq(usageRecords.sourceType, "manual")
      )
    )
    .limit(1);

  if (existing.length === 0) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Manual entry not found" } },
      { status: 404 }
    );
  }

  await db.delete(usageRecords).where(eq(usageRecords.id, id));

  return Response.json({ data: { id, deleted: true } });
}
