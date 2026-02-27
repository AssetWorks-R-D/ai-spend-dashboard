#!/usr/bin/env npx tsx
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { members, memberIdentities, usageRecords } from "../src/lib/db/schema";

async function main() {
  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);

  const allMembers = await db.select().from(members);
  console.log("=== ALL MEMBERS ===");
  for (const m of allMembers) {
    const ids = await db.select().from(memberIdentities).where(eq(memberIdentities.memberId, m.id));
    const idStr = ids.map((i) => `${i.vendor}:@${i.vendorUsername || i.vendorEmail}`).join(", ");
    console.log(`  ${m.name} | ${m.email} | identities: [${idStr}]`);
  }

  const records = await db.select().from(usageRecords);
  console.log(`\n=== USAGE RECORDS: ${records.length} total ===`);
  for (const r of records) {
    console.log(`  ${r.vendor} | ${r.vendorUsername || r.vendorEmail || "no-user"} | $${(r.spendCents / 100).toFixed(2)} | ${r.sourceType} | member:${r.memberId?.substring(0, 8) || "null"}`);
  }
}

main().catch(console.error);
