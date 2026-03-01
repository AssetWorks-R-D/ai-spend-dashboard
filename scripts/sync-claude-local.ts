#!/usr/bin/env npx tsx
/**
 * End-to-end Claude Team data sync via local browser scraping.
 *
 * 1. Extracts Edge session cookie
 * 2. Scrapes /admin-settings/identity-and-access → member list with seat types
 * 3. Scrapes /admin-settings/usage → per-member overage spend
 * 4. Writes members, identities, and usage records to DB
 *
 * Usage:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/sync-claude-local.ts
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/sync-claude-local.ts --dry-run
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and } from "drizzle-orm";
import { members, memberIdentities, usageRecords, tenants } from "../src/lib/db/schema";
import crypto from "crypto";
import {
  extractClaudeCookies,
  createBrowserContext,
  addAntiDetection,
  parseDollarsToCents,
} from "./lib/scraper-helpers";

// ─── Config ──────────────────────────────────────────────────

const STANDARD_SEAT_CENTS = 2500; // $25/mo
const PREMIUM_SEAT_CENTS = 10000; // $100/mo
const BLENDED_COST_PER_MILLION_TOKENS = 6; // $6/1M tokens

const DRY_RUN = process.argv.includes("--dry-run");

function estimateTokens(spendCents: number): number {
  if (spendCents <= 0) return 0;
  return Math.round((spendCents / 100 / BLENDED_COST_PER_MILLION_TOKENS) * 1_000_000);
}

// ─── Parsers ─────────────────────────────────────────────────

interface ClaudeMember {
  name: string;
  email: string;
  seatType: "standard" | "premium";
}

interface ClaudeUsageEntry {
  email: string;
  overageCents: number;
}

/**
 * Parse the Organization settings page text.
 * Actual format (blank lines filtered out):
 *   DisplayName          (may be truncated/nickname)
 *   email@domain.com
 *   Role                 (User / Owner / Primary Owner)
 *   SeatTier             (Standard / Premium)
 *   Active
 */
function parseIdentityPage(text: string): ClaudeMember[] {
  const members: ClaudeMember[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for email pattern
    const emailMatch = line.match(/^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
    if (!emailMatch) continue;

    const email = emailMatch[1].toLowerCase();

    // Display name is the line before the email
    const displayName = i > 0 ? lines[i - 1].trim() : null;
    if (!displayName || displayName.includes("@") || displayName.length > 60) continue;

    // Skip navigation/header text
    const skipWords = ["Settings", "Members", "Identity", "Billing", "Usage", "Admin", "Home", "Name", "Export CSV", "Add member"];
    if (skipWords.includes(displayName)) continue;

    // Seat type: look ONLY in the lines AFTER the email (within 4 lines)
    // Format: email → Role → SeatTier → Active
    let seatType: "standard" | "premium" = "standard";
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const lower = lines[j].toLowerCase();
      if (lower === "premium") { seatType = "premium"; break; }
      if (lower === "standard") { seatType = "standard"; break; }
    }

    // Derive full name from email if display name looks truncated (single word)
    const fullName = deriveFullName(displayName, email);

    // Deduplicate by email
    if (!members.some((m) => m.email === email)) {
      members.push({ name: fullName, email, seatType });
    }
  }

  return members;
}

/**
 * Derive a full name from a display name + email.
 * Claude shows nicknames like "Aaron" instead of "Aaron Davis".
 * If the display name is a single word, try to build a full name from the email.
 * e.g., "Aaron" + "aaron.davis@assetworks.com" → "Aaron Davis"
 */
function deriveFullName(displayName: string, email: string): string {
  // If display name already has multiple words, use it as-is
  if (displayName.includes(" ") && !displayName.includes("(")) return displayName;

  // Try to extract name parts from email (first.last@domain)
  const localPart = email.split("@")[0];
  const parts = localPart.split(/[._-]/);

  if (parts.length >= 2) {
    const fullFromEmail = parts
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(" ");
    return fullFromEmail;
  }

  // Fall back to display name
  return displayName;
}

/**
 * Parse the Usage page text.
 * Actual format: the "Spend limits by user" section has a table where each member is:
 *   DisplayName
 *   email@domain.com
 *   – (dash = no custom limit, or a limit value)
 *   $XX.XX (MTD Spend)
 *
 * We scan for emails and look for the next dollar amount after each email.
 */
