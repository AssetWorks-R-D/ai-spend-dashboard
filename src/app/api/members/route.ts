import { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "crypto";

const createMemberSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
});

/** GET /api/members — list all members in tenant */
export async function GET() {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;

  const memberList = await db
    .select({
      id: members.id,
      name: members.name,
      email: members.email,
      createdAt: members.createdAt,
    })
    .from(members)
    .where(eq(members.tenantId, session.user.tenantId));

  return Response.json({ data: memberList });
}

/** POST /api/members — create a new member */
export async function POST(request: NextRequest) {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;

  const body = await request.json();
  const parsed = createMemberSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  await db.insert(members).values({
    id,
    tenantId: session.user.tenantId,
    name: parsed.data.name,
    email: parsed.data.email,
  });

  return Response.json({ data: { id, ...parsed.data } }, { status: 201 });
}
