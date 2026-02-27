# Sprint Plan — AI Spend Dashboard

**Date:** 2026-02-26
**Scrum Master:** Bob (BMAD Scrum Master)
**Developer:** Benjamin Smith (solo, AI-assisted)
**Sprint Duration:** 2 weeks per sprint
**Total Sprints:** 4
**Total Stories:** 29 (across 5 epics)

---

## Sprint Overview

| Sprint | Name | Epics | Stories | Goal |
|--------|------|-------|---------|------|
| 1 | Foundation | Epic 1 | 1.1–1.5 (5) | Authenticated app shell with role-based access, design system, and database |
| 2 | Data Pipeline | Epic 2 | 2.1–2.8 (8) | All vendor adapters operational, sync engine running, manual entry available |
| 3 | Identity & Dashboard | Epic 3 + Epic 4 (partial) | 3.1–3.5, 4.1–4.3 (8) | Member identity management, data aggregation, and core dashboard visible |
| 4 | Dashboard Polish & Gamification | Epic 4 (remainder) + Epic 5 | 4.4–4.5, 5.1–5.6 (8) | Chart view, leaderboard, badges, suggestion machine, My Progress page |

---

## Sprint Prep: Readiness Report Items

Before implementation begins, address the 12 remaining medium/low issues from the readiness report as acceptance criteria refinements. No new stories required — these fold into existing stories:

| # | Issue | Resolution | Story |
|---|-------|------------|-------|
| M2 | FR38 deviation untracked in architecture | Add FR38 (compute on demand, no snapshots) to Architecture PRD Deviation Tracking section as Deviation #5 | Documentation — no story |
| M4 | Warm/cool toggle contradiction | Confirm context-automatic for MVP; annotate user toggle as Phase 2 in UX spec | Documentation — no story |
| G2 | Period selector has no interaction story | Add AC to Story 4.5: period selector triggers dashboard re-fetch, no URL change, skeleton transition during load | Story 4.5 |
| U1 | KPI bar sticky scroll | Add AC to Story 4.2: KPI bar uses `position: sticky; top: 0; z-index: 40` to remain visible on scroll | Story 4.2 |
| U2 | prefers-reduced-motion | Add AC to Story 1.4: CSS foundation includes `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }` | Story 1.4 |
| U3 | Skip-to-content link | Add AC to Story 1.4: AppShell includes a visually-hidden skip-to-content link as first focusable element | Story 1.4 |
| U4 | Suggestion machine thinking copy | Add AC to Story 5.4: thinking state cycles through copy sequence: "Consulting the oracle...", "Crunching vibes...", "Almost there..." at 2-second intervals before streaming begins | Story 5.4 |
| U6 | "Possible match" fuzzy logic undefined | Scope to exact email match only for MVP. Story 3.3 AC "partially match" becomes: flag accounts where `vendor_email` exactly matches an existing member's email. Fuzzy/Levenshtein matching deferred to Phase 2 | Story 3.3 |
| M1 | ToolQuadrant vs ToolPill naming | No action — "ToolPill" is the canonical name across UX, Architecture, and Epics | None |
| G3 | /dev/components reference page | No action — explicitly deferred | None |
| G4 | FR12 per-member vs own-card-only | No action — own-card-only is the correct implementation per privacy design | None |
| G5 | ?mode=display conference room feature | No action — not blocking, deferred | None |

---

## Sprint 1: Foundation

**Goal:** Authenticated application with role-based access, dual-tone design system, and database schema in place. An admin can log in, see role-aware navigation, and manage user accounts. Deploy to Vercel.

**Duration:** 2 weeks
**Stories:** 5

### Story Sequence

| Order | Story | Title | Depends On | Estimate |
|-------|-------|-------|------------|----------|
| 1 | 1.1 | Initialize Next.js Project with Core Dependencies | — | S |
| 2 | 1.2 | Database Connection and Core Schema | 1.1 | M |
| 3 | 1.3 | Authentication System and Login Page | 1.2 | L |
| 4 | 1.4 | App Shell, Navigation, and Design System Foundation | 1.3 | L |
| 5 | 1.5 | Admin User Management and Role Enforcement | 1.3, 1.4 | L |

**Estimates:** S = half day, M = 1 day, L = 1.5–2 days

### Sprint 1 Details

