# CLAUDE.md

## Project Overview

Burnboard — an internal gamified web dashboard for AssetWorks (~29 engineers) that consolidates AI tool spending across 6 vendors (Cursor, Claude, Copilot, OpenAI, Replit, Kiro) into a single view with leaderboards, achievement badges, and an LLM-powered suggestion machine. MVP is feature-complete. Built with Next.js 16.1 (App Router, TypeScript strict, Turbopack), Better Auth, Neon PostgreSQL + Drizzle ORM, shadcn/ui + Recharts. Deployed on Vercel Hobby tier.

## BMAD Artifacts

Before making functional changes, read the relevant planning docs:
- `_bmad-output/planning-artifacts/prd.md` — product requirements (40 FRs, 15 NFRs)
- `_bmad-output/planning-artifacts/architecture.md` — all architectural decisions
- `_bmad-output/planning-artifacts/sprint-plan.md` — 4 sprints, 29 stories across 5 epics
- `_bmad-output/planning-artifacts/epics.md` — epic definitions
- `_bmad-output/planning-artifacts/ux-design-specification.md` — dual-tone design system, component specs

## BMAD Mode

When any task involves functional changes, new features, refactors, or behavioral changes — enter BMAD mode before writing code:

1. **Analyze** — Read the relevant BMAD artifacts. Identify constraints.
2. **Challenge** — Surface conflicts, ambiguities, or scope creep. Be skeptical.
3. **Propose** — Present your plan with callouts to BMAD decisions it honors or tensions.
4. **Wait** — Do NOT write code until I approve.

"BMAD check" = stop and run steps 1-3 against current work.

## Architecture

- `spend_cents` as integer (cents, not dollars) everywhere
- `user` table (login accounts) is separate from `members` table (tracked team members)
- All tables have `tenant_id` for multi-tenant isolation — enforce at query level
- Lazy DB connection via Proxy pattern (avoids build-time `neon()` failures)
- Stale-while-revalidate sync pattern (no cron on Vercel Hobby)
- Dual-tone design: warm mode (default, `#EDEAE4`) / cool mode (`.cool-mode` class, `#F5F5F5`)
- `VENDOR_COLORS` constant is the single source of truth for vendor colors
- Tailwind v4 canonical classes: `bg-(--card-bg)` not `bg-[var(--card-bg)]`

## Data Pipeline

### Daily-Diff Sync (Floor + Delta Model)
- **Seat costs** (floor): Written once per calendar month as `sourceType: "seat"` records. Per-member dedup — mid-month additions get their seat record on next sync.
- **Overage diffs** (delta): Written daily as `sourceType: "api"` or `"scraper"` records. Snapshots in `vendor_snapshots` table store current + previous-day state for computing deltas.
- **Billing resets**: When cumulative drops below previous, delta = current (new cycle).
- **Orchestrator**: `scripts/sync-all.ts` handles API vendors (Cursor, Copilot, OpenAI). Scraper vendors (Claude, Replit) run individually via `scripts/sync-claude-local.ts` and `scripts/sync-replit-local.ts`.

### Vendor Data Collection
- **Cursor**: API adapter. Returns per-user email + overage spend. $40/seat added separately.
- **Claude**: NO API for usage data. Scraped from claude.ai via Playwright + Edge cookie. Standard $25/seat, Premium $100/seat. Per-member `seatCostCents` overrides in snapshot.
- **Copilot**: API adapter (GitHub). Pure subscription — $39/seat Enterprise, no variable spend.
- **OpenAI**: Admin API. Token counts × model pricing → estimated spend. No seat cost.
- **Replit**: Scraped via Playwright + Edge cookie. $25/seat + unattributed pool usage (`memberId: null`).
- **Kiro**: No data yet.

### Period Dates
MUST use UTC: `new Date(Date.UTC(year, month-1, 1))`. The `periodBounds()` utility uses `Date.UTC()` for consistency between local dev and Vercel.

## Key Files

| Area | Path |
|------|------|
| DB Schema | `src/lib/db/schema.ts` |
| Types | `src/types/index.ts` |
| Auth | `src/lib/auth.ts`, `src/lib/auth-client.ts` |
| Queries | `src/lib/db/queries/usage.ts`, `src/lib/db/queries/badges.ts` |
| Adapters | `src/lib/adapters/{types,registry,cursor,claude,copilot,openai,replit,kiro}.ts` |
| Encryption | `src/lib/encryption.ts` |
| Date utils | `src/lib/utils/date-ranges.ts` |
| Format utils | `src/lib/utils/{format-currency,format-tokens,format-name}.ts` |
| Dashboard UI | `src/components/dashboard/` |
| Layout | `src/components/layout/{AppShell,NavBar}.tsx` |
| API routes | `src/app/api/{dashboard,leaderboard,badges,suggestions,members,manual-entry,sync,vendor-config,admin}/` |
| Sync pipeline | `scripts/lib/{snapshot-store,daily-sync-db,vendor-fetchers}.ts` |
| Sync scripts | `scripts/{sync-all,sync-claude-local,sync-replit-local}.ts` |

## Rules

- No new dependencies without approval
- No architectural deviations without discussion
- Bug fixes skip BMAD unless they touch architecture
- `requireAdminApi()` returns discriminated union `{ session } | { error: Response }` — always check
- Better Auth password hashing: scrypt via `@noble/hashes` (salt:hex format)
- `tsconfig.json` excludes `scripts/` to avoid build errors from Playwright/standalone script types
- Sync DELETE only deletes records matching the sourceType the adapter produces — NEVER delete "scraper" records when running an "api" adapter

## Deployment

- **GitHub**: `AssetWorks-R-D/ai-spend-dashboard`
- **Vercel**: https://burnboard.vercel.app (auto-deploys on push to main)
- **Env vars on Vercel**: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `CREDENTIAL_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`
- Vendor credentials stored encrypted in `vendor_configs` DB table (shared between local and Vercel via same Neon DB)
