#!/usr/bin/env npx tsx
/**
 * Creates user accounts for all members who don't already have one.
 * Each user gets the same shared password and "viewer" role.
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/create-member-accounts.ts
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { members, user, account, tenants } from "../src/lib/db/schema";
import { hashPassword } from "better-auth/crypto";
import crypto from "crypto";

const PASSWORD = "@$$3+w0RX";

async function main() {
  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);

  // Get the tenant
  const [tenant] = await db.select().from(tenants).limit(1);
  if (!tenant) {
    console.error("No tenant found. Run seed first.");
    process.exit(1);
  }
  console.log(`Tenant: ${tenant.name} (${tenant.id})\n`);

  // Get all members
  const allMembers = await db
    .select({ id: members.id, name: members.name, email: members.email })
    .from(members)
    .where(eq(members.tenantId, tenant.id));

  console.log(`Found ${allMembers.length} members\n`);

  // Get existing users to avoid duplicates
  const existingUsers = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.tenantId, tenant.id));

  const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));
  console.log(`Existing user accounts: ${existingEmails.size}`);

  // Hash the password once (same for all)
  const passwordHash = await hashPassword(PASSWORD);

  let created = 0;
  let skipped = 0;
  let linked = 0;

  for (const member of allMembers) {
    const email = member.email.toLowerCase();

    if (existingEmails.has(email)) {
      // Check if existing user is linked to this member
      const [existingUser] = await db
        .select({ id: user.id, memberId: user.memberId })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);

      if (existingUser && !existingUser.memberId) {
        await db
          .update(user)
          .set({ memberId: member.id })
          .where(eq(user.id, existingUser.id));
        console.log(`  LINKED  ${member.name} <${email}> → existing user`);
        linked++;
      } else {
        console.log(`  SKIP    ${member.name} <${email}> (already exists)`);
      }
      skipped++;
      continue;
    }

    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();

    await db.insert(user).values({
      id: userId,
      email: email,
      name: member.name,
      emailVerified: true,
      role: "viewer",
      tenantId: tenant.id,
      memberId: member.id,
    });

    await db.insert(account).values({
      id: accountId,
      userId: userId,
      accountId: userId,
      providerId: "credential",
      password: passwordHash,
    });

    console.log(`  CREATE  ${member.name} <${email}>`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}, Linked: ${linked}`);
}

main().catch(console.error);
