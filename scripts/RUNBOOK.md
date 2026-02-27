# Data Refresh Runbook

On-demand usage data refresh for the AI Spend Dashboard. All scripts run from the project root with:
```
npx dotenv -e .env.local -- npx tsx scripts/<script>.ts
```

## Quick Refresh (every few days)

### 1. Copilot (automatic via API)
Copilot seats sync automatically via the adapter when you trigger a sync from the Admin > Vendor Config page. The adapter fetches seat assignments from `GET /orgs/{org}/copilot/billing/seats` and stores $39/seat (enterprise) or $19/seat (business).

For premium request/usage charges beyond the seat cost, check your GitHub billing page and update `COPILOT_USAGE_CENTS` in `scripts/add-copilot-usage.ts`, then run it.

### 2. Cursor (automatic via API)
Cursor syncs automatically via the adapter from `GET /api/v1/teams/{team}/usage`. **Important:** The API does NOT include the $40/seat/month subscription fee. After a fresh sync, run:
```
npx dotenv -e .env.local -- npx tsx scripts/fix-subscription-costs.ts
```

### 3. Claude Team (manual scrape)
Claude Team doesn't have a usage API. Data is scraped from claude.ai admin pages using Playwright + Edge cookies.

**Step 1: Scrape usage data**
```
npx dotenv -e .env.local -- npx tsx scripts/scrape-claude-usage.ts
```
This extracts Edge cookies (sessionKey, lastActiveOrg), navigates to claude.ai/admin-settings/usage, and captures all member spend data.

**Step 2: Scrape seat tiers** (only needed if membership changes)
```
npx dotenv -e .env.local -- npx tsx scripts/scrape-claude-seats.ts
```
This navigates to claude.ai/admin-settings/organization and captures which members are Standard ($25) vs Premium ($100).

**Step 3: Seed the data**
Update the member data in `scripts/seed-claude-data.ts` with the scraped values, then run:
```
npx dotenv -e .env.local -- npx tsx scripts/seed-claude-data.ts
```
This creates/updates member records with seat cost + overage = total spend, and estimates tokens at $6/1M blended rate.

### 4. Replit (manual scrape)
Replit data is scraped from the Replit team page using Playwright + Edge cookies.

**Step 1: Scrape team data**
```
npx dotenv -e .env.local -- npx tsx scripts/scrape-replit-team.ts
```

**Step 2: Seed member data** (update amounts in script first)
```
npx dotenv -e .env.local -- npx tsx scripts/seed-replit-data.ts
```

**Step 3: Add unattributed usage** (agent + infra charges, update amount in script)
```
npx dotenv -e .env.local -- npx tsx scripts/add-replit-usage.ts
```

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
| `fix-subscription-costs.ts` | Add Cursor $40 seat fee |

## Pricing Reference

| Vendor | Seat Cost | Notes |
|--------|-----------|-------|
| Cursor | $40/seat/mo | Not included in API response |
| Claude Standard | $25/seat/mo | |
| Claude Premium | $100/seat/mo | 6 premium members |
| Copilot Enterprise | $39/seat/mo | |
| Copilot Business | $19/seat/mo | |
| Replit | $25/seat/mo | Plus agent + infra usage |
