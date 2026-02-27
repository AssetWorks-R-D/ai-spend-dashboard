import { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { members, memberIdentities, usageRecords } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "crypto";

const updateMemberSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email().optional(),
});

const linkIdentitySchema = z.object({
  vendor: z.enum(["cursor", "claude", "copilot", "kiro", "replit"]),
  vendorUsername: z.string().optional(),
  vendorEmail: z.string().optional(),
});

/** GET /api/members/[id] — get member with linked identities */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;
  const { id } = await params;

  const member = await db
    .select()
    .from(members)
    .where(and(eq(members.id, id), eq(members.tenantId, session.user.tenantId)))
    .limit(1);

  if (member.length === 0) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Member not found" } },
      { status: 404 }
    );
  }

  const identities = await db
    .select()
    .from(memberIdentities)
    .where(eq(memberIdentities.memberId, id));

  return Response.json({
    data: { ...member[0], identities },
  });
}

/** PUT /api/members/[id] — update member details */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;
  const { id } = await params;

  const body = await request.json();

  // Check if it's an identity link action
  if (body.vendor) {
    const parsed = linkIdentitySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
        { status: 400 }
      );
    }

    // Verify member belongs to tenant
    const member = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.id, id), eq(members.tenantId, session.user.tenantId)))
      .limit(1);

    if (member.length === 0) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Member not found" } },
        { status: 404 }
      );
    }

    const identityId = crypto.randomUUID();
    await db.insert(memberIdentities).values({
      id: identityId,
      memberId: id,
      vendor: parsed.data.vendor,
      vendorUsername: parsed.data.vendorUsername || null,
      vendorEmail: parsed.data.vendorEmail || null,
    });

    // Link matching unlinked usage records
    if (parsed.data.vendorEmail) {
      await db
        .update(usageRecords)
        .set({ memberId: id })
        .where(
          and(
            eq(usageRecords.tenantId, session.user.tenantId),
            eq(usageRecords.vendor, parsed.data.vendor),
            eq(usageRecords.vendorEmail, parsed.data.vendorEmail),
            isNull(usageRecords.memberId)
          )
        );
    }

    return Response.json({ data: { identityId, linked: true } });
  }

  // Otherwise it's a member update
  const parsed = updateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const existing = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, id), eq(members.tenantId, session.user.tenantId)))
    .limit(1);

  if (existing.length === 0) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Member not found" } },
      { status: 404 }
    );
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name) updates.name = parsed.data.name;
  if (parsed.data.email) updates.email = parsed.data.email;

  await db.update(members).set(updates).where(eq(members.id, id));

  return Response.json({ data: { id, updated: true } });
}

/** DELETE /api/members/[id] — delete a member identity link */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;
  const { id } = await params;

  const url = new URL(request.url);
  const identityId = url.searchParams.get("identityId");

  if (identityId) {
    // Unlink a specific vendor identity
    const identity = await db
      .select({ memberId: memberIdentities.memberId, vendor: memberIdentities.vendor })
      .from(memberIdentities)
      .where(eq(memberIdentities.id, identityId))
      .limit(1);

    if (identity.length === 0 || identity[0].memberId !== id) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Identity not found" } },
        { status: 404 }
      );
    }

    // Unlink usage records
    await db
      .update(usageRecords)
      .set({ memberId: null })
      .where(
        and(
          eq(usageRecords.tenantId, session.user.tenantId),
          eq(usageRecords.memberId, id),
          eq(usageRecords.vendor, identity[0].vendor)
        )
      );

    await db.delete(memberIdentities).where(eq(memberIdentities.id, identityId));

    return Response.json({ data: { unlinked: true } });
  }

  return Response.json(
    { error: { code: "MISSING_PARAM", message: "identityId query param required" } },
    { status: 400 }
  );
}