**Story 1.1 — Initialize Next.js Project with Core Dependencies**
- Run `npx create-next-app@latest ai-spend-dashboard --yes`
- Install dependencies: `drizzle-orm`, `@neondatabase/serverless`, `better-auth`, `zod`, `recharts`, `drizzle-kit`
- Init shadcn/ui: `npx shadcn@latest init`
- Create directory structure (feature-based components, lib/db, lib/adapters, lib/utils, types)
- Create `.env.example` with all required env var names
- Verify `npm run dev` runs cleanly

**Story 1.2 — Database Connection and Core Schema**
- Set up Neon PostgreSQL free tier instance
- Create `src/lib/db/index.ts` with Neon HTTP adapter connection
- Create `src/lib/db/schema.ts` with Drizzle schema: `tenants`, `user`, `session` tables
- All tables include `tenant_id` column (NFR4, NFR13)
- Create `drizzle.config.ts` pointing to schema
- Run `drizzle-kit push` to create tables
- Seed script: create AssetWorks tenant + default admin user

**Story 1.3 — Authentication System and Login Page**
- Configure Better Auth in `src/lib/auth.ts` with email/password + custom fields (role, tenant_id, member_id)
- Create `/api/auth/[...all]/route.ts` catch-all
- Build `/login/page.tsx` with email/password form
- JWT session with expiration in HTTP-only cookie
- Redirect unauthenticated users to `/login`
- Sign-out destroys session and redirects to `/login`
- Generic error message on invalid credentials

**Story 1.4 — App Shell, Navigation, and Design System Foundation**
- Create `src/app/globals.css` with CSS custom properties for dual-tone system
  - Warm mode (default): `--page-bg: #EDEAE4`, warm palette tokens
  - Cool mode (`.cool-mode`): `--page-bg: #F5F5F5`, `--kpi-bar-bg: #334155`, `--animation-duration: 0ms`
- `@media (prefers-reduced-motion: reduce)` foundation (**readiness fix U2**)
- Skip-to-content link in AppShell (**readiness fix U3**)
- `AppShell.tsx`: main layout, max-width 1440px centered content area
- `NavBar.tsx`: role-aware — viewers see Dashboard + My Progress; admins also see Admin section
- Root `/` redirects authenticated users to `/dashboard`

**Story 1.5 — Admin User Management and Role Enforcement**
- `/admin/users/page.tsx`: user table (email, name, role, created date) in cool mode
- Create user flow: email, name, password, role selection → `POST /api/admin/users`
- Edit user: change role → `PUT /api/admin/users/[id]`
- Reset password: admin enters new password → bcrypt hash update
- `requireAdmin()` utility: returns 403 for non-admin API requests (NFR3)
- Viewer redirect: `/admin/*` pages redirect viewers to `/dashboard`
- All queries scoped by `tenant_id` (NFR4)

### Sprint 1 Definition of Done
- [ ] App deploys to Vercel successfully
- [ ] Admin can log in with seeded credentials
- [ ] Viewer can log in, sees limited navigation
- [ ] Admin can create/edit users and reset passwords
- [ ] Viewers are blocked from admin routes (server-side)
- [ ] Dual-tone CSS custom properties are defined and `.cool-mode` works
- [ ] All pages render within max-width 1440px (desktop-only)

### Sprint 1 Technical Risks
- **Better Auth integration:** First time integrating with custom fields (role, tenant_id, member_id). Mitigated by Better Auth's comprehensive docs and admin plugin.
- **Neon cold start:** Free-tier Neon scales to zero; first query after idle period may be slow. Acceptable for MVP — production usage keeps the DB warm.

---

## Sprint 2: Data Pipeline

**Goal:** All four API vendor adapters fetch real data, sync engine runs stale-while-revalidate, admins can configure credentials and manually enter Replit data. Raw usage data flows into the database.

**Duration:** 2 weeks
**Stories:** 8

### Story Sequence

| Order | Story | Title | Depends On | Estimate |
|-------|-------|-------|------------|----------|
| 1 | 2.1 | Vendor Adapter Interface, Type System, and Data Tables | Epic 1 | M |
| 2 | 2.2 | Credential Encryption and Vendor Configuration Management | 2.1 | L |
| 3–6 | 2.3 | Cursor API Adapter | 2.1 | M |
| 3–6 | 2.4 | Claude API Adapter | 2.1 | M |
| 3–6 | 2.5 | GitHub Copilot API Adapter | 2.1 | M |
| 3–6 | 2.6 | Kiro API Adapter | 2.1 | M |
| 7 | 2.7 | Stale-While-Revalidate Sync Engine | 2.2, 2.3–2.6 | L |
| 8 | 2.8 | Manual Data Entry for Replit | 2.1 | L |

