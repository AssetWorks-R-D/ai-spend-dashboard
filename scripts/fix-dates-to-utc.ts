#!/usr/bin/env npx tsx
/**
 * Migrates all period dates from local-time (CST) to UTC midnight.
 * This ensures consistency between local dev and Vercel (UTC) deployments.
 *
 * Before: periodStart = 2026-02-01T06:00:00Z (CST midnight)
 * After:  periodStart = 2026-02-01T00:00:00Z (UTC midnight)
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/fix-dates-to-utc.ts
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { usageRecords } from "../src/lib/db/schema";

async function main() {
  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);

  // Get all records
  const records = await db
    .select({
      id: usageRecords.id,
      periodStart: usageRecords.periodStart,
      periodEnd: usageRecords.periodEnd,
    })
    .from(usageRecords);

  console.log(`=== Migrating ${records.length} records to UTC dates ===\n`);

  // UTC targets for February 2026
  const utcStart = new Date(Date.UTC(2026, 1, 1)); // 2026-02-01T00:00:00Z
  const utcEnd = new Date(Date.UTC(2026, 2, 0, 23, 59, 59, 999)); // 2026-02-28T23:59:59.999Z

  console.log(`Target periodStart: ${utcStart.toISOString()}`);
  console.log(`Target periodEnd:   ${utcEnd.toISOString()}\n`);

  let updated = 0;
  let skipped = 0;

  for (const r of records) {
    const currentStart = r.periodStart.toISOString();
    const currentEnd = r.periodEnd.toISOString();

    // Check if already UTC midnight
    if (currentStart === utcStart.toISOString() && currentEnd === utcEnd.toISOString()) {
      skipped++;
      continue;
    }

    await db
      .update(usageRecords)
      .set({ periodStart: utcStart, periodEnd: utcEnd })
      .where(require("drizzle-orm").eq(usageRecords.id, r.id));

    console.log(`  ${r.id.slice(0, 8)}... ${currentStart} → ${utcStart.toISOString()}`);
    updated++;
  }

  console.log(`\nDone. Updated: ${updated}, Already correct: ${skipped}`);
}

main().catch(console.error);
