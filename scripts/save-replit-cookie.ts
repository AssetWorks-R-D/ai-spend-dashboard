#!/usr/bin/env npx tsx
/**
 * Extracts the Replit cookie from Edge and saves it to vendor_configs in the DB.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/save-replit-cookie.ts
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and } from "drizzle-orm";
import { vendorConfigs, tenants } from "../src/lib/db/schema";
import { encrypt } from "../src/lib/encryption";
import { extractEdgeCookie } from "./extract-edge-cookie";
import crypto from "crypto";

async function main() {
  const profileDir = process.argv[2] || "Default";
  console.log(`Extracting Replit cookie from Edge (profile: ${profileDir})...`);

  let cookie = extractEdgeCookie("replit.com", "connect.sid", profileDir);
  if (!cookie) {
    console.error("Cookie not found. Make sure you're logged into Replit in Edge.");
    process.exit(1);
  }

  // The decrypted cookie may have binary prefix bytes — extract the JWT portion
  const jwtIdx = cookie.indexOf("eyJ");
  if (jwtIdx > 0) {
    cookie = cookie.substring(jwtIdx);
  }
  console.log(`Cookie captured (${cookie.length} chars).\n`);

  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);

  const [tenant] = await db.select().from(tenants).limit(1);
  if (!tenant) {
    console.error("No tenant found.");
    process.exit(1);
  }

  const credentials = { sessionCookie: cookie, teamSlug: "assetworks-rd" };
  const encrypted = encrypt(JSON.stringify(credentials));

  const existing = await db
    .select({ id: vendorConfigs.id })
    .from(vendorConfigs)
    .where(and(eq(vendorConfigs.tenantId, tenant.id), eq(vendorConfigs.vendor, "replit")))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(vendorConfigs)
      .set({ encryptedCredentials: encrypted, updatedAt: new Date() })
      .where(eq(vendorConfigs.id, existing[0].id));
    console.log("Updated existing Replit vendor config.");
  } else {
    await db.insert(vendorConfigs).values({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      vendor: "replit",
      encryptedCredentials: encrypted,
    });
    console.log("Created Replit vendor config.");
  }

  console.log("Done. Replit credentials saved to DB.");
}

main().catch(console.error);