**Note:** Stories 2.3–2.6 (adapters) are parallelizable — they all implement the same `VendorAdapter` interface. As a solo dev, you'll build them sequentially, but the 2nd–4th adapters go much faster since the pattern is established by the first.

### Sprint 2 Details

**Story 2.1 — Vendor Adapter Interface, Type System, and Data Tables**
- `src/lib/adapters/types.ts`: export `ApiVendor`, `ScrapedVendor`, `VendorType`, `SourceType`, `Confidence`, `VendorAdapter` interface
- `src/types/index.ts`: export `ApiResponse<T>` and `ApiError` response wrappers
- Drizzle schema additions: `usage_records` table, `vendor_configs` table
- `src/lib/adapters/registry.ts`: adapter lookup by vendor name
- Run `drizzle-kit push` for new tables

**Story 2.2 — Credential Encryption and Vendor Configuration Management**
- `src/lib/encryption.ts`: AES-256 `encrypt()`/`decrypt()` using `CREDENTIAL_ENCRYPTION_KEY` env var
- `/admin/vendor-config/page.tsx`: card per API vendor (Cursor, Claude, Copilot, Kiro) — cool mode
- Replit not shown (no API credentials needed)
- Save credentials → encrypt → store in `vendor_configs`
- "Test Connection" button → `adapter.testConnection()`
- Saved credentials display masked (`••••••••last4`)
- Admin role + tenant_id enforcement on all routes

**Stories 2.3–2.6 — Vendor Adapters (Cursor, Claude, Copilot, Kiro)**
Each adapter:
- Implements `VendorAdapter` interface in `src/lib/adapters/{vendor}.ts`
- `fetchUsageData()`: calls vendor API, normalizes to `UsageRecord[]` with `spend_cents`, `tokens`, `vendor_username`/`vendor_email`
- `testConnection()`: validates credentials, returns boolean
- 30-second timeout (NFR9), descriptive errors on failure
- Vendor-specific details:
  - **Cursor:** REST API with Basic Auth, Enterprise plan requirement
  - **Claude:** Admin API with specific header requirements
  - **Copilot:** REST API with PAT, idle seat detection (spend > 0, tokens = 0)
  - **Kiro:** API vendor, registered in registry for extensibility (NFR14)

**Story 2.7 — Stale-While-Revalidate Sync Engine**
- Staleness check: compare `vendor_configs.last_sync_at` against `staleness_threshold_minutes`
- On dashboard load: detect stale vendors → fire non-blocking `fetch()` to `/api/sync/trigger`
- `POST /api/sync/trigger`: decrypt credentials → `adapter.fetchUsageData()` → upsert `usage_records` → update `vendor_configs.last_sync_at`/`last_sync_status`
- Failure handling: update `last_sync_status` with error, do NOT update `last_sync_at`, cached data remains (NFR7)
- `GET /api/sync/status`: per-vendor sync status for all 5 vendors (NFR8)
- Admin "Sync Now" button on vendor config page (FR23)
- 30-second timeout per adapter (NFR9)

**Story 2.8 — Manual Data Entry for Replit**
- `/admin/manual-entry/page.tsx`: form with member dropdown, vendor (default: Replit), spend (dollars → cents), tokens (optional), period — cool mode
- `POST /api/manual-entry`: creates `usage_records` with `source_type = 'manual'`, `confidence = 'medium'`, `created_by` = admin user ID (NFR11)
- Table of previous entries with edit and delete actions
- `PUT /api/manual-entry/[id]` and `DELETE /api/manual-entry/[id]` (FR18)
- Admin role + tenant_id enforcement

### Sprint 2 Definition of Done
- [ ] All 4 API vendor adapters pass `testConnection()` with real credentials
- [ ] At least one adapter successfully fetches and stores `usage_records`
- [ ] Sync engine triggers background refresh on stale vendors
- [ ] Admin can configure credentials for each API vendor
- [ ] Admin can manually enter Replit data
- [ ] Credentials are encrypted at rest in the database
- [ ] Sync status is visible per vendor on the config page

