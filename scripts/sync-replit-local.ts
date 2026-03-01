#!/usr/bin/env npx tsx
/**
 * End-to-end Replit team data sync via local browser scraping.
 *
 * 1. Extracts Edge session cookie (or uses CLI arg / env var)
 * 2. Scrapes /t/{teamSlug}/members → member list
 * 3. Scrapes /t/{teamSlug}/usage → total pool usage
 * 4. Writes members ($25/seat each) + pool remainder to DB
 *
 * Replit uses a pool model: the usage total IS the vendor total.
 * We store $25/member as attributed records + (total - seats) as unattributed
 * so the vendor card shows the correct pool total.
 *
 * Usage:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/sync-replit-local.ts
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/sync-replit-local.ts --dry-run
 *   REPLIT_COOKIE="eyJ..." npx dotenv-cli -e .env.local -- npx tsx scripts/sync-replit-local.ts
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and } from "drizzle-orm";
import { members, memberIdentities, usageRecords, tenants } from "../src/lib/db/schema";
import crypto from "crypto";
import {
  extractReplitCookie,
  createBrowserContext,
  addAntiDetection,
  navigateAndExtractText,
  parseDollarsToCents,
} from "./lib/scraper-helpers";

// ─── Config ──────────────────────────────────────────────────

const TEAM_SLUG = "assetworks-randd";
const SEAT_COST_CENTS = 2500; // $25/user/month
const DRY_RUN = process.argv.includes("--dry-run");

// ─── Parsers ─────────────────────────────────────────────────

interface ReplitMember {
  name: string;
  username: string;
  email: string | null;
}

/**
 * Parse the team members page text.
 * Actual format per member (blank lines filtered):
 *   Initials (e.g., "WA", "AW")
 *   DisplayName (e.g., "waltergiroir", "Lee", "Dylan")
 *   @username (e.g., "@waltergiroir", "@AWleeharding")
 *   email@domain.com
 *   Role (Member/Admin)
 *   Last Active time (e.g., "2 days ago")
 *
 * Strategy: scan for @username lines, grab email from next lines,
 * derive full name from email.
 */
function parseMembersPage(text: string): ReplitMember[] {
  const membersList: ReplitMember[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for @username pattern (must start with @, alphanumeric)
    const usernameMatch = line.match(/^@([a-zA-Z0-9_-]{2,30})$/);
    if (!usernameMatch) continue;

    const username = usernameMatch[1];

    // Find email in the next few lines
    let email: string | null = null;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const emailMatch = lines[j].match(/^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
      if (emailMatch) {
        email = emailMatch[1].toLowerCase();
        break;
      }
    }

    if (!email) continue;

    // Derive full name from email (first.last@domain → "First Last")
    const localPart = email.split("@")[0];
    const nameParts = localPart.split(/[._-]/);
    const fullName = nameParts
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(" ");

    if (!membersList.some((m) => m.username === username)) {
      membersList.push({ name: fullName, username, email });
    }
  }

  return membersList;
}

interface ReplitUsage {
  creditsUsedCents: number;
  additionalUsageCents: number;
  totalCents: number;
}

/**
 * Parse the Replit usage page to find total pool usage.
 *
 * The page structure has:
 *   "Credits used this month" → "Used" → "$X.XX"
 *   "Additional usage" → "Used" → "$X"
 *
 * Total = credits used + additional usage.
 * (The resource cost breakdown table is already included in credits used.)
 */
