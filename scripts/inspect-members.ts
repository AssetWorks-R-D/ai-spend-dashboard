#!/usr/bin/env npx tsx
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { members, memberIdentities, usageRecords } from "../src/lib/db/schema";

async function main() {
  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);

  const allMembers = await db.select().from(members);
  const allIds = await db.select().from(memberIdentities);
  const allUsage = await db.select().from(usageRecords);

  console.log(`=== ALL ${allMembers.length} MEMBERS ===`);
  for (const m of allMembers.sort((a, b) => a.name.localeCompare(b.name))) {
    const ids = allIds.filter(i => i.memberId === m.id);
    const vendors = ids.map(i => `${i.vendor}:${i.vendorUsername || i.vendorEmail || "?"}`).join(", ");
    const usage = allUsage.filter(u => u.memberId === m.id);
    const totalCents = usage.reduce((sum, u) => sum + u.spendCents, 0);
    console.log(`  ${m.name} <${m.email}> [$${(totalCents/100).toFixed(2)}] [${vendors}]`);
  }

  console.log(`\n=== USAGE SUMMARY: ${allUsage.length} records ===`);
  const byVendor: Record<string, { count: number; cents: number }> = {};
  for (const u of allUsage) {
    if (!byVendor[u.vendor]) byVendor[u.vendor] = { count: 0, cents: 0 };
    byVendor[u.vendor].count++;
    byVendor[u.vendor].cents += u.spendCents;
  }
  for (const [v, d] of Object.entries(byVendor)) {
    console.log(`  ${v}: ${d.count} records, $${(d.cents/100).toFixed(2)}`);
  }
}

main().catch(console.error);