### Sprint 2 Technical Risks
- **Vendor API access:** Cursor requires Enterprise plan; Copilot PAT needs specific scopes. If API access isn't available for a vendor, implement the adapter with mock data and flag it. The adapter pattern ensures real integration can be swapped in later.
- **API documentation gaps:** Kiro's API may not be fully documented. Use mock adapter as fallback if blocked.
- **Sprint density:** 8 stories is the highest count across sprints. Mitigated by the adapter pattern — stories 2.3–2.6 reuse the same interface, so implementation velocity increases after the first adapter.

---

## Sprint 3: Identity & Dashboard

**Goal:** Admin can manage team member identities and link them across platforms. The core dashboard is visible — KPI bar with vendor summaries, cards view with tool pills, and the logged-in user's card highlighted. The system aggregates per-member and team-level metrics.

**Duration:** 2 weeks
**Stories:** 8

### Story Sequence

| Order | Story | Title | Depends On | Estimate |
|-------|-------|-------|------------|----------|
| 1 | 3.1 | Member Profiles and Admin Members Page | Epic 1 | M |
| 2 | 3.2 | Vendor Account Linking and Identity Management | 3.1 | L |
| 3 | 3.3 | Auto-Discovery of Member Accounts from Vendor Data | 3.1, Epic 2 | M |
| 4 | 3.4 | Per-Member Data Aggregation | 3.1, 3.2 | M |
| 5 | 3.5 | Team-Level Aggregation and Period Queries | 3.4 | M |
| 6 | 4.1 | Dashboard API Endpoint | 3.4, 3.5 | M |
| 7 | 4.2 | KPI Bar with Hero Metrics and Vendor Summary Cards | 4.1 | L |
| 8 | 4.3 | Cards View with Member Cards and Tool Pills | 4.1 | L |

### Sprint 3 Details

**Story 3.1 — Member Profiles and Admin Members Page**
- Drizzle schema additions: `members` table, `member_identities` table
- `/admin/members/page.tsx`: table of members (name, email, linked accounts count) — cool mode
- "Add Member" form: name + email → `POST /api/members` (FR25)
- "Edit" member: update name/email → `PUT /api/members/[id]` (FR29)
- Tenant-scoped queries (NFR4)

**Story 3.2 — Vendor Account Linking and Identity Management**
- Member detail view: list all linked vendor accounts
- "Link Account" flow: select vendor → enter username/email → create `member_identities` row (FR28)
- "Unlink" action: remove identity row, set `usage_records.member_id = null` on orphaned records (FR27, NFR12)
- "Merge" two members: move all identities and usage_records to primary, delete secondary (FR26, NFR12)
- Merge confirmation dialog (per UX admin flow)
- Zero data loss on merge — all historical records preserved

**Story 3.3 — Auto-Discovery of Member Accounts from Vendor Data**
- "Unlinked Accounts" section on members page: display unique `vendor_username`/`vendor_email` from `usage_records` where `member_id IS NULL` (FR24)
- "Link to Existing Member" dropdown → creates identity + updates matching usage_records
- "Create New Member" → pre-fills from vendor account data, auto-links
- **Readiness fix U6:** "Possible match" indicator shows when `vendor_email` exactly matches an existing member's email (exact match only for MVP)

**Story 3.4 — Per-Member Data Aggregation**
- `src/lib/db/queries/usage.ts`: `getMemberAggregates(tenantId, periodStart, periodEnd)`
- Returns: `memberId`, `memberName`, `totalSpendCents`, `totalTokens`, per-vendor breakdown with `{ vendor, spendCents, tokens, confidence, sourceType }`
- Handles `null` tokens correctly (Replit) — sum only non-null values
- Inactive vendors show `spendCents: 0, tokens: 0` (not missing)
- Tenant-scoped (NFR4)

**Story 3.5 — Team-Level Aggregation and Period Queries**
- `getTeamTotals(tenantId, periodStart, periodEnd)`: totalSpendCents, totalTokens, activeMemberCount (FR37)
- `getVendorSummaries(tenantId, periodStart, periodEnd)`: per-vendor totals + sync metadata for all 5 vendors
- Period-over-period computed on demand from raw `usage_records` — no snapshots (FR38)
- `src/lib/utils/date-ranges.ts`: period key generation, start/end dates, previous period boundaries, staleness checks
- `src/lib/utils/format-currency.ts`: `formatCurrency(1428000)` → `"$14,280"` (no decimals)
- `src/lib/utils/format-tokens.ts`: `formatTokens(39629164)` → `"39.6M tok"`, `formatTokens(null)` → `"~ tok"`

