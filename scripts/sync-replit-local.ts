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
import type { VendorSnapshot, MemberSnapshot } from "./lib/snapshot-store";
import { loadDiffBase, saveSnapshot, computeDiff } from "./lib/snapshot-store";
import { getTenantId, writeDailyRecords, writeSeatCostRecords, deltasToRecords } from "./lib/daily-sync-db";
import { VENDOR_SEAT_COSTS } from "./lib/vendor-fetchers";

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

    // 5b. Build snapshot (pool usage only — no seat costs)
    //     For Replit's pool model, we track the total pool spend minus seat costs
    //     as the "overage" snapshot. Individual members get $0 since usage is pooled.
    console.log("\n5b. Building overage snapshot...");
    const snapshotMembers: MemberSnapshot[] = parsedMembers.map((rm) => ({
      vendorEmail: rm.email,
      vendorUsername: rm.username,
      spendCents: 0, // Replit doesn't attribute usage to individuals
      tokens: null,
    }));

    // The pool remainder (total - seats) is tracked at the vendor level
    const snapshot: VendorSnapshot = {
      vendor: "replit",
      members: snapshotMembers,
      vendorTotalCents: poolRemainderCents, // Overage beyond seat costs
    };

    if (DRY_RUN) {
      console.log(`  Would save snapshot with ${snapshotMembers.length} members, pool: $${(poolRemainderCents / 100).toFixed(2)}`);
      console.log("\n=== DRY RUN COMPLETE — no DB changes made ===");
      await close();
      return;
    }

    // 6. Write to DB via daily diff pipeline
    console.log("\n6. Running daily diff pipeline...");
    const sql = neon(process.env.DATABASE_URL!);
    const db = drizzle(sql);

    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "assetworks"));
    if (!tenant) { console.error("Tenant 'assetworks' not found!"); process.exit(1); }
    const tenantId = tenant.id;

    // Ensure members and identities exist
    let membersCreated = 0;
    let membersUpdated = 0;
    let identitiesAdded = 0;

    for (const rm of parsedMembers) {
      let existing;
      if (rm.email) {
        existing = await db.select().from(members)
          .where(and(eq(members.email, rm.email), eq(members.tenantId, tenantId)));
      }

      if (!existing || existing.length === 0) {
        existing = await db.select().from(members)
          .where(and(eq(members.name, rm.name), eq(members.tenantId, tenantId)));
      }

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
        memberId = crypto.randomUUID();
        const email = rm.email || `${rm.username}@replit-user.local`;
        await db.insert(members).values({ id: memberId, tenantId, name: rm.name, email });
        membersCreated++;
        console.log(`    + New member: ${rm.name}`);
      }

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
    }

    console.log(`  Members: ${membersCreated} created, ${membersUpdated} existing`);
    console.log(`  Identities: ${identitiesAdded} added`);

    // Daily diff: load previous snapshot, compute delta, write records
    const diffBase = await loadDiffBase(db, "replit");

    if (!diffBase) {
      console.log(`  💾 First run — saving baseline snapshot (${snapshot.members.length} members, pool: $${(poolRemainderCents / 100).toFixed(2)})`);
      await saveSnapshot(db, "replit", snapshot);
      console.log(`  ℹ️  Run again later to capture daily deltas`);
    } else {
      const diff = computeDiff(snapshot, diffBase);

      // For Replit pool model: write vendor-level delta as unattributed record
      if (diff.vendorTotalDeltaCents && diff.vendorTotalDeltaCents > 0) {
        console.log(`  Δ Pool usage: +$${(diff.vendorTotalDeltaCents / 100).toFixed(2)}`);
        const poolRecords = [{
          vendor: "replit" as const,
          vendorEmail: null,
          vendorUsername: "pool:usage",
          spendCents: diff.vendorTotalDeltaCents,
          tokens: null,
          confidence: "medium" as const,
          sourceType: "scraper" as const,
        }];
        const count = await writeDailyRecords(db, tenantId, poolRecords);
        console.log(`  📝 Wrote ${count} pool usage record`);
      } else {
        console.log(`  ⏸️  No pool usage changes since last sync`);
      }

      await saveSnapshot(db, "replit", snapshot);
      console.log(`  💾 Saved snapshot`);
    }

    // Write seat costs on first sync of calendar month
    const seatConfig = VENDOR_SEAT_COSTS["replit"];
    if (seatConfig?.defaultCents) {
      const seatCount = await writeSeatCostRecords(db, tenantId, "replit", seatConfig.defaultCents, snapshot.members);
      if (seatCount > 0) {
        console.log(`  🪑 Wrote ${seatCount} seat records ($${(seatConfig.defaultCents / 100).toFixed(2)}/seat)`);
      }
    }

    console.log(`\n=== REPLIT SYNC COMPLETE ===`);
  } finally {
    await close();
  }
}

main().catch(console.error);
