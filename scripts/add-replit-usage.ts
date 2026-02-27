#!/usr/bin/env npx tsx
/**
 * Adds unattributed Replit usage costs (agent + infra) as a single record.
 * Shows in the Replit vendor card total but not in individual member cards.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { usageRecords, tenants } from "../src/lib/db/schema";
import crypto from "crypto";

// From Replit usage page scrape:
// Agent: $214.58, Infrastructure: $64.60 = $279.18 total
const REPLIT_USAGE_CENTS = 27918;

async function main() {
  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);

  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "assetworks"));
  if (!tenant) { console.error("Tenant not found"); process.exit(1); }

  // Match the local-time period bounds used by the app
  const periodStart = new Date(2026, 1, 1);
  const periodEnd = new Date(2026, 2, 0, 23, 59, 59, 999);

  await db.insert(usageRecords).values({
    id: crypto.randomUUID(),
    tenantId: tenant.id,
    memberId: null, // unattributed — shows in vendor card only
    vendor: "replit",
    spendCents: REPLIT_USAGE_CENTS,
    tokens: null,
    periodStart,
    periodEnd,
    confidence: "medium",
    sourceType: "scraper",
    vendorUsername: "Team usage (agent + infra)",
    vendorEmail: null,
  });

  console.log(`Added Replit unattributed usage: $${(REPLIT_USAGE_CENTS / 100).toFixed(2)}`);
  console.log(`This will show in the Replit vendor card but not in member cards.`);
}

main().catch(console.error);
