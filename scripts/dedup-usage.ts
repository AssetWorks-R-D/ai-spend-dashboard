#!/usr/bin/env npx tsx
/**
 * Removes duplicate usage_records, keeping only the most recent entry
 * for each (tenant_id, vendor, member_id, period_start) combination.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/dedup-usage.ts
 */
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL as string);

  // Show duplicates first
  const dupes = await sql`
    SELECT vendor, vendor_email, vendor_username, count(*) as cnt
    FROM usage_records
    WHERE source_type IN ('api', 'scraper')
    GROUP BY vendor, vendor_email, vendor_username, period_start
    HAVING count(*) > 1
    ORDER BY cnt DESC
    LIMIT 20
  `;

  console.log(`Found ${dupes.length} groups with duplicates:`);
  for (const r of dupes) {
    console.log(`  ${r.vendor} | ${r.vendor_email || r.vendor_username} | ${r.cnt}x`);
  }

  if (dupes.length === 0) {
    console.log("No duplicates found. Nothing to do.");
    return;
  }

  // Delete duplicates, keeping the newest record per group
  const result = await sql`
    DELETE FROM usage_records
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY tenant_id, vendor, COALESCE(member_id, ''), COALESCE(vendor_email, ''), COALESCE(vendor_username, ''), period_start
            ORDER BY synced_at DESC, created_at DESC
          ) as rn
        FROM usage_records
        WHERE source_type IN ('api', 'scraper')
      ) ranked
      WHERE rn > 1
    )
  `;

  console.log(`\nDeleted ${result.length ?? 'unknown number of'} duplicate records.`);

  // Verify
  const remaining = await sql`SELECT count(*) as cnt FROM usage_records`;
  console.log(`Records remaining: ${remaining[0].cnt}`);
}

main().catch(console.error);