function parseUsagePage(text: string): ClaudeUsageEntry[] {
  const entries: ClaudeUsageEntry[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Find the "Spend limits by user" section to avoid false matches from header
  const sectionStart = lines.findIndex((l) => l.includes("Spend limits by user"));
  const startIdx = sectionStart >= 0 ? sectionStart : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];

    // Look for email pattern
    const emailMatch = line.match(/^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
    if (!emailMatch) continue;

    const email = emailMatch[1].toLowerCase();

    // Look for dollar amount in the next few lines after the email
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const dollarMatch = lines[j].match(/^\$[\d,]+\.?\d*$/);
      if (dollarMatch) {
        const cents = parseDollarsToCents(dollarMatch[0]);
        entries.push({ email, overageCents: cents });
        break;
      }
    }
  }

  return entries;
}

/** Extended usage entry that keys on email instead of display name */
interface ClaudeUsageByEmail {
  email: string;
  overageCents: number;
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required. Run: npx dotenv-cli -e .env.local -- npx tsx scripts/sync-claude-local.ts");
    process.exit(1);
  }

  console.log(DRY_RUN ? "=== DRY RUN (no DB writes) ===" : "=== CLAUDE LOCAL SYNC ===");

  // 1. Extract cookies
  console.log("\n1. Extracting Edge cookies...");
  const { sessionKey, orgId } = extractClaudeCookies();
  console.log(`  Session key: ${sessionKey.substring(0, 30)}...`);
  if (orgId) console.log(`  Org ID: ${orgId}`);

  // 2. Launch browser
  console.log("\n2. Launching browser...");
  const cookies = [
    { name: "sessionKey", value: sessionKey, domain: ".claude.ai", httpOnly: true },
  ];
  if (orgId) {
    cookies.push({ name: "lastActiveOrg", value: orgId, domain: ".claude.ai", httpOnly: false });
  }

  const { context, close } = await createBrowserContext(cookies);
  const page = await context.newPage();
  await addAntiDetection(page);

  try {
    // 3. Verify session by loading homepage first, then scrape admin pages
    console.log("\n3. Verifying session...");
    await page.goto("https://claude.ai", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    const homeUrl = page.url();
    console.log(`  Home URL: ${homeUrl}`);
    if (homeUrl.includes("login")) {
      console.error("  Session appears expired — redirected to login.");
      console.error("  Please log into claude.ai in Edge and try again.");
      await close();
      process.exit(1);
    }

    // Try to find the correct admin settings URL
    // Claude may use /settings/ or /admin-settings/ depending on the org type
    console.log("\n4. Scraping Identity & Access page...");
    const IDENTITY_URLS = [
      "https://claude.ai/settings/identity-and-access",
      "https://claude.ai/admin-settings/identity-and-access",
      "https://claude.ai/settings/organization",
      "https://claude.ai/settings/members",
    ];

    let identityText = "";
    for (const url of IDENTITY_URLS) {
      console.log(`  Trying: ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(5000);
      const pageText = await page.evaluate(() => document.body.innerText);
      if (!pageText.includes("404") && pageText.length > 200) {
        identityText = pageText;
        console.log(`  Found working URL: ${url}`);

        // Click "Show more" if present to load all members
        const showMore = page.locator('button:has-text("Show more"), a:has-text("Show more")').first();
        for (let attempt = 0; attempt < 5; attempt++) {
          if (await showMore.isVisible({ timeout: 2000 }).catch(() => false)) {
            await showMore.click();
            await page.waitForTimeout(2000);
          } else {
            break;
          }
        }

        // Scroll through to ensure all content loaded
        for (let i = 0; i < 6; i++) {
          await page.evaluate(() => window.scrollBy(0, 800));
          await page.waitForTimeout(1000);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        identityText = await page.evaluate(() => document.body.innerText);
        await page.screenshot({ path: "/tmp/claude-identity.png", fullPage: true });
        const { writeFileSync } = await import("fs");
        writeFileSync("/tmp/claude-identity-text.txt", identityText, "utf8");
        console.log(`  Screenshot: /tmp/claude-identity.png`);
        console.log(`  Text dump: /tmp/claude-identity-text.txt`);
        break;
      }
    }

    if (!identityText || identityText.includes("404")) {
      console.error("\n⚠ Could not find the identity/members admin page.");
      console.error("  Tried URLs:", IDENTITY_URLS);
      console.error("  Please check the correct URL in your browser and update the script.");
      await page.screenshot({ path: "/tmp/claude-identity.png", fullPage: true });
      await close();
      process.exit(1);
    }

    const parsedMembers = parseIdentityPage(identityText);
    console.log(`  Parsed ${parsedMembers.length} members from identity page`);

    if (parsedMembers.length === 0) {
      console.error("\n⚠ Could not parse any members from the identity page.");
      console.error("  Check /tmp/claude-identity-text.txt for the raw page text.");
      console.error("  Check /tmp/claude-identity.png for a screenshot.");
      console.error("\n  First 2000 chars of page text:");
      console.error(identityText.substring(0, 2000));
      await close();
      process.exit(1);
    }

    for (const m of parsedMembers) {
      console.log(`    ${m.seatType === "premium" ? "★" : " "} ${m.name} <${m.email}> [${m.seatType}]`);
    }

    // 5. Scrape org Usage page (shows per-member overage spend)
    //    The org settings sidebar has: Organization | Billing | Usage | ...
    //    We need the org-level "Usage" (not personal /settings/usage which shows rate limits)
    console.log("\n5. Scraping org Usage page...");
    const USAGE_URLS = [
      "https://claude.ai/settings/organization/usage",
      "https://claude.ai/admin-settings/usage",
      "https://claude.ai/settings/billing",
      "https://claude.ai/settings/organization/billing",
    ];

    let usageText = "";
    let usageFound = false;

    // Strategy 1: Try direct URLs
    for (const url of USAGE_URLS) {
      console.log(`  Trying: ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(5000);
      const pageText = await page.evaluate(() => document.body.innerText);
      // The usage page should contain dollar amounts and member-like content
      if (!pageText.includes("404") && pageText.length > 200 && pageText.includes("$")) {
        usageText = pageText;
        usageFound = true;
        console.log(`  Found working URL: ${url}`);
        break;
      }
    }

    // Strategy 2: Navigate to org page and click the "Usage" sidebar link
    if (!usageFound) {
      console.log("  Trying sidebar navigation from organization page...");
      await page.goto("https://claude.ai/settings/organization", { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(5000);

      // Try clicking "Usage" link in sidebar
      const usageLink = page.locator('a:has-text("Usage"), [role="tab"]:has-text("Usage"), button:has-text("Usage")').first();
      if (await usageLink.isVisible()) {
        await usageLink.click();
        await page.waitForTimeout(5000);
        const pageText = await page.evaluate(() => document.body.innerText);
        if (pageText.includes("$") && pageText.length > 200) {
          usageText = pageText;
          usageFound = true;
          console.log(`  Found via sidebar click. URL: ${page.url()}`);
        }
      }
    }

    if (usageFound) {
      // Scroll through to load all content
      for (let i = 0; i < 6; i++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(1000);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      usageText = await page.evaluate(() => document.body.innerText);
      await page.screenshot({ path: "/tmp/claude-usage.png", fullPage: true });
      const { writeFileSync } = await import("fs");
      writeFileSync("/tmp/claude-usage-text.txt", usageText, "utf8");
      console.log(`  Screenshot: /tmp/claude-usage.png`);
      console.log(`  Text dump: /tmp/claude-usage-text.txt`);
    } else {
      console.warn("\n⚠ Could not find the org usage page.");
      console.warn("  Overage data will be $0 for all members. Only seat costs will be recorded.");
      console.warn("  Check the correct URL in your browser and update USAGE_URLS in the script.");
    }

    const parsedUsage = parseUsagePage(usageText);
    console.log(`  Parsed ${parsedUsage.length} usage entries from usage page`);
    for (const u of parsedUsage) {
      if (u.overageCents > 0) console.log(`    ${u.email}: $${(u.overageCents / 100).toFixed(2)} overage`);
    }

    // Build email→overageCents lookup from usage page
    const usageByEmail = new Map<string, number>();
    for (const u of parsedUsage) {
      usageByEmail.set(u.email.toLowerCase(), u.overageCents);
    }

    // Add any members found on usage page but missing from identity page
    // (usage page showed 31, identity might show 30 without "Show more")
    for (const u of parsedUsage) {
      if (!parsedMembers.some((m) => m.email === u.email)) {
        const fullName = deriveFullName(u.email.split("@")[0], u.email);
        parsedMembers.push({ name: fullName, email: u.email, seatType: "standard" });
        console.log(`  + Added from usage page: ${fullName} <${u.email}> [standard]`);
      }
    }

    // 6. Match members with usage
    console.log("\n6. Matching members with usage data...");

    interface MergedMember {
      name: string;
      email: string;
      seatType: "standard" | "premium";
      overageCents: number;
      seatCents: number;
      totalCents: number;
    }

    const merged: MergedMember[] = parsedMembers.map((m) => {
      const seatCents = m.seatType === "premium" ? PREMIUM_SEAT_CENTS : STANDARD_SEAT_CENTS;
      const overageCents = usageByEmail.get(m.email.toLowerCase()) ?? 0;

      return {
        name: m.name,
        email: m.email,
        seatType: m.seatType,
        overageCents,
        seatCents,
        totalCents: seatCents + overageCents,
      };
    });

    // Print summary
    const premiumCount = merged.filter((m) => m.seatType === "premium").length;
    const standardCount = merged.length - premiumCount;
    const totalSeatCents = merged.reduce((s, m) => s + m.seatCents, 0);
    const totalOverageCents = merged.reduce((s, m) => s + m.overageCents, 0);
    const totalCents = merged.reduce((s, m) => s + m.totalCents, 0);

    console.log(`\n═══ CLAUDE SYNC SUMMARY ═══`);
    console.log(`  Members: ${merged.length} (${standardCount} standard, ${premiumCount} premium)`);
    console.log(`  Seats: $${(totalSeatCents / 100).toFixed(2)}`);
    console.log(`  Overage: $${(totalOverageCents / 100).toFixed(2)}`);
    console.log(`  Total: $${(totalCents / 100).toFixed(2)}`);
    console.log();

    for (const m of merged) {
      const tierLabel = m.seatType === "premium" ? "PREMIUM" : "standard";
      const overageStr = m.overageCents > 0 ? ` + $${(m.overageCents / 100).toFixed(2)} overage` : "";
      console.log(`  ${m.name}: $${(m.seatCents / 100).toFixed(2)} seat${overageStr} = $${(m.totalCents / 100).toFixed(2)} [${tierLabel}]`);
    }

    if (DRY_RUN) {
      console.log("\n=== DRY RUN COMPLETE — no DB changes made ===");
      await close();
      return;
    }

    // 7. Write to DB
    console.log("\n7. Writing to database...");
    const sql = neon(process.env.DATABASE_URL!);
    const db = drizzle(sql);

    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "assetworks"));
    if (!tenant) { console.error("Tenant 'assetworks' not found!"); process.exit(1); }

    // Period: current month in UTC
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    console.log(`  Period: ${periodStart.toISOString()} → ${periodEnd.toISOString()}`);

    // Delete existing Claude scraper records for this period
    const deleted = await sql`
      DELETE FROM usage_records
      WHERE vendor = 'claude'
        AND source_type = 'scraper'
        AND tenant_id = ${tenant.id}
        AND period_start = ${periodStart.toISOString()}
      RETURNING id
    `;
    console.log(`  Deleted ${deleted.length} existing Claude scraper records`);

    let membersCreated = 0;
    let membersUpdated = 0;
    let identitiesAdded = 0;
    let usageCreated = 0;

    for (const m of merged) {
      // Find or create member
      const existing = await db.select().from(members)
        .where(and(eq(members.email, m.email), eq(members.tenantId, tenant.id)));

      let memberId: string;

      if (existing.length > 0) {
        memberId = existing[0].id;
        if (existing[0].name !== m.name) {
          await db.update(members).set({ name: m.name, updatedAt: new Date() }).where(eq(members.id, memberId));
        }
        membersUpdated++;
      } else {
        memberId = crypto.randomUUID();
        await db.insert(members).values({ id: memberId, tenantId: tenant.id, name: m.name, email: m.email });
        membersCreated++;
      }

      // Ensure Claude identity exists
      const existingIdentity = await db.select().from(memberIdentities)
        .where(and(eq(memberIdentities.memberId, memberId), eq(memberIdentities.vendor, "claude")));

      if (existingIdentity.length === 0) {
        await db.insert(memberIdentities).values({
          id: crypto.randomUUID(),
          memberId,
          vendor: "claude",
          vendorEmail: m.email,
          vendorUsername: m.name,
        });
        identitiesAdded++;
      }

      // Insert usage record
      const tokens = estimateTokens(m.totalCents);
      await db.insert(usageRecords).values({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        memberId,
        vendor: "claude",
        spendCents: m.totalCents,
        tokens,
        periodStart,
        periodEnd,
        confidence: m.overageCents > 0 ? "high" : "medium",
        sourceType: "scraper",
        vendorUsername: m.name,
        vendorEmail: m.email,
      });
      usageCreated++;
    }

    console.log(`\n  Members: ${membersCreated} created, ${membersUpdated} updated`);
    console.log(`  Identities: ${identitiesAdded} added`);
    console.log(`  Usage records: ${usageCreated} created`);
    console.log(`\n=== CLAUDE SYNC COMPLETE ===`);
  } finally {
    await close();
  }
}

main().catch(console.error);
