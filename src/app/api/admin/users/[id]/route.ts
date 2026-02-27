import { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { user, account } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod/v4";

const updateUserSchema = z.object({
  role: z.enum(["admin", "viewer"]).optional(),
  name: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
});

/** PUT /api/admin/users/[id] — update role, name, or reset password */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      { status: 400 }
    );
  }

  // Verify user exists and belongs to same tenant
  const existing = await db
    .select({ id: user.id, tenantId: user.tenantId })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);

  if (existing.length === 0 || existing[0].tenantId !== session.user.tenantId) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "User not found" } },
      { status: 404 }
    );
  }

  const { role, name, password } = parsed.data;

  // Update user fields
  const updates: Record<string, string | Date> = { updatedAt: new Date() };
  if (role) updates.role = role;
  if (name) updates.name = name;

  if (Object.keys(updates).length > 1) {
    await db.update(user).set(updates).where(eq(user.id, id));
  }

  // Reset password if provided
  if (password) {
    const passwordHash = await hashPassword(password);
    await db
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(
        and(
          eq(account.userId, id),
          eq(account.providerId, "credential")
        )
      );
  }

  return Response.json({ data: { id, role, name, updated: true } });
}
