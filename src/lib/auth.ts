import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "viewer",
        input: false,
      },
      tenantId: {
        type: "string",
        required: true,
        input: false,
      },
      memberId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;

/**
 * Get the current session in a Server Component or API route.
 * Returns null if not authenticated.
 */
export async function getSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}

/**
 * Require authentication. Redirects to /login if not authenticated.
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/**
 * Require admin role. Redirects to /dashboard if authenticated but not admin.
 * Redirects to /login if not authenticated.
 */
export async function requireAdmin() {
  const session = await requireAuth();
  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }
  return session;
}

/**
 * Require admin role for API routes.
 * Returns session on success, or a NextResponse error to return early.
 */
export async function requireAdminApi(): Promise<
  | { session: Session; error?: never }
  | { session?: never; error: Response }
> {
  const session = await getSession();
  if (!session) {
    return {
      error: Response.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      ),
    };
  }
  if (session.user.role !== "admin") {
    return {
      error: Response.json(
        { error: { code: "FORBIDDEN", message: "Admin access required" } },
        { status: 403 }
      ),
    };
  }
  return { session };
}
