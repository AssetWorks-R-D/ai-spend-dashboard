#!/usr/bin/env npx tsx
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { usageRecords, members } from "../src/lib/db/schema";
import { eq, and } from "drizzle-orm";

async function main() {
  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);

  // Get all Cursor usage records with member info
  const records = await db
    .select({
      memberName: members.name,
      memberEmail: members.email,
      spendCents: usageRecords.spendCents,
      tokens: usageRecords.tokens,
      sourceType: usageRecords.sourceType,
      periodStart: usageRecords.periodStart,
    })
    .from(usageRecords)
    .leftJoin(members, eq(usageRecords.memberId, members.id))
    .where(eq(usageRecords.vendor, "cursor"));

  console.log("=== CURSOR USAGE RECORDS ===");
  let total = 0;
  for (const r of records.sort((a, b) => b.spendCents - a.spendCents)) {
    total += r.spendCents;
    console.log(`  ${r.memberName}: $${(r.spendCents / 100).toFixed(2)} (${r.sourceType}, period: ${r.periodStart?.toISOString().slice(0, 10)})`);
  }
  console.log(`\n  TOTAL: $${(total / 100).toFixed(2)} across ${records.length} records`);

  // Also check Copilot
  const copilotRecords = await db
    .select({
      memberName: members.name,
      spendCents: usageRecords.spendCents,
      sourceType: usageRecords.sourceType,
    })
    .from(usageRecords)
    .leftJoin(members, eq(usageRecords.memberId, members.id))
    .where(eq(usageRecords.vendor, "copilot"));

  console.log("\n=== COPILOT USAGE RECORDS ===");
  for (const r of copilotRecords.sort((a, b) => b.spendCents - a.spendCents)) {
    console.log(`  ${r.memberName}: $${(r.spendCents / 100).toFixed(2)} (${r.sourceType})`);
  }
}

main().catch(console.error);
