#!/usr/bin/env npx tsx
/**
 * Seeds Replit team members and usage data scraped from:
 *   - https://replit.com/t/assetworks-randd/members
 *   - https://replit.com/t/assetworks-randd/usage
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/seed-replit-data.ts
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and } from "drizzle-orm";
import { members, memberIdentities, usageRecords, tenants } from "../src/lib/db/schema";
import crypto from "crypto";

// ─── Scraped data ─────────────────────────────────────────────

const REPLIT_MEMBERS = [
  { name: "Walter Giroir", email: "walter.giroir@assetworks.com", username: "waltergiroir", role: "member" },
  { name: "Lee Harding", email: "lee.harding@assetworks.com", username: "AWleeharding", role: "member" },
  { name: "Dylan Mounts", email: "dylan.mounts@assetworks.com", username: "dylanmounts", role: "member" },
  { name: "Aaron Davis", email: "aaron.davis@assetworks.com", username: "aarondavis36", role: "member" },
  { name: "Aayush Yadav", email: "aayush.yadav@assetworks.com", username: "aayushyadav28", role: "member" },
  { name: "Benjamin Smith", email: "benjamin.smith@assetworks.com", username: "AWbensmith", role: "admin" },
  { name: "Kyle Isenhour", email: "kyle.isenhour@assetworks.com", username: "kyleisenhour", role: "member" },
  { name: "Eric Vandersloot", email: "eric.vandersloot@assetworks.com", username: "ericvandersloot", role: "admin" },
  { name: "Glenn Adams", email: "glenn.adams.au@gmail.com", username: "glennadamsau", role: "member" },
  { name: "Gabriel Larson", email: "gabriel.larson@assetworks.com", username: "gabriellarson3", role: "member" },
];

// Replit Teams plan: $25/user/month for Teams plan
const REPLIT_SUBSCRIPTION_CENTS = 2500;

// Agent usage per app (Jan 29 – Feb 27 billing cycle)
const AGENT_USAGE = [
  { app: "Documentation Health Dashboard (Document Intelligence)", costCents: 9252 },
  { app: "GOAMR", costCents: 3721 },
  { app: "AI Spend Dashboard", costCents: 3620 },
  { app: "GOWMR (Dylan)", costCents: 2518 },
  { app: "Nostalgia Photo Booth", costCents: 956 },
  { app: "fiream", costCents: 558 },
  { app: "GOWMR (develop)", costCents: 420 },
  { app: "TaskPilot", costCents: 178 },
  { app: "PerfDataCentral", costCents: 65 },
  { app: "AWleeharding-01-07", costCents: 58 },
  { app: "+3 more", costCents: 112 },
];

// Infrastructure costs (non-AI)
const INFRA_COSTS = [
  { category: "Autoscale Deployment (Deployments)", costCents: 908 },
  { category: "Autoscale Deployment (Compute units)", costCents: 1110 },
  { category: "Autoscale Deployment (Requests)", costCents: 15 },
  { category: "PostgreSQL Storage", costCents: 1176 },
  { category: "PostgreSQL Compute", costCents: 3251 },
];

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("DATABASE_URL required. Run: npx dotenv -e .env.local -- npx tsx scripts/seed-replit-data.ts");
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  // Get the AssetWorks tenant
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "assetworks"));
  if (!tenant) {
    console.error("Tenant 'assetworks' not found. Run the seed script first.");
    process.exit(1);
  }

  const tenantId = tenant.id;
  const periodStart = new Date("2026-01-29");
  const periodEnd = new Date("2026-02-27");

  console.log(`Tenant: ${tenant.name} (${tenantId})`);

  // ─── Upsert members + Replit identities ───────────────────

  let created = 0;
  let updated = 0;

  for (const rm of REPLIT_MEMBERS) {
    // Check if member already exists by email
    const existing = await db
      .select()
      .from(members)
      .where(and(eq(members.tenantId, tenantId), eq(members.email, rm.email)));

    let memberId: string;

    if (existing.length > 0) {
      memberId = existing[0].id;
      updated++;
      console.log(`  Existing member: ${rm.name} (${rm.email})`);
    } else {
      memberId = crypto.randomUUID();
      await db.insert(members).values({
        id: memberId,
        tenantId,
        name: rm.name,
        email: rm.email,
      });
      created++;
      console.log(`  + New member: ${rm.name} (${rm.email})`);
    }

    // Check if Replit identity exists
    const existingIdentity = await db
      .select()
      .from(memberIdentities)
      .where(
        and(
          eq(memberIdentities.memberId, memberId),
          eq(memberIdentities.vendor, "replit"),
        ),
      );

    if (existingIdentity.length === 0) {
      await db.insert(memberIdentities).values({
        id: crypto.randomUUID(),
        memberId,
        vendor: "replit",
        vendorUsername: rm.username,
        vendorEmail: rm.email,
      });
      console.log(`    + Replit identity: @${rm.username}`);
    } else {
      console.log(`    Replit identity exists: @${rm.username}`);
    }

    // Add subscription cost as a usage record
    const existingSub = await db
      .select()
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.tenantId, tenantId),
          eq(usageRecords.memberId, memberId),
          eq(usageRecords.vendor, "replit"),
          eq(usageRecords.periodStart, periodStart),
          eq(usageRecords.sourceType, "manual"),
        ),
      );

    if (existingSub.length === 0) {
      await db.insert(usageRecords).values({
        id: crypto.randomUUID(),
        tenantId,
        memberId,
        vendor: "replit",
        spendCents: REPLIT_SUBSCRIPTION_CENTS,
        tokens: null,
        periodStart,
        periodEnd,
        confidence: "high",
        sourceType: "manual",
        vendorUsername: rm.username,
        vendorEmail: rm.email,
      });
      console.log(`    + $25.00 subscription cost`);
    }
  }

  console.log(`\nMembers: ${created} created, ${updated} existing`);

  // ─── Agent usage costs (unattributed for now) ─────────────

  console.log("\nAgent usage (team-level, pending attribution):");
  for (const usage of AGENT_USAGE) {
    const existing = await db
      .select()
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.tenantId, tenantId),
          eq(usageRecords.vendor, "replit"),
          eq(usageRecords.vendorUsername, `app:${usage.app}`),
          eq(usageRecords.periodStart, periodStart),
        ),
      );

    if (existing.length === 0) {
      await db.insert(usageRecords).values({
        id: crypto.randomUUID(),
        tenantId,
        memberId: null, // unattributed — user will tell us who works on what
        vendor: "replit",
        spendCents: usage.costCents,
        tokens: null,
        periodStart,
        periodEnd,
        confidence: "low",
        sourceType: "scraper",
        vendorUsername: `app:${usage.app}`,
      });
      console.log(`  + ${usage.app}: $${(usage.costCents / 100).toFixed(2)}`);
    } else {
      console.log(`  Exists: ${usage.app}`);
    }
  }

  // ─── Infra costs (shared/team-level) ──────────────────────

  const totalInfraCents = INFRA_COSTS.reduce((sum, c) => sum + c.costCents, 0);
  console.log(`\nInfrastructure costs (total: $${(totalInfraCents / 100).toFixed(2)}):`);

  const existingInfra = await db
    .select()
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.tenantId, tenantId),
        eq(usageRecords.vendor, "replit"),
        eq(usageRecords.vendorUsername, "infra:total"),
        eq(usageRecords.periodStart, periodStart),
      ),
    );

  if (existingInfra.length === 0) {
    await db.insert(usageRecords).values({
      id: crypto.randomUUID(),
      tenantId,
      memberId: null,
      vendor: "replit",
      spendCents: totalInfraCents,
      tokens: null,
      periodStart,
      periodEnd,
      confidence: "high",
      sourceType: "scraper",
      vendorUsername: "infra:total",
    });
    console.log(`  + Infrastructure total: $${(totalInfraCents / 100).toFixed(2)}`);
  }

  // ─── Summary ──────────────────────────────────────────────

  const subscriptionTotal = REPLIT_MEMBERS.length * REPLIT_SUBSCRIPTION_CENTS;
  const agentTotal = AGENT_USAGE.reduce((sum, u) => sum + u.costCents, 0);

  console.log("\n═══ REPLIT COST SUMMARY (Jan 29 – Feb 27) ═══");
  console.log(`  Subscriptions (${REPLIT_MEMBERS.length} × $25):  $${(subscriptionTotal / 100).toFixed(2)}`);
  console.log(`  Agent usage:                      $${(agentTotal / 100).toFixed(2)}`);
  console.log(`  Infrastructure:                   $${(totalInfraCents / 100).toFixed(2)}`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  TOTAL:                            $${((subscriptionTotal + agentTotal + totalInfraCents) / 100).toFixed(2)}`);
  console.log("\nDone! Agent usage is unattributed — tell me who works on each app to assign costs.");
}

main().catch(console.error);
