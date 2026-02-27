#!/usr/bin/env npx tsx
/**
 * 1. Remove unattributed Replit agent usage + infra records (not needed)
 * 2. Merge duplicate members where Replit + Copilot are clearly the same person
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, like, isNull } from "drizzle-orm";
import { members, memberIdentities, usageRecords } from "../src/lib/db/schema";

async function main() {
  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);

  // ─── 1. Remove unattributed agent/infra records ──────────
  console.log("Removing unattributed Replit agent usage and infra records...");

  const unattributed = await db
    .select()
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.vendor, "replit"),
        eq(usageRecords.sourceType, "scraper"),
        isNull(usageRecords.memberId),
      ),
    );

  for (const r of unattributed) {
    await db.delete(usageRecords).where(eq(usageRecords.id, r.id));
    console.log(`  Deleted: ${r.vendorUsername} ($${(r.spendCents / 100).toFixed(2)})`);
  }
  console.log(`  Removed ${unattributed.length} unattributed records.\n`);

  // ─── 2. Find duplicate members to merge ──────────────────
  // Look for Replit-only members that match Copilot members by email domain pattern

  const allMembers = await db.select().from(members);

  // Build email-based lookup
  const byEmail = new Map<string, typeof allMembers>();
  for (const m of allMembers) {
    const key = m.email.toLowerCase();
    const existing = byEmail.get(key) || [];
    existing.push(m);
    byEmail.set(key, existing);
  }

  // Find name-based duplicates (same name, different emails)
  const byName = new Map<string, typeof allMembers>();
  for (const m of allMembers) {
    const key = m.name.toLowerCase().trim();
    const existing = byName.get(key) || [];
    existing.push(m);
    byName.set(key, existing);
  }

  console.log("=== Checking for duplicates ===");

  // Check specifically for Aaron Davis, Lee Harding, Aayush Yadav
  // These are Replit-only members that the user says exist in Copilot
  const replitOnly = ["aaron.davis@assetworks.com", "lee.harding@assetworks.com", "aayush.yadav@assetworks.com"];

  for (const email of replitOnly) {
    const memberList = await db.select().from(members).where(eq(members.email, email));
    if (memberList.length === 0) continue;

    const member = memberList[0];
    const ids = await db
      .select()
      .from(memberIdentities)
      .where(eq(memberIdentities.memberId, member.id));

    const vendors = ids.map((i) => i.vendor);
    console.log(`  ${member.name} (${member.email}): vendors=[${vendors.join(", ")}]`);

    if (!vendors.includes("copilot")) {
      // Search for potential Copilot matches by partial name
      const firstName = member.name.split(" ")[0].toLowerCase();
      const lastName = member.name.split(" ").pop()?.toLowerCase() || "";

      // Look through all copilot identities
      const allCopilotIds = await db
        .select()
        .from(memberIdentities)
        .where(eq(memberIdentities.vendor, "copilot"));

      const possibleMatches = allCopilotIds.filter((ci) => {
        const un = (ci.vendorUsername || "").toLowerCase();
        return un.includes(firstName) || un.includes(lastName);
      });

      if (possibleMatches.length > 0) {
        console.log(`    Possible Copilot matches: ${possibleMatches.map((m) => `@${m.vendorUsername} (member:${m.memberId.substring(0, 8)})`).join(", ")}`);
      } else {
        console.log(`    No Copilot match found in DB. They may need a fresh Copilot sync.`);
      }
    }
  }

  // Also check for any email duplicates
  console.log("\n=== Email duplicates ===");
  for (const [email, memberList] of byEmail) {
    if (memberList.length > 1) {
      console.log(`  DUPLICATE: ${email} → ${memberList.map((m) => `${m.name} (${m.id.substring(0, 8)})`).join(", ")}`);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