function parseUsageTotal(text: string): ReplitUsage {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let creditsUsedCents = 0;
  let additionalUsageCents = 0;

  for (let i = 0; i < lines.length; i++) {
    // "Credits used this month" → look for dollar amount in next few lines
    if (/credits used this month/i.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const match = lines[j].match(/^\$[\d,]+\.?\d*$/);
        if (match) {
          creditsUsedCents = parseDollarsToCents(match[0]);
          console.log(`  Credits used this month: $${(creditsUsedCents / 100).toFixed(2)}`);
          break;
        }
      }
    }

    // "Additional usage" → look for dollar amount in next few lines
    if (/additional usage/i.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const match = lines[j].match(/^\$[\d,]+\.?\d*$/);
        if (match) {
          additionalUsageCents = parseDollarsToCents(match[0]);
          console.log(`  Additional usage: $${(additionalUsageCents / 100).toFixed(2)}`);
          break;
        }
      }
    }
  }

  const totalCents = creditsUsedCents + additionalUsageCents;
  return { creditsUsedCents, additionalUsageCents, totalCents };
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required. Run: npx dotenv-cli -e .env.local -- npx tsx scripts/sync-replit-local.ts");
    process.exit(1);
  }

  console.log(DRY_RUN ? "=== DRY RUN (no DB writes) ===" : "=== REPLIT LOCAL SYNC ===");

  // 1. Get cookie
  console.log("\n1. Getting Replit session cookie...");
  let sessionCookie: string;

  const cliCookie = process.argv.find((a) => a.startsWith("--cookie="))?.split("=").slice(1).join("=");
  if (cliCookie) {
    sessionCookie = cliCookie;
    console.log("  Using cookie from CLI argument");
  } else if (process.env.REPLIT_COOKIE) {
    sessionCookie = process.env.REPLIT_COOKIE;
    console.log("  Using cookie from REPLIT_COOKIE env var");
  } else {
    sessionCookie = extractReplitCookie();
    console.log(`  Extracted from Edge: ${sessionCookie.substring(0, 30)}...`);
  }

  // 2. Launch browser
  console.log("\n2. Launching browser...");
  const { context, close } = await createBrowserContext([
    { name: "connect.sid", value: sessionCookie, domain: ".replit.com", httpOnly: true },
    { name: "replit_authed", value: "1", domain: ".replit.com", httpOnly: false },
  ]);

  const page = await context.newPage();
  await addAntiDetection(page);

  try {
    // 3. Scrape members page
    console.log("\n3. Scraping team members page...");
    const membersText = await navigateAndExtractText(
      page,
      `https://replit.com/t/${TEAM_SLUG}/members`,
      {
        waitMs: 6000,
        screenshotPath: "/tmp/replit-members.png",
        textDumpPath: "/tmp/replit-members-text.txt",
        scrollSteps: 4,
      },
    );

    const parsedMembers = parseMembersPage(membersText);
    console.log(`  Parsed ${parsedMembers.length} members`);

    if (parsedMembers.length === 0) {
      console.error("\n⚠ Could not parse any members from the team page.");
      console.error("  Check /tmp/replit-members-text.txt for the raw page text.");
      console.error("  Check /tmp/replit-members.png for a screenshot.");
      console.error("\n  First 2000 chars of page text:");
      console.error(membersText.substring(0, 2000));
      await close();
      process.exit(1);
    }

    for (const m of parsedMembers) {
      console.log(`    ${m.name} (@${m.username})`);
    }

    // 4. Scrape usage page
    console.log("\n4. Scraping usage page...");
    const usageText = await navigateAndExtractText(
      page,
      `https://replit.com/t/${TEAM_SLUG}/usage`,
      {
        waitMs: 6000,
        screenshotPath: "/tmp/replit-usage.png",
        textDumpPath: "/tmp/replit-usage-text.txt",
        scrollSteps: 4,
      },
    );

    const usage = parseUsageTotal(usageText);

    // 5. Calculate
    // Replit pool model: the usage total IS the vendor total.
    // We store $25/member as attributed + remainder as unattributed
    // so the vendor card adds up to the correct pool total.
    const seatsTotalCents = parsedMembers.length * SEAT_COST_CENTS;
    const poolTotalCents = usage.totalCents;
    const poolRemainderCents = Math.max(0, poolTotalCents - seatsTotalCents);

    console.log(`\n═══ REPLIT SYNC SUMMARY ═══`);
    console.log(`  Credits used this month: $${(usage.creditsUsedCents / 100).toFixed(2)}`);
    console.log(`  Additional usage: $${(usage.additionalUsageCents / 100).toFixed(2)}`);
    console.log(`  Pool total (credits + additional): $${(poolTotalCents / 100).toFixed(2)}`);
    console.log(`  Members: ${parsedMembers.length} × $25 = $${(seatsTotalCents / 100).toFixed(2)}`);
    console.log(`  Pool remainder (unattributed): $${(poolRemainderCents / 100).toFixed(2)}`);
    console.log(`  Vendor card will show: $${(Math.max(poolTotalCents, seatsTotalCents) / 100).toFixed(2)}`);

    if (DRY_RUN) {
      console.log("\n=== DRY RUN COMPLETE — no DB changes made ===");
      await close();
      return;
    }

    // 6. Write to DB
    console.log("\n6. Writing to database...");
    const sql = neon(process.env.DATABASE_URL!);
    const db = drizzle(sql);

    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "assetworks"));
    if (!tenant) { console.error("Tenant 'assetworks' not found!"); process.exit(1); }

    // Period: current month in UTC
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    console.log(`  Period: ${periodStart.toISOString()} → ${periodEnd.toISOString()}`);

    // Delete existing Replit records for this period (both manual and scraper)
    const deleted = await sql`
      DELETE FROM usage_records
      WHERE vendor = 'replit'
        AND tenant_id = ${tenant.id}
        AND period_start = ${periodStart.toISOString()}
      RETURNING id
    `;
    console.log(`  Deleted ${deleted.length} existing Replit records`);

    let membersCreated = 0;
    let membersUpdated = 0;
    let identitiesAdded = 0;

    for (const rm of parsedMembers) {
      // Try to find member by email or by name
      let existing;
      if (rm.email) {
        existing = await db.select().from(members)
          .where(and(eq(members.email, rm.email), eq(members.tenantId, tenant.id)));
      }

      // Fallback: match by name (Replit doesn't always show emails)
      if (!existing || existing.length === 0) {
        existing = await db.select().from(members)
          .where(and(eq(members.name, rm.name), eq(members.tenantId, tenant.id)));
      }

      // Fallback: match by existing replit identity username
      if (!existing || existing.length === 0) {
        const identity = await sql`
          SELECT mi.member_id FROM member_identities mi
          WHERE mi.vendor = 'replit'
            AND lower(mi.vendor_username) = lower(${rm.username})
          LIMIT 1
        `;
        if (identity.length > 0) {
          existing = await db.select().from(members).where(eq(members.id, identity[0].member_id as string));
        }
      }

      let memberId: string;

      if (existing && existing.length > 0) {
        memberId = existing[0].id;
        membersUpdated++;
      } else {
        // Create member — we need an email, derive from username if not available
        memberId = crypto.randomUUID();
        const email = rm.email || `${rm.username}@replit-user.local`;
        await db.insert(members).values({ id: memberId, tenantId: tenant.id, name: rm.name, email });
        membersCreated++;
        console.log(`    + New member: ${rm.name}`);
      }

      // Ensure Replit identity exists
      const existingIdentity = await db.select().from(memberIdentities)
        .where(and(eq(memberIdentities.memberId, memberId), eq(memberIdentities.vendor, "replit")));

      if (existingIdentity.length === 0) {
        await db.insert(memberIdentities).values({
          id: crypto.randomUUID(),
          memberId,
          vendor: "replit",
          vendorUsername: rm.username,
          vendorEmail: rm.email,
        });
        identitiesAdded++;
      }

      // Insert $25 subscription record
      await db.insert(usageRecords).values({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        memberId,
        vendor: "replit",
        spendCents: SEAT_COST_CENTS,
        tokens: null,
        periodStart,
        periodEnd,
        confidence: "high",
        sourceType: "manual",
        vendorUsername: rm.username,
        vendorEmail: rm.email,
      });
    }

    // Insert pool remainder as unattributed (if any)
    if (poolRemainderCents > 0) {
      await db.insert(usageRecords).values({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        memberId: null,
        vendor: "replit",
        spendCents: poolRemainderCents,
        tokens: null,
        periodStart,
        periodEnd,
        confidence: "medium",
        sourceType: "scraper",
        vendorUsername: "pool:usage",
      });
      console.log(`  + Pool remainder: $${(poolRemainderCents / 100).toFixed(2)} (unattributed)`);
    }

    console.log(`\n  Members: ${membersCreated} created, ${membersUpdated} existing`);
    console.log(`  Identities: ${identitiesAdded} added`);
    console.log(`  Usage records: ${parsedMembers.length} seats + ${poolRemainderCents > 0 ? 1 : 0} pool = ${parsedMembers.length + (poolRemainderCents > 0 ? 1 : 0)} total`);
    console.log(`\n=== REPLIT SYNC COMPLETE ===`);
  } finally {
    await close();
  }
}

main().catch(console.error);
