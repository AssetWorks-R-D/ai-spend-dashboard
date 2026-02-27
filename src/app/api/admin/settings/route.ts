import { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const updateSettingsSchema = z.object({
  leaderboardDisplayMode: z.enum(["named", "initialed", "anonymous"]),
});

/** GET /api/admin/settings — get tenant settings */
export async function GET() {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;

  const tenant = await db
    .select({
      leaderboardDisplayMode: tenants.leaderboardDisplayMode,
    })
    .from(tenants)
    .where(eq(tenants.id, session.user.tenantId))
    .then((rows) => rows[0]);

  if (!tenant) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Tenant not found" } },
      { status: 404 }
    );
  }

  return Response.json({ data: tenant });
}

/** PUT /api/admin/settings — update tenant settings */
export async function PUT(request: NextRequest) {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;

  const body = await request.json();
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      { status: 400 }
    );
  }

  await db
    .update(tenants)
    .set({
      leaderboardDisplayMode: parsed.data.leaderboardDisplayMode,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, session.user.tenantId));

  return Response.json({ data: { leaderboardDisplayMode: parsed.data.leaderboardDisplayMode } });
}