**Story 4.1 — Dashboard API Endpoint**
- `GET /api/dashboard?period=2026-02` returns `{ data: { teamTotals, memberCards, vendorSummaries }, meta: { vendors } }`
- `memberCards` sorted by `totalSpendCents` descending, includes `earnedBadges: []` and `suggestionSnippet: null` as forward-compatible defaults
- Dashboard page (`/dashboard`) as React Server Component — fetches via Drizzle queries server-side (NFR5)
- Triggers stale-while-revalidate background refresh for stale vendors on load

**Story 4.2 — KPI Bar with Hero Metrics and Vendor Summary Cards**
- `KpiBar.tsx`: full-width dark gradient (`#1a1a2e` → `#6C63FF`), spans viewport
- Left: hero metrics (Total Spend, Total Tokens, Active Members) in bold white
- Center: `VendorCard` per vendor (Cursor, Claude, Copilot, Replit, Kiro) — name, freshness dot, spend, tokens, seats
- Freshness thresholds: green (< 6h), amber (6–24h), red (> 24h), gray (manual)
- Right: period selector dropdown (Feb 2026, Jan 2026, etc.)
- **Readiness fix U1:** `position: sticky; top: 0; z-index: 40` — remains visible on scroll
- At < 1280px: vendor cards drop seat count; at < 1100px: tokens text hides

**Story 4.3 — Cards View with Member Cards and Tool Pills**
- `CardsView.tsx`: CSS Grid `auto-fill` with `minmax(240px, 1fr)` (FR1)
- `MemberCard.tsx`: member name, total spend, grid of `ToolPill` components (FR5, FR13)
- `ToolPill.tsx`: vendor name, spend, tokens, vendor-colored border from `VENDOR_COLORS` (FR5)
- `src/lib/vendor-colors.ts`: `VENDOR_COLORS` constant with all 5 vendor palettes
- Inactive vendor pills appear dimmed (not hidden)
- NO rank numbers or growth arrows on member cards
- Warm-mode design tokens active

### Sprint 3 Definition of Done
- [ ] Admin can create members, link vendor accounts, and merge duplicate identities
- [ ] Auto-discovered unlinked accounts appear on the members page
- [ ] Dashboard shows KPI bar with accurate team totals and vendor summaries
- [ ] Cards view renders member cards with tool pills for all 5 vendors
- [ ] Logged-in user's card is NOT yet highlighted (member_id linking prerequisite — functional but admin must manually link)
- [ ] Period selector changes the displayed data
- [ ] KPI bar sticks to top on scroll

### Sprint 3 Technical Risks
- **Member identity linking UX:** Merge operations are the highest-friction admin surface. Mitigated by confirmation dialog and zero-data-loss design.
- **Aggregation query performance:** Computing aggregates on demand from raw records for 29 members × 5 vendors. At this scale, raw SQL with proper indexes is fast. Add `idx_usage_records_tenant_id_member_id_period` index.

---

## Sprint 4: Dashboard Polish & Gamification

**Goal:** Complete dashboard experience with chart view, leaderboard podium, achievement badges, LLM suggestion machine with streaming, and My Progress page. Admin has a full operational leaderboard. Product is feature-complete for MVP.

**Duration:** 2 weeks
**Stories:** 8

### Story Sequence

| Order | Story | Title | Depends On | Estimate |
|-------|-------|-------|------------|----------|
| 1 | 4.4 | Chart View with Stacked Bar Comparison | 4.1 | L |
| 2 | 4.5 | View Toggle and Dashboard Page Assembly | 4.2, 4.3, 4.4 | M |
| 3 | 5.1 | Leaderboard Rankings and Admin Settings | Epic 3 | M |
| 4 | 5.2 | Leaderboard Podium Display in Chart View | 5.1 | L |
| 5 | 5.3 | Achievement Badge System | Epic 3 | L |
| 6 | 5.4 | Suggestion Machine with LLM Streaming | Epic 3 | XL |
| 7 | 5.5 | My Progress Page | 5.1, 5.3, 5.4 | L |
| 8 | 5.6 | Admin Full-View Leaderboard | 5.1 | M |

