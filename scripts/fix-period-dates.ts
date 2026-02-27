#!/usr/bin/env npx tsx
/**
 * Fixes period dates on Claude and Replit usage records to match
 * the local-time convention used by periodBounds() and the sync adapters.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, or } from "drizzle-orm";
import { usageRecords } from "../src/lib/db/schema";

async function main() {
  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);

  // These are the correct local-time bounds that periodBounds("2026-02") produces
  const correctStart = new Date(2026, 1, 1);        // Feb 1 midnight local
  const correctEnd = new Date(2026, 2, 0, 23, 59, 59, 999); // Feb 28 23:59:59 local

  console.log(`Correct periodStart: ${correctStart.toISOString()}`);
  console.log(`Correct periodEnd:   ${correctEnd.toISOString()}`);

  // Get all Claude and Replit records
  const records = await db
    .select({ id: usageRecords.id, vendor: usageRecords.vendor, periodStart: usageRecords.periodStart, periodEnd: usageRecords.periodEnd })
    .from(usageRecords)
    .where(or(eq(usageRecords.vendor, "claude"), eq(usageRecords.vendor, "replit")));

  console.log(`\nFound ${records.length} Claude/Replit records to fix`);

  let fixed = 0;
  for (const r of records) {
    const startStr = r.periodStart?.toISOString();
    const endStr = r.periodEnd?.toISOString();
    const correctStartStr = correctStart.toISOString();
    const correctEndStr = correctEnd.toISOString();

    if (startStr !== correctStartStr || endStr !== correctEndStr) {
      await db
        .update(usageRecords)
        .set({ periodStart: correctStart, periodEnd: correctEnd })
        .where(eq(usageRecords.id, r.id));
      fixed++;
    }
  }

  console.log(`Fixed ${fixed} records.`);
  console.log(`\nVerifying — sample Cursor record for comparison:`);
  const [cursorSample] = await db
    .select({ vendor: usageRecords.vendor, periodStart: usageRecords.periodStart, periodEnd: usageRecords.periodEnd })
    .from(usageRecords)
    .where(eq(usageRecords.vendor, "cursor"));
  if (cursorSample) {
    console.log(`  Cursor: start=${cursorSample.periodStart?.toISOString()}, end=${cursorSample.periodEnd?.toISOString()}`);
  }
}

main().catch(console.error);
