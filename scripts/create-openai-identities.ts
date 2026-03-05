#!/usr/bin/env npx tsx
/**
 * Creates member_identities entries for OpenAI by matching
 * vendor_email from usage_records to members.email.
 * Then updates any unlinked OpenAI usage records.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/create-openai-identities.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  // 1. Find distinct OpenAI vendor emails from usage records
  const openaiEmails = await sql`
    SELECT DISTINCT vendor_email, vendor_username
    FROM usage_records
    WHERE vendor = 'openai'
      AND vendor_email IS NOT NULL
  `;
  console.log(`Found ${openaiEmails.length} distinct OpenAI user(s):`, openaiEmails);

  // 2. Match each to a member by email
  let created = 0;
  for (const row of openaiEmails) {
    const email = row.vendor_email as string;
    const username = row.vendor_username as string | null;

    // Check if identity already exists
    const existing = await sql`
      SELECT id FROM member_identities
      WHERE vendor = 'openai' AND lower(vendor_email) = lower(${email})
      LIMIT 1
    `;
    if (existing.length > 0) {
      console.log(`  Identity already exists for ${email}, skipping`);
      continue;
    }

    // Find matching member
    const members = await sql`
      SELECT id, name, email FROM members
      WHERE lower(email) = lower(${email})
      LIMIT 1
    `;
    if (members.length === 0) {
      console.log(`  No member found for ${email}, skipping`);
      continue;
    }

    const member = members[0];
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO member_identities (id, member_id, vendor, vendor_username, vendor_email)
      VALUES (${id}, ${member.id}, 'openai', ${username}, ${email})
    `;
    console.log(`  Created identity: ${email} → ${member.name} (${member.id})`);
    created++;
  }
  console.log(`\nCreated ${created} OpenAI member identities`);

  // 3. Fix unlinked OpenAI usage records using the new identities
  const fixed = await sql`
    UPDATE usage_records ur
    SET member_id = mi.member_id
    FROM member_identities mi
    WHERE ur.member_id IS NULL
      AND ur.vendor = 'openai'
      AND ur.vendor_email IS NOT NULL
      AND lower(ur.vendor_email) = lower(mi.vendor_email)
      AND mi.vendor = 'openai'
    RETURNING ur.id, ur.vendor_email, mi.member_id
  `;
  console.log(`Fixed ${fixed.length} unlinked OpenAI usage records`);

  // 4. Fallback: match remaining by member email directly
  const fallback = await sql`
    UPDATE usage_records ur
    SET member_id = m.id
    FROM members m
    WHERE ur.member_id IS NULL
      AND ur.vendor = 'openai'
      AND ur.vendor_email IS NOT NULL
      AND lower(ur.vendor_email) = lower(m.email)
    RETURNING ur.id, ur.vendor_email, m.id as member_id
  `;
  console.log(`Fixed ${fallback.length} more via member email fallback`);

  // Summary
  const summary = await sql`
    SELECT vendor, count(*) as total, count(member_id) as linked
    FROM usage_records
    WHERE vendor = 'openai'
    GROUP BY vendor
  `;
  console.log("\nOpenAI records summary:", JSON.stringify(summary, null, 2));
}

main().catch(console.error);