**Note:** Stories 5.3 (badges) and 5.4 (suggestion machine) depend on Epic 3 aggregation data but not on each other — they can be developed in either order. Story 5.5 (My Progress) depends on 5.1, 5.3, and 5.4 so it comes last.

### Sprint 4 Details

**Story 4.4 — Chart View with Stacked Bar Comparison**
- `SpendChart.tsx`: Recharts horizontal stacked bar, one bar per member, vendor-colored segments from `VENDOR_COLORS` (FR2)
- Bars sorted by total spend descending
- Tooltip on hover: vendor name, spend, tokens
- Legend mapping vendor colors to names
- `.cool-mode` applied: neutral gray background, flat slate KPI bar, animations disabled
- Readable at 1024px–2560px without horizontal scroll

**Story 4.5 — View Toggle and Dashboard Page Assembly**
- `ViewToggle.tsx`: shadcn/ui `Tabs` — "Cards" (default active) and "Chart" (FR3)
- Cards → Chart: apply `.cool-mode`, switch within 500ms, no API call (NFR6)
- Chart → Cards: remove `.cool-mode`, switch within 500ms (NFR6)
- **Readiness fix G2:** Period selector re-fetches dashboard data, no URL change, skeleton transition during load
- Logged-in user with `member_id`: highlighted card (warm tint background, amber border, outer glow)
- Suggestion snippet on user's card: truncated teaser if cached, or "Generate your [Month] insight" CTA → `/my-progress`
- Full page assembly: KPI bar (full-width) → ViewToggle → CardsView or SpendChart (1440px centered)

**Story 5.1 — Leaderboard Rankings and Admin Settings**
- `getLeaderboardRankings(tenantId, currentPeriod)`: ranked by `totalSpendCents` desc, includes `rank`, `previousRank`, `rankChange` (FR39)
- `rankChange`: positive = climbed, 0 = steady, null = new entrant
- `/admin/settings/page.tsx`: "Leaderboard Display Mode" — Named / Initialed / Anonymous — cool mode
- `PUT /api/admin/settings`: updates `tenants.leaderboard_display_mode`
- Tenant-scoped queries (NFR4)

**Story 5.2 — Leaderboard Podium Display in Chart View**
- `LeaderboardPodium.tsx`: top 5–8 members, gold/silver/bronze treatment (FR7)
- `GrowthArrow.tsx`: green ▲ (climbed), gray — (steady/new) — never red or down (FR8)
- Respects `leaderboard_display_mode`: named → full names, initialed → "D.M.", anonymous → rank + stats only
- Cool-mode design tokens active (consistent with chart view)

**Story 5.3 — Achievement Badge System**
- Drizzle schema: `badges` table (id, member_id, tenant_id, badge_type, earned_at)
- 5 badge types defined: AI Pioneer, Token Titan, Big Spender, Multi-Tool Master, Early Adopter (FR9)
- `computeBadgeEligibility(tenantId, memberId)`: evaluates criteria, returns newly eligible badges (FR40)
- Badge computation on dashboard load or member data change — no duplicates
- `BadgeCard.tsx`: per-badge visual display
- Badge indicators visible on member cards in cards view (FR10)

**Story 5.4 — Suggestion Machine with LLM Streaming**
- Drizzle schema: `suggestions` table (id, member_id, tenant_id, period_key, content, generated_at)
- `GET /api/suggestions?memberId=X&period=2026-02`: return cached suggestion or 404
- `POST /api/suggestions`: fetch member metrics → construct prompt → Anthropic API streaming → `ReadableStream` response (FR11)
- `SuggestionMachine.tsx`: animated thinking state → token-by-token text reveal (FR12)
- **Readiness fix U4:** Thinking copy cycles: "Consulting the oracle..." → "Crunching vibes..." → "Almost there..." at 2-second intervals
- On stream completion: store in `suggestions` table (cached for period)
- `SuggestionSnippet.tsx`: truncated teaser on member card, CTA to `/my-progress`
- "Regenerate" action: DELETE cached → POST new streaming generation
- Branded output card: screenshottable, warm gradient, watermark "AI Spend Dashboard · [Month Year]", 480px max-width
- Scoped by `tenant_id`, users can only generate for their own `member_id` (NFR4)

