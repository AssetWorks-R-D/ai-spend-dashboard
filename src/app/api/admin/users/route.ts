import { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { user, account } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod/v4";
import crypto from "crypto";

const createUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(["admin", "viewer"]),
});

/** GET /api/admin/users — list all users in tenant */
export async function GET() {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;

  const users = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.tenantId, session.user.tenantId));

  return Response.json({ data: users });
}

/** POST /api/admin/users — create a new user */
export async function POST(request: NextRequest) {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const { email, name, password, role } = parsed.data;

  // Check if email already exists
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing.length > 0) {
    return Response.json(
      { error: { code: "DUPLICATE_EMAIL", message: "A user with this email already exists" } },
      { status: 409 }
    );
  }

  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await db.insert(user).values({
    id: userId,
    email,
    name,
    role,
    tenantId: session.user.tenantId,
    emailVerified: true,
  });

  await db.insert(account).values({
    id: accountId,
    userId,
    accountId: userId,
    providerId: "credential",
    password: passwordHash,
  });

  return Response.json(
    { data: { id: userId, email, name, role } },
    { status: 201 }
  );
}
