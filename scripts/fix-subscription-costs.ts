#!/usr/bin/env npx tsx
/**
 * Adds subscription/seat costs to Cursor usage records.
 * Cursor: $40/seat/month — the API only returns usage spend, not the seat fee.
 * Also re-estimates tokens for the updated totals.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { usageRecords, members } from "../src/lib/db/schema";

const CURSOR_SEAT_CENTS = 4000; // $40/seat/month
const BLENDED_COST_PER_MILLION_TOKENS = 6; // same as cursor adapter

function estimateTokens(spendCents: number): number {
  if (spendCents <= 0) return 0;
  return Math.round((spendCents / 100 / BLENDED_COST_PER_MILLION_TOKENS) * 1_000_000);
}

async function main() {
  const sql = neon(process.env.DATABASE_URL as string);
  const db = drizzle(sql);

  // Get all Cursor usage records
  const cursorRecords = await db
    .select({
      id: usageRecords.id,
      memberId: usageRecords.memberId,
      spendCents: usageRecords.spendCents,
      tokens: usageRecords.tokens,
    })
    .from(usageRecords)
    .where(eq(usageRecords.vendor, "cursor"));

  console.log(`=== Updating ${cursorRecords.length} Cursor records ===`);
  console.log(`Adding $${(CURSOR_SEAT_CENTS / 100).toFixed(2)} seat cost to each\n`);

  let totalAdded = 0;
  for (const r of cursorRecords) {
    const newSpend = r.spendCents + CURSOR_SEAT_CENTS;
    const newTokens = estimateTokens(newSpend);

    // Get member name for logging
    const [member] = r.memberId
      ? await db.select({ name: members.name }).from(members).where(eq(members.id, r.memberId))
      : [{ name: "Unknown" }];

    await db
      .update(usageRecords)
      .set({ spendCents: newSpend, tokens: newTokens })
      .where(eq(usageRecords.id, r.id));

    console.log(
      `  ${member?.name}: $${(r.spendCents / 100).toFixed(2)} + $40 seat = $${(newSpend / 100).toFixed(2)} (~${(newTokens / 1000).toFixed(0)}K tokens)`
    );
    totalAdded += CURSOR_SEAT_CENTS;
  }

  console.log(`\nDone. Added $${(totalAdded / 100).toFixed(2)} in seat costs across ${cursorRecords.length} Cursor members.`);
}

main().catch(console.error);
