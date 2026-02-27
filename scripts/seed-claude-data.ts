#!/usr/bin/env npx tsx
/**
 * Seeds Claude Team member data into the database.
 * - Creates/updates members for all 31 Claude Team users
 * - Adds Claude vendor identities
 * - Creates usage records: seat cost + overage = total spend
 * - Estimates tokens from total spend using $6/1M blended rate (same as Cursor)
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and } from "drizzle-orm";
import {
  members,
  memberIdentities,
  usageRecords,
  tenants,
} from "../src/lib/db/schema";
import crypto from "crypto";

// Claude Team seat pricing
const STANDARD_SEAT_CENTS = 2500; // $25/mo
const PREMIUM_SEAT_CENTS = 10000; // $100/mo

// Same blended rate as Cursor adapter: ~$6/1M tokens
const BLENDED_COST_PER_MILLION_TOKENS = 6;

function estimateTokensFromSpendCents(spendCents: number): number {
  if (spendCents <= 0) return 0;
  const dollars = spendCents / 100;
  return Math.round((dollars / BLENDED_COST_PER_MILLION_TOKENS) * 1_000_000);
}

// All 31 Claude Team members from Organization page
// Seat tiers and MTD overage spend from Usage page (Feb 2026)
const CLAUDE_MEMBERS = [
  { name: "Aaron Davis", email: "aaron.davis@assetworks.com", tier: "premium" as const, overageCents: 8564 },
  { name: "Aayush Yadav", email: "aayush.yadav@assetworks.com", tier: "standard" as const, overageCents: 0 },
  { name: "Adam DeSilvester", email: "adam.desilvester@assetworks.com", tier: "standard" as const, overageCents: 0 },
  { name: "Albert Baysahatov", email: "albert.baysahatov@assetworks.com", tier: "standard" as const, overageCents: 919 },
  { name: "Benjamin Smith", email: "benjamin.smith@assetworks.com", tier: "premium" as const, overageCents: 8233 },
  { name: "Claudia Perez", email: "claudia.perez@assetworks.com", tier: "standard" as const, overageCents: 0 },
  { name: "Clay Killough", email: "clay.killough@assetworks.com", tier: "premium" as const, overageCents: 0 },
  { name: "Damola Akomolafe", email: "damola.akomolafe@assetworks.com", tier: "standard" as const, overageCents: 0 },
  { name: "Daniel Marchwinski", email: "daniel.marchwinski@webcheckout.net", tier: "standard" as const, overageCents: 3759 },
  { name: "David Gadbois", email: "david.gadbois@assetworks.com", tier: "standard" as const, overageCents: 0 },
  { name: "Devin Mejia", email: "devin.mejia@assetworks.com", tier: "standard" as const, overageCents: 0 },
  { name: "Dylan Mounts", email: "dylan.mounts@assetworks.com", tier: "standard" as const, overageCents: 4759 },
  { name: "Eric Vandersloot", email: "eric.vandersloot@assetworks.com", tier: "standard" as const, overageCents: 0 },
  { name: "Fernando Saavedra", email: "fernando.saavedra@assetworks.com", tier: "standard" as const, overageCents: 0 },
  { name: "Gabriel Larson", email: "gabriel.larson@assetworks.com", tier: "standard" as const, overageCents: 1508 },
  { name: "Jess Axelson", email: "jess.axelson@assetworks.com", tier: "standard" as const, overageCents: 271 },
  { name: "John Reynolds", email: "john.reynolds@assetworks.com", tier: "standard" as const, overageCents: 0 },
  { name: "Kenneth Ring", email: "kenneth.ring@assetworks.com", tier: "standard" as const, overageCents: 69 },
  { name: "Kyle Isenhour", email: "kyle.isenhour@assetworks.com", tier: "premium" as const, overageCents: 22205 },
  { name: "Lee Ayres", email: "lee.ayres@webcheckout.net", tier: "premium" as const, overageCents: 25735 },
  { name: "Lee Harding", email: "lee.harding@assetworks.com", tier: "standard" as const, overageCents: 3869 },
  { name: "Madilyn Childress", email: "madilyn.childress@assetworks.com", tier: "standard" as const, overageCents: 0 },
  { name: "Michael Moses", email: "michael.moses@assetworks.com", tier: "standard" as const, overageCents: 0 },
  { name: "Mike Wallace", email: "mike.wallace@qwarecmms.com", tier: "standard" as const, overageCents: 0 },
  { name: "Paul Watje", email: "paul.watje@assetworks.com", tier: "premium" as const, overageCents: 7188 },
  { name: "Ryan Noble", email: "ryan.noble@qwarecmms.com", tier: "standard" as const, overageCents: 247 },
  { name: "Steve Colina", email: "steve.colina@assetworks.com", tier: "standard" as const, overageCents: 0 },
  { name: "Sukruthi Yeddula", email: "sukruthi.yeddula@assetworks.com", tier: "standard" as const, overageCents: 2860 },
  { name: "Surabhi Umarani", email: "surabhi.umarani@assetworks.com", tier: "standard" as const, overageCents: 1370 },
  { name: "Viet Vu", email: "viet.vu@assetworks.com", tier: "standard" as const, overageCents: 0 },
  { name: "William Clifford", email: "william.clifford@assetworks.com", tier: "standard" as const, overageCents: 0 },
];

async function main() {
  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);

  // Get tenant
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, "assetworks"));
  if (!tenant) {
    console.error("AssetWorks tenant not found!");
    process.exit(1);
  }

  const periodStart = new Date("2026-02-01T00:00:00Z");
  const periodEnd = new Date("2026-02-28T23:59:59Z");

  let created = 0;
  let updated = 0;
  let identitiesAdded = 0;
  let usageCreated = 0;

  for (const cm of CLAUDE_MEMBERS) {
    // Find or create member by email
    const existing = await db
      .select()
      .from(members)
      .where(
        and(eq(members.email, cm.email), eq(members.tenantId, tenant.id))
      );

    let memberId: string;

    if (existing.length > 0) {
      memberId = existing[0].id;
      // Update name if it was a placeholder
      if (existing[0].name !== cm.name) {
        await db
          .update(members)
          .set({ name: cm.name, updatedAt: new Date() })
          .where(eq(members.id, memberId));
      }
      updated++;
      console.log(`  Updated: ${cm.name} <${cm.email}>`);
    } else {
      memberId = crypto.randomUUID();
      await db.insert(members).values({
        id: memberId,
        tenantId: tenant.id,
        name: cm.name,
        email: cm.email,
      });
      created++;
      console.log(`  Created: ${cm.name} <${cm.email}>`);
    }

    // Check for existing Claude identity
    const existingIdentity = await db
      .select()
      .from(memberIdentities)
      .where(
        and(
          eq(memberIdentities.memberId, memberId),
          eq(memberIdentities.vendor, "claude")
        )
      );

    if (existingIdentity.length === 0) {
      await db.insert(memberIdentities).values({
        id: crypto.randomUUID(),
        memberId,
        vendor: "claude",
        vendorEmail: cm.email,
        vendorUsername: cm.name,
      });
      identitiesAdded++;
    }

    // Check for existing Claude usage record this period
    const existingUsage = await db
      .select()
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.memberId, memberId),
          eq(usageRecords.vendor, "claude"),
          eq(usageRecords.periodStart, periodStart)
        )
      );

    if (existingUsage.length === 0) {
      const seatCents =
        cm.tier === "premium" ? PREMIUM_SEAT_CENTS : STANDARD_SEAT_CENTS;
      const totalSpendCents = seatCents + cm.overageCents;
      const tokens = estimateTokensFromSpendCents(totalSpendCents);

      await db.insert(usageRecords).values({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        memberId,
        vendor: "claude",
        spendCents: totalSpendCents,
        tokens,
        periodStart,
        periodEnd,
        confidence: cm.overageCents > 0 ? "high" : "medium",
        sourceType: "scraper",
        vendorUsername: cm.name,
        vendorEmail: cm.email,
      });
      usageCreated++;

      const tierLabel = cm.tier === "premium" ? "PREMIUM" : "standard";
      console.log(
        `    Usage: $${(seatCents / 100).toFixed(2)} seat + $${(cm.overageCents / 100).toFixed(2)} overage = $${(totalSpendCents / 100).toFixed(2)} [${tierLabel}] (~${(tokens / 1000).toFixed(0)}K tokens)`
      );
    } else {
      console.log(`    Usage: already exists, skipping`);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Members created: ${created}`);
  console.log(`Members updated: ${updated}`);
  console.log(`Identities added: ${identitiesAdded}`);
  console.log(`Usage records created: ${usageCreated}`);

  // Total stats
  const totalSeatCost = CLAUDE_MEMBERS.reduce(
    (sum, m) =>
      sum + (m.tier === "premium" ? PREMIUM_SEAT_CENTS : STANDARD_SEAT_CENTS),
    0
  );
  const totalOverage = CLAUDE_MEMBERS.reduce(
    (sum, m) => sum + m.overageCents,
    0
  );
  const premiumCount = CLAUDE_MEMBERS.filter((m) => m.tier === "premium").length;
  const standardCount = CLAUDE_MEMBERS.length - premiumCount;

  console.log(`\nSeats: ${standardCount} standard ($${(standardCount * STANDARD_SEAT_CENTS / 100).toFixed(2)}) + ${premiumCount} premium ($${(premiumCount * PREMIUM_SEAT_CENTS / 100).toFixed(2)}) = $${(totalSeatCost / 100).toFixed(2)}`);
  console.log(`Overage: $${(totalOverage / 100).toFixed(2)}`);
  console.log(`Total: $${((totalSeatCost + totalOverage) / 100).toFixed(2)}`);
}

main().catch(console.error);
