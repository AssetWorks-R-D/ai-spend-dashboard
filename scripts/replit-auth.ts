#!/usr/bin/env npx tsx
/**
 * Captures the Replit connect.sid cookie from your Edge browser profile.
 *
 * How it works:
 *   1. Launches Edge using your existing profile (already logged into Replit)
 *   2. Navigates to replit.com to verify the session
 *   3. Extracts and prints the connect.sid cookie
 *
 * Prerequisites:
 *   - Close Edge completely before running
 *   - Must be logged into Replit in Edge
 *
 * Usage:
 *   npx tsx scripts/replit-auth.ts
 *   npx tsx scripts/replit-auth.ts "Default"    # use a different Edge profile
 */
import { captureReplitCookieFromEdge } from "../src/lib/scrapers/replit";

async function main() {
  const profileDir = process.argv[2] || "Profile 1";

  console.log(`Launching Edge (profile: ${profileDir})...`);
  console.log("Make sure Edge is closed first.\n");

  const { cookie, error } = await captureReplitCookieFromEdge(profileDir);

  if (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }

  console.log("\n=== Session cookie captured! ===\n");
  console.log(`connect.sid=${cookie}`);
  console.log("\nPaste this value into the Replit vendor config 'Session Cookie' field.");
  console.log("This cookie typically lasts for several weeks.\n");
}

main().catch(console.error);
