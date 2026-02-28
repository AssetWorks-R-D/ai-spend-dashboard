#!/usr/bin/env npx tsx
/**
 * Captures the Replit connect.sid cookie from Edge's cookie store.
 * Works while Edge is running — reads a copy of the cookie DB.
 *
 * Usage:
 *   npx tsx scripts/replit-auth.ts
 *   npx tsx scripts/replit-auth.ts "Default"    # use a different Edge profile
 */
import { extractEdgeCookie } from "./extract-edge-cookie";

const profileDir = process.argv[2] || "Default";

console.log(`Reading Replit cookie from Edge (profile: ${profileDir})...\n`);

const cookie = extractEdgeCookie("replit.com", "connect.sid", profileDir);

if (cookie) {
  console.log("=== Session cookie captured! ===\n");
  console.log(`connect.sid=${cookie}`);
  console.log("\nPaste this value into the Replit vendor config 'Session Cookie' field.");
  console.log("This cookie typically lasts for several weeks.\n");
} else {
  console.error("Cookie not found. Make sure you're logged into Replit in Edge.");
  process.exit(1);
}
