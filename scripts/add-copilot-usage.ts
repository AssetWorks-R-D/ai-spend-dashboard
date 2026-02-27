#!/usr/bin/env npx tsx
/**
 * Adds unattributed Copilot usage/premium request charges to the vendor card.
 * Same pattern as add-replit-usage.ts — creates a memberId-null record
 * that shows in the vendor card total but not in individual member cards.
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/add-copilot-usage.ts
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, isNull } from "drizzle-orm";
import { usageRecords, tenants } from "../src/lib/db/schema";
import crypto from "crypto";

// ─── UPDATE THIS with the premium request charges from GitHub billing ───
const COPILOT_USAGE_CENTS = 0; // e.g., 15000 = $150.00
// ────────────────────────────────────────────────────────────────────────

async function main() {
  if (COPILOT_USAGE_CENTS <= 0) {
    console.log("Set COPILOT_USAGE_CENTS to the premium request charges first.");
    console.log("Check your GitHub billing page or run:");
    console.log("  npx dotenv -e .env.local -- npx tsx scripts/check-copilot-billing.ts");
    return;
  }

  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);

  // Get tenant
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "assetworks"));
  if (!tenant) { console.error("Tenant not found"); process.exit(1); }

  const tenantId = tenant.id;

  // Check for existing unattributed record
  const existing = await db
    .select({ id: usageRecords.id, spendCents: usageRecords.spendCents })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.vendor, "copilot"),
        eq(usageRecords.tenantId, tenantId),
        isNull(usageRecords.memberId),
        eq(usageRecords.sourceType, "manual")
      )
    );

  if (existing.length > 0) {
    console.log(`Existing unattributed record: $${(existing[0].spendCents / 100).toFixed(2)}`);
    console.log("Updating...");
    await db
      .update(usageRecords)
      .set({ spendCents: COPILOT_USAGE_CENTS, tokens: null })
      .where(eq(usageRecords.id, existing[0].id));
    console.log(`Updated to $${(COPILOT_USAGE_CENTS / 100).toFixed(2)}`);
  } else {
    // Use local-time period dates (critical — see MEMORY.md)
    const periodStart = new Date(2026, 1, 1); // Feb 1 local time
    const periodEnd = new Date(2026, 2, 0, 23, 59, 59, 999); // Feb 28 end local time

    await db.insert(usageRecords).values({
      id: crypto.randomUUID(),
      tenantId,
      memberId: null,
      vendor: "copilot",
      spendCents: COPILOT_USAGE_CENTS,
      tokens: null,
      periodStart,
      periodEnd,
      confidence: "medium",
      sourceType: "manual",
      vendorUsername: "Premium request charges",
      vendorEmail: null,
    });
    console.log(`Added unattributed Copilot usage: $${(COPILOT_USAGE_CENTS / 100).toFixed(2)}`);
  }

  console.log("Done. Amount will appear in the Copilot vendor card total.");
}

main().catch(console.error);
