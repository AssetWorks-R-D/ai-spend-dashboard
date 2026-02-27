#!/usr/bin/env npx tsx
/**
 * Discovery script: scrapes Replit usage pages using Edge's existing session.
 *
 * Usage:
 *   npx tsx scripts/discover-replit.ts [teamSlug]
 *
 * Close Edge before running. Uses your Edge profile's Replit session.
 * Falls back to cookie mode if REPLIT_COOKIE env var is set.
 */
import { scrapeReplitUsage, scrapeReplitUsageWithEdge } from "../src/lib/scrapers/replit";

async function main() {
  const teamSlug = process.argv[2] || undefined;
  const cookie = process.env.REPLIT_COOKIE;

  console.log("Scraping Replit usage...");
  if (teamSlug) console.log(`Team slug: ${teamSlug}`);

  let result;
  if (cookie) {
    console.log("Mode: cookie-based\n");
    result = await scrapeReplitUsage(cookie, teamSlug);
  } else {
    console.log("Mode: Edge browser profile (close Edge first!)\n");
    result = await scrapeReplitUsageWithEdge(teamSlug);
  }

  console.log("\n--- Results ---");
  console.log(`Rows: ${result.rows.length}`);
  console.log(`Team: ${result.teamName}`);
  if (result.error) console.log(`Error: ${result.error}`);
  console.log(`Screenshots: ${result.screenshotPaths.join(", ")}`);

  for (const row of result.rows) {
    console.log(`  ${row.username} | ${row.category} | $${(row.spendCents / 100).toFixed(2)}`);
  }
}

main().catch(console.error);
