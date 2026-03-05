#!/usr/bin/env npx tsx
import { neon } from "@neondatabase/serverless";
import { decrypt } from "../src/lib/encryption";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const configs = await sql`SELECT encrypted_credentials FROM vendor_configs WHERE vendor = 'claude'`;
  const creds = JSON.parse(decrypt(configs[0].encrypted_credentials));
  const key = creds.apiKey;
  const headers = { "x-api-key": key, "anthropic-version": "2023-06-01" };

  // Try multiple days
  const days = ["2026-02-01", "2026-02-10", "2026-02-15", "2026-02-20", "2026-02-27", "2026-02-28"];
  for (const day of days) {
    const url = `https://api.anthropic.com/v1/organizations/usage_report/claude_code?starting_at=${day}&limit=3`;
    const res = await fetch(url, { headers });
    const data = await res.json();
    const count = data.data?.length || 0;
    console.log(`${day}: ${count} records${data.has_more ? " (has_more)" : ""}`);
    if (count > 0) {
      console.log("  sample:", JSON.stringify(data.data[0]).substring(0, 300));
    }
  }

  // Also try the web usage endpoint (non-claude_code)
  console.log("\n--- Trying other usage endpoints ---");
  const endpoints = [
    "usage_report/claude_code",
    "usage_report",
  ];
  for (const ep of endpoints) {
    const url = `https://api.anthropic.com/v1/organizations/${ep}?starting_at=2026-02-15&limit=3`;
    const res = await fetch(url, { headers });
    console.log(`${ep}: status ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`  records: ${data.data?.length || 0}, has_more: ${data.has_more}`);
      if (data.data?.length > 0) {
        console.log("  sample:", JSON.stringify(data.data[0]).substring(0, 400));
      }
    }
  }
}

main().catch(console.error);
