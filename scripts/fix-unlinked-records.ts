#!/usr/bin/env npx tsx
/**
 * Fixes usage records that have no member_id by matching against
 * member_identities (vendor_email, vendor_username) and members (email).
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/fix-unlinked-records.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  // 1. Match by vendor_email in member_identities
  const byEmail = await sql`
    UPDATE usage_records ur
    SET member_id = mi.member_id
    FROM member_identities mi
    WHERE ur.member_id IS NULL
      AND ur.vendor_email IS NOT NULL
      AND lower(ur.vendor_email) = lower(mi.vendor_email)
      AND ur.vendor = mi.vendor
    RETURNING ur.id, ur.vendor, ur.vendor_email, mi.member_id
  `;
  console.log(`Fixed ${byEmail.length} records by vendor_email identity match`);

  // 2. Match by vendor_username in member_identities
  const byUsername = await sql`
    UPDATE usage_records ur
    SET member_id = mi.member_id
    FROM member_identities mi
    WHERE ur.member_id IS NULL
      AND ur.vendor_username IS NOT NULL
      AND lower(ur.vendor_username) = lower(mi.vendor_username)
      AND ur.vendor = mi.vendor
    RETURNING ur.id, ur.vendor, ur.vendor_username, mi.member_id
  `;
  console.log(`Fixed ${byUsername.length} records by vendor_username identity match`);

  // 3. Fallback: match by vendor_email against member.email directly
  const byMemberEmail = await sql`
    UPDATE usage_records ur
    SET member_id = m.id
    FROM members m
    WHERE ur.member_id IS NULL
      AND ur.vendor_email IS NOT NULL
      AND lower(ur.vendor_email) = lower(m.email)
    RETURNING ur.id, ur.vendor, ur.vendor_email, m.id as member_id
  `;
  console.log(`Fixed ${byMemberEmail.length} records by member email fallback`);

  // Summary
  const remaining = await sql`
    SELECT vendor, count(*) as unlinked
    FROM usage_records
    WHERE member_id IS NULL
    GROUP BY vendor
    ORDER BY vendor
  `;
  console.log("\nRemaining unlinked records:", JSON.stringify(remaining, null, 2));

  const totals = await sql`
    SELECT vendor, count(*) as total, count(member_id) as linked
    FROM usage_records
    GROUP BY vendor
    ORDER BY vendor
  `;
  console.log("Final totals:", JSON.stringify(totals, null, 2));
}

main().catch(console.error);
