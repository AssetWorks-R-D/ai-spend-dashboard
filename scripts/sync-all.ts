#!/usr/bin/env npx tsx
/**
 * Unified daily-diff sync orchestrator.
 *
 * For each vendor:
 *   1. Fetch current cumulative snapshot (API or scraper)
 *   2. Load previous snapshot from vendor_snapshots DB table
 *   3. Compute delta (with billing reset detection)
 *   4. Write daily delta records to usage_records
 *   5. Save new snapshot to vendor_snapshots
 *
 * Usage:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/sync-all.ts
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/sync-all.ts --dry-run
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/sync-all.ts --api-only
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/sync-all.ts --vendor cursor
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { vendorConfigs } from "../src/lib/db/schema";
import type { ApiVendor } from "../src/types/index";
import {
  type VendorSnapshot,
  loadDiffBase,
  saveSnapshot,
  computeDiff,
} from "./lib/snapshot-store";
import {
  getTenantId,
  writeDailyRecords,
  deltasToRecords,
} from "./lib/daily-sync-db";
import {
  fetchCursorSnapshot,
  fetchCopilotSnapshot,
  fetchOpenAISnapshot,
} from "./lib/vendor-fetchers";

// ─── Config ─────────────────────────────────────────────────────

const API_VENDORS: ApiVendor[] = ["cursor", "copilot", "openai"];
const SCRAPER_VENDORS: ApiVendor[] = ["claude", "replit"];

// Inline decryption (avoids @/ path alias issues)
function decrypt(ciphertext: string): string {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY!;
  const keyBuf = key.length === 64 ? Buffer.from(key, "hex") : Buffer.from(key, "base64");
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]).toString("utf8");
}

// ─── CLI Args ───────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const apiOnly = args.includes("--api-only");
const vendorFlag = args.find((a) => a.startsWith("--vendor="))?.split("=")[1] as ApiVendor | undefined;
// Also handle --vendor cursor (two-arg form)
const vendorIdx = args.indexOf("--vendor");
const vendorArg = vendorFlag || (vendorIdx >= 0 ? args[vendorIdx + 1] as ApiVendor : undefined);

// ─── Vendor Fetcher Map ─────────────────────────────────────────

type SnapshotFetcher = (credentials: Record<string, string>) => Promise<VendorSnapshot>;

const apiFetchers: Record<string, SnapshotFetcher> = {
  cursor: fetchCursorSnapshot,
  copilot: fetchCopilotSnapshot,
  openai: fetchOpenAISnapshot,
};

// ─── Main ───────────────────────────────────────────────────────

async function syncVendor(
  vendor: ApiVendor,
  snapshot: VendorSnapshot,
  db: ReturnType<typeof drizzle>,
  tenantId: string,
): Promise<void> {
  const diffBase = await loadDiffBase(db, vendor);

  if (!diffBase) {
    // First run: save baseline, no delta records
    console.log(`  💾 First run — saving baseline snapshot (${snapshot.members.length} members)`);
    if (!dryRun) {
      await saveSnapshot(db, vendor, snapshot);
    }
    console.log(`  ℹ️  Run again later to capture daily deltas\n`);
    return;
  }

  // Compute diff
  const diff = computeDiff(snapshot, diffBase);
  const sourceType = API_VENDORS.includes(vendor) ? "api" as const : "scraper" as const;
  const records = deltasToRecords(vendor, diff.deltas, diff.newMembers, sourceType);

  // Log deltas
  if (diff.deltas.length === 0 && diff.newMembers.length === 0) {
    console.log(`  ⏸️  No changes since last sync`);
  } else {
    for (const d of diff.deltas) {
      const name = d.vendorUsername || d.vendorEmail || "(unknown)";
      const reset = d.billingReset ? " [BILLING RESET]" : "";
      console.log(`  Δ ${name}: +$${(d.deltaSpendCents / 100).toFixed(2)}${reset}`);
    }
    for (const m of diff.newMembers) {
      const name = m.vendorUsername || m.vendorEmail || "(unknown)";
      console.log(`  + ${name}: $${(m.spendCents / 100).toFixed(2)} (new member)`);
    }
  }

  // Write daily records
  if (records.length > 0) {
    const count = await writeDailyRecords(db, tenantId, records, { dryRun });
    console.log(`  📝 ${dryRun ? "Would write" : "Wrote"} ${count} daily records`);
  }

  // Update snapshot
  if (!dryRun) {
    await saveSnapshot(db, vendor, snapshot);
  }
  console.log(`  💾 ${dryRun ? "Would save" : "Saved"} snapshot\n`);
}

async function main() {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`  DAILY DIFF SYNC ${dryRun ? "(DRY RUN)" : ""}`);
  console.log(`  ${new Date().toISOString()}`);
  console.log(`${"=".repeat(50)}\n`);

  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);
  const tenantId = await getTenantId(db);

  // Determine which vendors to sync
  let vendors: ApiVendor[];
  if (vendorArg) {
    vendors = [vendorArg];
  } else if (apiOnly) {
    vendors = API_VENDORS;
  } else {
    vendors = [...API_VENDORS, ...SCRAPER_VENDORS];
  }

  // Load vendor configs for API vendors
  const configs = await db.select().from(vendorConfigs);
  const configMap = new Map(configs.map((c) => [c.vendor, c]));

  // Sync API vendors (can run in parallel)
  const apiVendorsToSync = vendors.filter((v) => API_VENDORS.includes(v));
  const scraperVendorsToSync = vendors.filter((v) => SCRAPER_VENDORS.includes(v));

  // API vendors
  const apiResults = await Promise.allSettled(
    apiVendorsToSync.map(async (vendor) => {
      console.log(`🔄 ${vendor.toUpperCase()}`);
      const config = configMap.get(vendor);
      if (!config?.encryptedCredentials) {
        console.log(`  ⚠️  No credentials configured — skipping\n`);
        return;
      }

      const fetcher = apiFetchers[vendor];
      if (!fetcher) {
        console.log(`  ⚠️  No fetcher available — skipping\n`);
        return;
      }

      try {
        const credentials = JSON.parse(decrypt(config.encryptedCredentials));
        const snapshot = await fetcher(credentials);
        console.log(`  ✅ Fetched ${snapshot.members.length} members`);
        await syncVendor(vendor, snapshot, db, tenantId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ❌ Error: ${msg.slice(0, 200)}\n`);
      }
    }),
  );

  // Scraper vendors
  if (scraperVendorsToSync.length > 0) {
    console.log("─── Scraper Vendors ───\n");
    console.log("Scraper vendors (Claude, Replit) require Playwright + Edge cookies.");
    console.log("Run them individually:\n");
    for (const vendor of scraperVendorsToSync) {
      if (vendor === "claude") {
        console.log("  npx dotenv-cli -e .env.local -- npx tsx scripts/sync-claude-local.ts");
      } else if (vendor === "replit") {
        console.log("  npx dotenv-cli -e .env.local -- npx tsx scripts/sync-replit-local.ts");
      }
    }
    console.log("\nOnce scraped, re-run sync-all with --api-only to skip scrapers.\n");
  }

  // Summary
  const succeeded = apiResults.filter((r) => r.status === "fulfilled").length;
  const failed = apiResults.filter((r) => r.status === "rejected").length;
  console.log(`${"=".repeat(50)}`);
  console.log(`  Done: ${succeeded} vendors synced${failed ? `, ${failed} failed` : ""}`);
  if (dryRun) console.log("  (DRY RUN — no changes made)");
  console.log(`${"=".repeat(50)}\n`);
}

main().catch(console.error);
