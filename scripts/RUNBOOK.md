# Data Refresh Runbook

On-demand usage data refresh for the AI Spend Dashboard. All scripts run from the project root with:
```
npx dotenv -e .env.local -- npx tsx scripts/<script>.ts
```

## Daily Diff Sync (recommended)

The unified sync command fetches all API vendors, computes deltas from the last snapshot, and writes daily records:
```
npx dotenv-cli -e .env.local -- npx tsx scripts/sync-all.ts
npx dotenv-cli -e .env.local -- npx tsx scripts/sync-all.ts --dry-run       # preview
npx dotenv-cli -e .env.local -- npx tsx scripts/sync-all.ts --api-only      # skip scrapers
npx dotenv-cli -e .env.local -- npx tsx scripts/sync-all.ts --vendor cursor # single vendor
```

**First run** saves a baseline snapshot (no records written). Subsequent runs compute deltas and write daily records. Scraper vendors (Claude, Replit) still need to be run individually — see below.

## Individual Vendor Refresh

### 1. Copilot (automatic via API)
Copilot seats sync automatically via the adapter when you trigger a sync from the Admin > Vendor Config page. The adapter fetches seat assignments from `GET /orgs/{org}/copilot/billing/seats` and stores $39/seat (enterprise) or $19/seat (business).

For premium request/usage charges beyond the seat cost, check your GitHub billing page and update `COPILOT_USAGE_CENTS` in `scripts/add-copilot-usage.ts`, then run it.

### 2. Cursor (automatic via API)
Cursor syncs automatically via the adapter. The $40/seat/month fee is baked directly into the adapter — no post-processing needed. Just trigger a sync from Admin > Vendor Config.

### 3. Claude Team (automated local scrape)
Claude Team doesn't have a usage API. Data is scraped from claude.ai admin pages using Playwright + Edge cookies.

**One command:**
```
npx dotenv-cli -e .env.local -- npx tsx scripts/sync-claude-local.ts
```

This script automatically:
1. Extracts Edge cookies (sessionKey, lastActiveOrg)
2. Scrapes `/admin-settings/identity-and-access` → member list with seat types (Standard/Premium)
3. Scrapes `/admin-settings/usage` → per-member overage spend
4. Writes members, identities, and usage records to DB (seat + overage = total)

**Preview first:** Add `--dry-run` to see parsed data without writing to DB.

**Debug:** Raw page text is saved to `/tmp/claude-identity-text.txt` and `/tmp/claude-usage-text.txt`. Screenshots at `/tmp/claude-identity.png` and `/tmp/claude-usage.png`.

**Prerequisite:** Be logged into claude.ai in Microsoft Edge.

> **Legacy scripts** (still available but superseded): `scrape-claude-usage.ts`, `scrape-claude-members.ts`, `seed-claude-data.ts`

### 4. Replit (automated local scrape)
Replit uses a pool model — the total usage on the page IS the vendor total (don't add seats on top).

**One command:**
```
npx dotenv-cli -e .env.local -- npx tsx scripts/sync-replit-local.ts
```

This script automatically:
1. Extracts `connect.sid` cookie from Edge (or use `--cookie=eyJ...` or `REPLIT_COOKIE` env var)
2. Scrapes `/t/assetworks-randd/members` → member list
3. Scrapes `/t/assetworks-randd/usage` → total pool usage
4. Writes $25/seat per member (shown on individual cards) + pool remainder as unattributed
5. Vendor total card = pool total (seats + remainder)

**Preview first:** Add `--dry-run` to see parsed data without writing to DB.

**Debug:** Raw text saved to `/tmp/replit-members-text.txt` and `/tmp/replit-usage-text.txt`.

**Prerequisite:** Be logged into replit.com in Microsoft Edge.

> **Legacy scripts** (still available but superseded): `scrape-replit-team.ts`, `seed-replit-data.ts`

### 5. Kiro
No data collection yet. Kiro is included in the vendor list for future use.

## Important Notes

### Period Dates (Critical!)
All seeded data MUST use UTC dates via `Date.UTC()`:
```ts
// CORRECT — explicit UTC
const periodStart = new Date(Date.UTC(2026, 1, 1));                   // 2026-02-01T00:00:00Z
const periodEnd = new Date(Date.UTC(2026, 2, 0, 23, 59, 59, 999));   // 2026-02-28T23:59:59.999Z

// WRONG — local time (breaks on Vercel which runs in UTC)
const periodStart = new Date(2026, 1, 1);        // Creates CST/local date
```
The `periodBounds()` function in the app uses `Date.UTC()` for consistency across local dev and Vercel (UTC). If you seed with local-time dates, the records may not appear in the dashboard depending on the server's timezone.

### Edge Cookie Extraction
The scraper scripts use `scripts/extract-edge-cookie.ts` to decrypt cookies from Microsoft Edge's SQLite database using the macOS Keychain. The extracted cookies have garbage prefix bytes that need regex cleanup:
- sessionKey: `/^[^s]*?(sk-ant-sid01-)/` → `$1`
- lastActiveOrg: UUID regex match

### Unattributed Records Pattern
Vendor-level charges that can't be attributed to individual members use `memberId: null`:
- Shows in `getVendorSummaries()` (no memberId filter)
- Does NOT show in `getMemberAggregates()` or `getTeamTotals()` (both filter `isNotNull(memberId)`)

### Token Estimation
All vendors use $6/1M tokens blended rate:
```ts
tokens = Math.round((spendCents / 100 / 6) * 1_000_000)
```

## Utility Scripts

| Script | Purpose |
|--------|---------|
| `inspect-members.ts` | List all members in DB |
| `inspect-db.ts` | General DB inspection |
| `check-cursor-data.ts` | Show Cursor + Copilot records |
| `check-copilot-billing.ts` | Check GitHub Copilot billing APIs |
| `merge-duplicates.ts` | Merge duplicate member records |
| `fix-period-dates.ts` | Fix UTC→local period dates |
| `fix-dates-to-utc.ts` | Migrate all dates to UTC midnight |


## Pricing Reference

| Vendor | Seat Cost | Notes |
|--------|-----------|-------|
| Cursor | $40/seat/mo | Baked into adapter (includes $20 Included + $20 Free credits) |
| Claude Standard | $25/seat/mo | |
| Claude Premium | $100/seat/mo | 6 premium members |
| Copilot Enterprise | $39/seat/mo | |
| Copilot Business | $19/seat/mo | |
| Replit | $25/seat/mo | Pool model: total on usage page includes everything |
| OpenAI | N/A | API-based, per-user token usage × model pricing |
