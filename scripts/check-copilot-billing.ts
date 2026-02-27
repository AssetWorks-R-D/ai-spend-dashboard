#!/usr/bin/env npx tsx
/**
 * Checks GitHub Copilot billing/usage data and compares with DB records.
 * Run: npx dotenv -e .env.local -- npx tsx scripts/check-copilot-billing.ts
 *
 * Requires GITHUB_ORG and GITHUB_PAT env vars (or set below).
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { usageRecords, members } from "../src/lib/db/schema";

const GITHUB_ORG = process.env.GITHUB_ORG || "";
const GITHUB_PAT = process.env.GITHUB_PAT || "";

async function main() {
  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);

  // Show existing DB records
  const records = await db
    .select({
      memberName: members.name,
      spendCents: usageRecords.spendCents,
      memberId: usageRecords.memberId,
    })
    .from(usageRecords)
    .leftJoin(members, eq(usageRecords.memberId, members.id))
    .where(eq(usageRecords.vendor, "copilot"));

  let totalDb = 0;
  console.log("=== CURRENT COPILOT DB RECORDS ===");
  for (const r of records.sort((a, b) => b.spendCents - a.spendCents)) {
    totalDb += r.spendCents;
    console.log(`  ${r.memberName || "(unattributed)"}: $${(r.spendCents / 100).toFixed(2)}`);
  }
  console.log(`  TOTAL: $${(totalDb / 100).toFixed(2)} across ${records.length} records\n`);

  if (!GITHUB_ORG || !GITHUB_PAT) {
    console.log("Set GITHUB_ORG and GITHUB_PAT env vars to check GitHub billing.");
    console.log("Or check your GitHub billing page directly at:");
    console.log("  https://github.com/organizations/<org>/settings/billing\n");
    return;
  }

  console.log(`Organization: ${GITHUB_ORG}\n`);

  const headers = {
    Authorization: `Bearer ${GITHUB_PAT}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // Try billing endpoint
  console.log("=== GITHUB COPILOT BILLING ===");
  const billingRes = await fetch(
    `https://api.github.com/orgs/${GITHUB_ORG}/copilot/billing`,
    { headers }
  );
  if (billingRes.ok) {
    const billing = await billingRes.json();
    console.log(JSON.stringify(billing, null, 2));
  } else {
    console.log(`  ${billingRes.status} ${billingRes.statusText}`);
  }

  // Try usage metrics endpoint
  console.log("\n=== GITHUB COPILOT USAGE METRICS ===");
  const usageRes = await fetch(
    `https://api.github.com/orgs/${GITHUB_ORG}/copilot/usage`,
    { headers }
  );
  if (usageRes.ok) {
    const usage = await usageRes.json();
    if (Array.isArray(usage)) {
      console.log(`  ${usage.length} days of data`);
      if (usage.length > 0) {
        console.log("  Latest:", JSON.stringify(usage[usage.length - 1], null, 2));
      }
    } else {
      console.log(JSON.stringify(usage, null, 2));
    }
  } else {
    console.log(`  ${usageRes.status} ${usageRes.statusText}`);
  }

  // Try metrics endpoint (newer)
  console.log("\n=== GITHUB COPILOT METRICS ===");
  const metricsRes = await fetch(
    `https://api.github.com/orgs/${GITHUB_ORG}/copilot/metrics`,
    { headers }
  );
  if (metricsRes.ok) {
    const metrics = await metricsRes.json();
    if (Array.isArray(metrics) && metrics.length > 0) {
      console.log(`  ${metrics.length} entries`);
      console.log("  Latest:", JSON.stringify(metrics[metrics.length - 1], null, 2));
    } else {
      console.log(JSON.stringify(metrics, null, 2));
    }
  } else {
    console.log(`  ${metricsRes.status} ${metricsRes.statusText}`);
  }

  console.log("\n---");
  console.log("If you see premium request charges on your GitHub billing page,");
  console.log("update COPILOT_USAGE_CENTS in scripts/add-copilot-usage.ts and run it.");
}

main().catch(console.error);
