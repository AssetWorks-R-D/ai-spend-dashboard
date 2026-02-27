import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { tenants, user, account } from "./schema";
import { hashPassword } from "better-auth/crypto";
import crypto from "crypto";

async function seed() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  const tenantId = crypto.randomUUID();
  const adminUserId = crypto.randomUUID();
  const adminAccountId = crypto.randomUUID();

  console.log("Clearing existing data...");
  await sql`DELETE FROM account`;
  await sql`DELETE FROM session`;
  await sql`DELETE FROM "user"`;
  await sql`DELETE FROM tenants`;

  console.log("Seeding database...");

  // Create AssetWorks tenant
  await db.insert(tenants).values({
    id: tenantId,
    name: "AssetWorks",
    slug: "assetworks",
    leaderboardDisplayMode: "named",
  });
  console.log("Created tenant: AssetWorks");

  // Create default admin user with Better Auth-compatible password hash
  const passwordHash = await hashPassword("admin123");

  await db.insert(user).values({
    id: adminUserId,
    email: "benjamin.smith@assetworks.com",
    name: "Benjamin Smith",
    emailVerified: true,
    role: "admin",
    tenantId: tenantId,
  });

  await db.insert(account).values({
    id: adminAccountId,
    userId: adminUserId,
    accountId: adminUserId,
    providerId: "credential",
    password: passwordHash,
  });

  console.log("Created admin user: benjamin.smith@assetworks.com (password: admin123)");
  console.log("\nSeed complete!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
