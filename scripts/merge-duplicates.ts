#!/usr/bin/env npx tsx
/**
 * Merges duplicate members where Copilot-only (GitHub email) entries
 * match Claude/company email entries for the same person.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { members, memberIdentities, usageRecords } from "../src/lib/db/schema";

// Merge pairs: [keepEmail, removeEmail]
const MERGES = [
  {
    keep: "john.reynolds@assetworks.com",
    remove: "john-reynolds-asset-works@github.com",
    reason: "John Reynolds — Copilot GitHub email → company email",
  },
  {
    keep: "ryan.noble@qwarecmms.com",
    remove: "ryanqwarecmms@github.com",
    reason: "Ryan Noble — Copilot GitHub email → company email",
  },
  {
    keep: "steve.colina@assetworks.com",
    remove: "steveweenie@github.com",
    reason: "Steve Colina — Copilot GitHub email → company email",
  },
];

async function main() {
  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);

  for (const merge of MERGES) {
    console.log(`\n=== ${merge.reason} ===`);

    const [keepMember] = await db.select().from(members).where(eq(members.email, merge.keep));
    const [removeMember] = await db.select().from(members).where(eq(members.email, merge.remove));

    if (!keepMember) {
      console.log(`  SKIP: Keep member not found (${merge.keep})`);
      continue;
    }
    if (!removeMember) {
      console.log(`  SKIP: Remove member not found (${merge.remove})`);
      continue;
    }

    console.log(`  Keep:   ${keepMember.name} <${keepMember.email}> (${keepMember.id.substring(0, 8)})`);
    console.log(`  Remove: ${removeMember.name} <${removeMember.email}> (${removeMember.id.substring(0, 8)})`);

    // Move identities from remove → keep
    const idsToMove = await db.select().from(memberIdentities).where(eq(memberIdentities.memberId, removeMember.id));
    for (const id of idsToMove) {
      await db.update(memberIdentities).set({ memberId: keepMember.id }).where(eq(memberIdentities.id, id.id));
      console.log(`  Moved identity: ${id.vendor}:${id.vendorUsername || id.vendorEmail}`);
    }

    // Move usage records from remove → keep
    const usageToMove = await db.select().from(usageRecords).where(eq(usageRecords.memberId, removeMember.id));
    for (const u of usageToMove) {
      await db.update(usageRecords).set({ memberId: keepMember.id }).where(eq(usageRecords.id, u.id));
      console.log(`  Moved usage: ${u.vendor} $${(u.spendCents / 100).toFixed(2)}`);
    }

    // Delete the duplicate member
    await db.delete(members).where(eq(members.id, removeMember.id));
    console.log(`  Deleted duplicate member: ${removeMember.name} <${removeMember.email}>`);
  }

  console.log("\nDone. Merged 3 duplicate pairs.");
}

main().catch(console.error);