**Story 5.5 — My Progress Page**
- `/my-progress/page.tsx`: personal dashboard with rank, trajectory, badges, suggestion, podium proximity
- Rank section: "#4 of 29", previous rank, rank change with growth arrow
- `PodiumProximityBar.tsx`: "3 spots from the top 8" with visual bar; celebratory state if already on podium
- Badges section: earned badges with `BadgeCard`, unearned badges grayed out with criteria
- Suggestion machine: cached → display branded card; uncached → "Generate your [Month] insight" CTA
- Empty state for users without linked `member_id`: invitation-framed with admin contact prompt
- Warm-mode design tokens active

**Story 5.6 — Admin Full-View Leaderboard**
- `/admin/leaderboard/page.tsx`: full ranked table of all members (FR7)
- Columns: rank, full name, total spend, total tokens, per-vendor spend breakdown, badge count, rank change
- Full names always shown (no anonymity filtering — operational view)
- Inactive members (zero usage) at bottom with visual indicator
- Responsive: per-vendor columns collapse to summary at narrow widths
- Admin-only (viewers redirected to `/dashboard`, NFR3)
- Cool-mode design tokens, reuses `getLeaderboardRankings()` from 5.1

### Sprint 4 Definition of Done
- [ ] Chart view renders stacked bars with vendor colors and tooltip
- [ ] View toggle switches between cards and chart within 500ms
- [ ] Leaderboard podium shows top 5–8 with gold/silver/bronze and growth arrows
- [ ] Leaderboard respects admin anonymity setting
- [ ] At least one badge is awarded based on real data
- [ ] Suggestion machine streams a real LLM-generated suggestion
- [ ] Suggestion is cached and displayed on subsequent visits
- [ ] My Progress page shows rank, badges, suggestion, and podium proximity
- [ ] Admin full-view leaderboard shows all members with complete data
- [ ] All pages function correctly with warm/cool mode

### Sprint 4 Technical Risks
- **Suggestion machine streaming:** Server-Sent Events / ReadableStream on Vercel serverless. Vercel supports streaming responses — verify with a simple POC early in the sprint.
- **Anthropic API key:** Requires `ANTHROPIC_API_KEY` env var. Ensure it's configured in Vercel before Story 5.4.
- **Sprint density (8 stories):** Similar to Sprint 2 in count, but Story 5.4 (suggestion machine) is the largest single story in the project. Mitigate by starting 5.4 mid-sprint after simpler stories are done, allowing full focus.

---

## Post-Sprint: MVP Launch Checklist

After Sprint 4, before announcing to the AssetWorks team:

- [ ] Seed all ~29 AssetWorks team members as member profiles
- [ ] Admin links vendor identities for each member (target: 80% linked across 2+ platforms)
- [ ] Configure all available API vendor credentials
- [ ] Run initial sync for all API vendors — verify data appears on dashboard
- [ ] Enter initial Replit manual data for current period
- [ ] Verify leaderboard rankings look reasonable
- [ ] Test suggestion machine generates fun, appropriate content
- [ ] Set leaderboard display mode (default: named)
- [ ] Create viewer accounts for team members who want login access
- [ ] Smoke test on production (Vercel): login, dashboard, cards, chart, My Progress
- [ ] Take a screenshot of the dashboard — post to Slack

---

## Velocity Assumptions

| Factor | Assumption |
|--------|------------|
| Dev capacity | Solo developer, ~6–8 productive hours/day |
| AI assistance | AI pair programming accelerates boilerplate, adapters, and component creation by ~2–3x |
| Sprint buffer | ~20% buffer built into each sprint for unexpected issues, learning curves, and code review |
| Story sizing | S = half day, M = 1 day, L = 1.5–2 days, XL = 2–3 days |
| Total effort | ~36–40 dev-days across 4 sprints (8 weeks) |

---

## FR Traceability

Every functional requirement is implemented in a specific sprint:

| FR Range | Category | Sprint |
|----------|----------|--------|
| FR30–FR34 | Authentication & Access Control | Sprint 1 |
| FR14–FR23 | Vendor Data Integration | Sprint 2 |
| FR24–FR29 | Member Identity Management | Sprint 3 |
| FR35–FR38 | Data Aggregation & Computation | Sprint 3 |
| FR1, FR4–FR6, FR13 | Dashboard & Visualization (partial) | Sprint 3 |
| FR2–FR3 | Dashboard & Visualization (chart, toggle) | Sprint 4 |
| FR7–FR12, FR39–FR40 | Gamification & Engagement | Sprint 4 |

All 40 FRs covered. All 15 NFRs addressed in the story where first relevant.
