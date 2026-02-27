---
stepsCompleted: ["step-01-init", "step-02-context", "step-03-starter", "step-04-decisions", "step-05-patterns", "step-06-structure", "step-07-validation", "step-08-complete"]
inputDocuments: ["_bmad-output/planning-artifacts/prd.md", "HANDOFF.md", "_bmad-output/planning-artifacts/ux-design-specification.md", "_bmad-output/planning-artifacts/ux-design-directions.html"]
workflowType: 'architecture'
lastStep: 8
status: 'complete'
project_name: 'ai-spend-dashboard'
user_name: 'Benjaminsmith'
date: '2026-02-25'
completedAt: '2026-02-25'
uxRefinedAt: '2026-02-26'
uxDeviations: ['kiro-5th-vendor', 'suggestion-caching', 'my-progress-page', 'desktop-only', 'dual-tone-system', 'kpi-bar-vendor-cards', 'tool-pills', 'no-decimals-currency', 'leaderboard-anonymity-toggle']
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
6 categories, 40 requirements total. The heaviest architectural weight falls on Vendor Data Integration (FR14-23, 10 requirements) — this is where the heterogeneous auth models, data normalization, scheduled sync, manual entry fallback, and confidence tracking all live. Member Identity Management (FR24-29) is the second complexity center: cross-platform identity linking with CRUD operations. Dashboard & Visualization (FR1-6) and Gamification (FR7-13) are read-heavy display layers computed from aggregated data. Auth (FR30-34) and Data Aggregation (FR35-40) are supporting infrastructure.

**Non-Functional Requirements:**
15 requirements across security, performance, integration reliability, data integrity, and scalability. Architecture-shaping NFRs: encrypted credentials at rest (NFR1), tenant_id scoping on all queries (NFR4), graceful degradation on adapter failure (NFR7), sub-3s initial page load (NFR5), and adapter pattern extensibility without core changes (NFR14).

**Scale & Complexity:**

- Primary domain: Full-stack web (Next.js + Vercel serverless)
- Complexity level: Medium
- Estimated architectural components: ~10 (auth, KPI bar + vendor summary, dashboard views with dual-tone, gamification engine, vendor adapter layer (5 vendors), member identity management, data aggregation service, admin config + tenant settings, LLM suggestion service with caching, personal progress page)

### Implementation Dependency Chain

Requirements have a strict dependency ordering that will drive implementation sequencing:

1. **Vendor Adapters** — nothing works without data flowing in from Cursor, Claude, Copilot, and manual entry
2. **Member Identity Resolution** — aggregation requires linked identities across platforms
3. **Data Aggregation** — KPIs, leaderboard rankings, badge eligibility all depend on aggregated per-member data
4. **Display & Gamification** — dashboard views, charts, leaderboard, badges, and suggestion machine consume aggregated data

### Technical Constraints & Dependencies

- **Vercel Hobby tier**: serverless functions only, no persistent background processes, no built-in cron. Scheduled sync (FR22) implemented via **stale-while-revalidate pattern** — serve cached data immediately, trigger background refresh on first request after staleness threshold. External cron (e.g., cron-job.org) is an optional future enhancement, not a dependency.
- **Free-tier database**: storage limits constrain historical data retention; must plan retention policy
- **No email service for MVP**: password resets are admin-manual
- **Vendor API limitations**: Cursor requires Enterprise plan; Replit has no API at all; Claude Admin API has specific header requirements; Copilot PAT needs specific scopes
- **Single developer, AI-assisted**: architecture must be simple enough for one person to maintain while leveraging AI coding tools effectively

### Data Sync Architecture

**Pattern: Stale-While-Revalidate**

- Dashboard always serves cached/stored data on load (fast, sub-3s per NFR5)
- On page load, server checks per-adapter staleness against configured thresholds
- If stale: triggers background refresh via async serverless function, serves cached data to current user
- Fresh data available on next page load (or same session if user stays on page)
- 1-in-29 chance of being the user who triggers a background refresh — acceptable for v1
- Graceful degradation: if adapter refresh fails, cached data remains with updated staleness indicator (NFR7)
- Admins can also trigger manual sync on demand (FR23)

### LLM Suggestion Machine Architecture

**Pattern: Cached-Per-Period with On-Demand Streaming Generation**

- Suggestions are cached per member per sync period (e.g., "Your February insight is ready")
- First generation: user clicks CTA on their card → streams from LLM → stores in `suggestions` table
- Subsequent visits in the same period: display cached suggestion instantly (no LLM call)
- "Regenerate" option available — overwrites the cached row and streams fresh output
- Animated "thinking" state is part of the first-generation experience (e.g., "Consulting the oracle... Crunching vibes...")
- Token-by-token streaming reveal for dramatic effect on first generation
- Only 1 LLM call per member per period (unless regenerated), not 29 per page load
- Cost and latency contained: server-side Anthropic API call, streamed to client
- The CTA on the member card shows "Your [Month] insight is ready" when a cached suggestion exists, or "Generate your [Month] insight" when none exists
- Suggestion snippet (first line, truncated) shown on the member card as a teaser; full text on `/my-progress`

### Cross-Cutting Concerns Identified

- **Tenant isolation** (`tenant_id` on all tables, enforced at query level)
- **Data confidence tracking** (per-source sync status, staleness indicators, API vs manual labeling — displayed exclusively on KPI bar vendor cards)
- **Vendor credential security** (encryption at rest, server-side only access)
- **Role-based access control** (admin vs viewer, enforced server-side)
- **Error resilience** (adapter failures degrade gracefully, never block dashboard rendering)
- **Consistent vendor data normalization** (all 5 adapters output same shape: member identity, spend, tokens, period, confidence)
- **Vendor color system** (`VENDOR_COLORS` constant as single source of truth for all vendor-colored surfaces — tool pills, chart segments, KPI bar vendor cards, legends)
- **Dual-tone design system** (warm/cool mode via CSS custom properties, toggled by `.cool-mode` class — components are mode-agnostic)

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web application (Next.js on Vercel serverless) based on PRD requirements.

### Starter Options Considered

Only `create-next-app` was seriously evaluated. The PRD explicitly specifies Next.js + Vercel, and the project is a single-tenant dashboard — not a candidate for heavier full-stack frameworks (T3, RedwoodJS) that add abstraction layers a solo developer doesn't need.

### Selected Starter: create-next-app (Next.js 16.1)

**Rationale:** Official Next.js scaffolding. Recommended defaults align with project needs. Zero configuration overhead.

**Initialization Command:**

```bash
npx create-next-app@latest ai-spend-dashboard --yes
```

**Architectural Decisions Provided by Starter:**

| Decision | Value | Notes |
|---|---|---|
| Language | TypeScript (strict) | Recommended default |
| Styling | Tailwind CSS | Recommended default |
| Routing | App Router | Server components by default |
| Build tool | Turbopack | Recommended default |
| Linting | ESLint | Recommended default |
| Import alias | `@/*` | Recommended default |

**Note:** Project initialization using this command should be the first implementation story.

### Additional Technology Selections

#### Auth: Better Auth (PRD deviation — documented)

The PRD specifies NextAuth.js with Credentials provider. However, **Auth.js (formerly NextAuth) is now in maintenance-only mode** — no new features, security patches only. The Auth.js project has been absorbed by Better Auth, which is the recommended authentication library for new Next.js projects in 2026.

**Why Better Auth over NextAuth.js v5:**
- Active development vs maintenance-only
- Built-in admin plugin: user management APIs out of the box (directly supports FR31-32: admin creates accounts, manages roles)
- Native email/password support with bcrypt hashing
- JWT sessions, middleware integration, role-based access
- Built-in email verification (useful for Phase 2 password reset flow)
- Clean migration path if Auth.js patterns are already familiar

**What stays the same vs PRD:** Email/password auth, JWT sessions, admin/viewer roles, admin-provisioned accounts. All PRD requirements (FR30-34) are fully supported.

**What changes:** API surface, middleware patterns, and session handling use Better Auth conventions instead of NextAuth. Community content is smaller but growing rapidly; official docs are comprehensive.

#### Database: Neon PostgreSQL (Free Tier)

| Provider | Free Storage | Type | Serverless | Chosen |
|---|---|---|---|---|
| Neon | 0.5 GB | PostgreSQL | Scales to zero | Yes |
| Supabase | 500 MB | PostgreSQL (BaaS) | No scale-to-zero | No — bundled services we don't need |
| Turso | 5 GB | libSQL (SQLite) | Edge-optimized | No — SQLite limitations for relational model |

**Rationale:** Native PostgreSQL with full relational capabilities (foreign keys, joins, tenant_id scoping). Best Vercel integration. Scales to zero on free tier. If storage becomes an issue, seamless upgrade to Neon paid ($19/mo) — no schema or ORM changes. Migrating away from SQLite/Turso later would be a much larger effort.

**Storage Strategy:** Store raw sync records indefinitely (they're small: ~116 rows/month for 29 members × 4 vendors). No materialized snapshots — compute period-over-period comparisons, leaderboard rankings, and trend data on demand from timestamped raw records. This eliminates snapshot storage overhead entirely and keeps the 0.5 GB constraint a non-issue for years.

#### ORM: Drizzle

**Rationale:** Lighter bundle (~7.4 KB), faster serverless cold starts, TypeScript-native schema with no code generation step, strong Neon adapter (`drizzle-orm/neon-http`), and SQL-level control. Better fit than Prisma for a solo developer on serverless who wants to stay close to the queries.

#### UI Components: shadcn/ui

**Rationale:** Copy-paste component model built on Radix UI + Tailwind CSS. Components live in the project codebase, not as an npm dependency. Cards, tables, buttons, dialogs, tabs, and data display components available out of the box. Ideal for dashboard interfaces. Consistent with Tailwind styling decision from starter.

#### Charting: Recharts

**Rationale:** Declarative, React-native SVG charting. Lightweight. Native support for stacked bar charts (spend comparison view) and line charts (usage trends). Most widely-used React charting library for dashboard use cases. Swappable later if more advanced visualization needs emerge.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Database schema and table structure
- Vendor adapter interface and type system
- Auth integration pattern (Better Auth)
- API route organization
- Credential encryption approach

**Important Decisions (Shape Architecture):**
- API response format and per-vendor sync meta
- User-to-member linking for personalization
- Frontend state management approach
- Replit data ingestion strategy

**Deferred Decisions (Post-MVP):**
- Multi-tenant onboarding UI
- Email service for password resets
- External cron for data pre-warming
- Replit scraper implementation (GitHub Action — breadcrumbs below)

### Data Architecture

#### Database Schema

**Core Tables:**

| Table | Purpose | Key Fields |
|---|---|---|
| `user` | Better Auth-managed login accounts | `id`, `email`, `name`, `role`, `tenant_id`, `member_id` (optional FK) |
| `session` | Better Auth-managed sessions | Better Auth default fields |
| `tenants` | Multi-tenant isolation + settings | `id`, `name`, `slug`, `leaderboard_display_mode` |
| `members` | Team members tracked in dashboard | `id`, `tenant_id`, `name`, `email` |
| `member_identities` | Per-vendor username links | `id`, `member_id`, `vendor`, `vendor_username`, `vendor_email` |
| `usage_records` | Raw sync data (the core table) | `id`, `tenant_id`, `member_id`, `vendor`, `spend_cents`, `tokens`, `period_start`, `period_end`, `confidence`, `source_type`, `synced_at`, `created_by` |
| `vendor_configs` | API credentials for API vendors only | `id`, `tenant_id`, `vendor`, `encrypted_credentials`, `last_sync_at`, `last_sync_status`, `staleness_threshold_minutes` |
| `badges` | Earned achievement records | `id`, `member_id`, `badge_type`, `earned_at` |
| `suggestions` | Cached LLM suggestions per member per period | `id`, `member_id`, `tenant_id`, `period_key`, `content`, `generated_at` |

**Key Design Decisions:**

- **`user` vs `members` separation:** Login accounts (user) are separate from tracked team members (members). Not every tracked member needs a login. ~5 admins/viewers log in; ~29 team members are tracked. Optional `member_id` FK on `user` links a logged-in user to their member record for personalization (highlighted card, suggestion machine access).
- **`spend_cents` as integer:** Store money as cents to avoid floating-point issues. $800.38 = 80038. Display layer converts.
- **`source_type` enum:** `'api' | 'scraping' | 'manual'` on every usage record. Powers data confidence display (FR6, FR20).
- **`confidence` field:** Per-record: `'high' | 'medium' | 'low'`. API-sourced defaults to `'high'`, scraping to `'medium'`, manual to `'medium'`.
- **`created_by` on `usage_records`:** Tracks which admin entered manual data (NFR11).
- **No snapshots table:** Period-over-period comparisons computed on demand from timestamped `usage_records`.
- **No `vendor_configs` row for Replit:** Replit has no API credentials. Its data arrives via external scraper or manual entry. Presence is implicit in `usage_records` where `vendor = 'replit'`.
- **`suggestions` table (UX-driven):** The UX spec requires caching the first LLM suggestion per member per sync period (Wrapped-inspired "unwrapping" moment). `period_key` is a string like `"2026-02"`. On first generation, the suggestion is stored; subsequent visits show the cached version. A "Regenerate" action overwrites the cached row. This replaces the original stateless design to support the UX's "Your February insight is ready" experience.
- **Tenant `leaderboard_display_mode` setting:** Stored in `tenants` table as `leaderboard_display_mode: 'named' | 'initialed' | 'anonymous'`. Admin-configurable via admin settings. Controls how member identities appear on the public podium (top 5-8 in chart view). Default: `'named'`.

#### Vendor Type System

```typescript
type ApiVendor = 'cursor' | 'claude' | 'copilot' | 'kiro';  // Adapter pattern, credentials in vendor_configs
type ScrapedVendor = 'replit';                                 // External scraper pushes data via ingest endpoint
type VendorType = ApiVendor | ScrapedVendor;

type SourceType = 'api' | 'scraping' | 'manual';
type Confidence = 'high' | 'medium' | 'low';
```

Adapters only exist for `ApiVendor`. `ScrapedVendor` data arrives through a dedicated ingest endpoint or manual entry CRUD.

**Note on Kiro (UX-driven addition):** The UX spec and design mockups include Kiro as a 5th tracked vendor. Kiro is an API vendor — it receives a full adapter implementation following the `VendorAdapter` interface. Its brand color is purple (#7C3AED). The tool pill grid on member cards accommodates 5 vendors via CSS Grid.

### Authentication & Security

#### Better Auth Configuration

- Email/password provider with bcrypt hashing
- JWT sessions stored in cookies (serverless-compatible)
- Admin plugin for user management APIs (FR31-32)
- Custom `role` field on user table: `'admin' | 'viewer'`
- Custom `tenant_id` field on user table for data isolation
- Custom `member_id` optional FK for dashboard personalization

#### Role Enforcement

- Better Auth middleware checks auth on every request
- Admin-only routes use shared `requireAdmin()` utility that checks `role` field server-side (NFR3)
- UI hides admin nav for viewers, but server rejects unauthorized requests regardless

#### Credential Encryption (NFR1)

- **Application-layer AES-256 encryption** for vendor API keys stored in `vendor_configs`
- Encryption key stored in Vercel env var (`CREDENTIAL_ENCRYPTION_KEY`), never in DB
- Encrypt on write, decrypt on read — only in server-side adapter code
- Defense in depth: even if DB connection string leaks, API keys remain encrypted

#### Credential Storage Split

| Credential | Storage | Managed By |
|---|---|---|
| `DATABASE_URL` | Vercel env var | Infrastructure |
| `BETTER_AUTH_SECRET` | Vercel env var | Infrastructure |
| `CREDENTIAL_ENCRYPTION_KEY` | Vercel env var | Infrastructure |
| `ANTHROPIC_API_KEY` | Vercel env var | Infrastructure |
| Cursor API key | DB (encrypted) | Admin UI (FR21) |
| Claude Admin API key | DB (encrypted) | Admin UI (FR21) |
| Copilot PAT | DB (encrypted) | Admin UI (FR21) |
| Kiro API key | DB (encrypted) | Admin UI (FR21) |
| Replit scraper secret | GitHub Secrets | GitHub Action config |

### API & Communication Patterns

#### API Route Organization

```
src/app/api/
├── auth/[...all]/          # Better Auth catch-all handler
├── dashboard/              # Aggregated dashboard data (KPIs, cards, chart, vendor summaries)
├── members/                # CRUD for member identities (admin)
├── sync/
│   ├── trigger/            # Admin: trigger manual sync for a vendor
│   ├── status/             # Sync status per vendor
│   └── replit/             # Ingest endpoint for Replit scraper (API key auth)
├── vendor-config/          # Admin: manage API credentials
├── manual-entry/           # Admin: manual usage data entry
├── suggestions/
│   ├── route.ts            # POST: generate (streaming) + GET: cached suggestion for member/period
│   └── [id]/
│       └── route.ts        # DELETE: clear cached suggestion (triggers regeneration on next visit)
└── admin/
    ├── users/              # Admin: user account management
    └── settings/           # Admin: tenant settings (leaderboard display mode, etc.)
```

#### Vendor Adapter Interface

```typescript
interface VendorAdapter {
  vendor: ApiVendor;
  fetchUsageData(config: VendorConfig, dateRange: DateRange): Promise<UsageRecord[]>;
  testConnection(config: VendorConfig): Promise<boolean>;
}
```

Only API vendors implement this interface. Replit data enters through `/api/sync/replit` ingest endpoint or manual entry.

#### API Response Format

```typescript
// Success
{
  data: T,
  meta?: {
    vendors: {
      cursor:  { syncedAt: string, confidence: Confidence, status: string, spendCents: number, tokens: number | null, seats: number },
      claude:  { syncedAt: string, confidence: Confidence, status: string, spendCents: number, tokens: number | null, seats: number },
      copilot: { syncedAt: string, confidence: Confidence, status: string, spendCents: number, tokens: number | null, seats: number },
      replit:  { syncedAt: string, confidence: Confidence, status: string, spendCents: number, tokens: number | null, seats: number },
      kiro:    { syncedAt: string, confidence: Confidence, status: string, spendCents: number, tokens: number | null, seats: number }
    }
  }
}

// Error
{ error: { code: string, message: string } }
```

Per-vendor sync meta on dashboard responses powers the KPI bar vendor summary cards (spend, tokens, seat count, freshness indicators) and data confidence indicators (FR6, FR20).

#### Error Handling

- Server-side errors logged to Vercel function logs
- Adapter failures: return cached data + updated staleness indicator, never 500 to dashboard (NFR7)
- User-facing errors use consistent `{ error: { code, message } }` wrapper
- Adapter timeout: 30 seconds max per vendor (NFR9)

### Frontend Architecture

#### State Management

No global state library. React Server Components for data fetching. Local `useState`/`useReducer` for UI state (view toggle, form inputs, modal state). This is a read-heavy dashboard — global state management is unnecessary complexity.

#### View Toggle Pattern

Client-side `useState` toggles between Cards and Chart views. Both views receive the same server-fetched data prop. No separate API calls per view. The toggle uses shadcn/ui `Tabs` component for built-in keyboard navigation and ARIA roles.

#### Dashboard Personalization

When a logged-in user has a linked `member_id`, the dashboard highlights their card (warm tint background + amber border + outer glow), and shows the suggestion machine CTA on their card only. Cards view does **not** display rank numbers or growth arrows — those live on the chart view podium and the `/my-progress` page.

#### KPI Bar Architecture (UX-driven)

The KPI bar is the dashboard's primary information anchor — a full-width dark gradient strip (`#1a1a2e` → `#6C63FF`) at the top of the page:

- **Left: Hero metrics cluster** — Total Spend, Total Tokens, Active Members (bold white text, instant-read)
- **Center: Per-vendor summary cards** — One card per vendor (Cursor, Claude, Copilot, Replit, Kiro) showing: vendor name, freshness dot (green/amber/red/gray), total spend, total tokens, seat count
- **Right: Period selector** — Dropdown for month selection (Feb 2026, Jan 2026, etc.)
- **Freshness indicators live here and nowhere else** — Member cards do not show staleness; the KPI bar vendor cards are the single source of truth for data freshness
- Freshness thresholds: Fresh (green, < 6h), Stale (amber, 6–24h), Old (red, > 24h), Manual (gray, days since manual entry)

#### Leaderboard Emotional Architecture (UX-driven)

Three-layer rank visibility system:

1. **Public podium (top 5-8, chart view):** Gold/silver/bronze treatment. Growth arrows for climbers. Identity display controlled by admin `leaderboard_display_mode` setting (named / initialed / anonymous).
2. **Private progress (`/my-progress`):** Personal rank, trajectory over time, badges, suggestion machine, podium proximity bar ("3 spots from the top 8"). Framed as "your story," not a scoreboard.
3. **Admin full view:** Complete ranked list, all names, no gamification chrome. For operational and executive use.

#### Dual-Tone Design System (UX-driven)

One design system with two emotional registers, toggled via a `.cool-mode` CSS class on a parent container:

**Warm mode (default):** Cards view, suggestion machine, badges, My Progress
- Page background: `#EDEAE4` (warm cream)
- Card hover: shadow lift + `translateY(-1px)`
- KPI bar: dark→purple gradient
- Animations enabled (growth arrows, skeleton shimmer, suggestion streaming)

**Cool mode:** Chart view, admin pages
- Page background: `#F5F5F5` (neutral gray)
- No card hover transform
- KPI bar: flat slate `#334155`
- Animations disabled (0ms duration)

Implementation: CSS custom properties (`--page-bg`, `--card-bg`, `--card-radius`, `--kpi-bar-bg`, etc.) with overrides on `.cool-mode`. Components are mode-agnostic — they reference variables, not hard-coded colors.

#### Vendor Color System (UX-driven)

A single `VENDOR_COLORS` constant exports each vendor's palette. Used everywhere: tool pills, chart bar segments, legends, KPI bar vendor cards. One source of truth.

```typescript
const VENDOR_COLORS = {
  claude:  { primary: '#D97706', bg: '#FFF7ED', text: '#92400E', border: 'rgba(217,119,6,0.2)' },
  cursor:  { primary: '#A5B4C4', bg: '#1A1A2E', text: '#E5E7EB', border: 'rgba(26,26,46,0.25)' },
  copilot: { primary: '#22C55E', bg: '#F0FDF4', text: '#166534', border: 'rgba(34,197,94,0.2)' },
  replit:  { primary: '#F26522', bg: '#0E1525', text: '#FED7AA', border: 'rgba(14,21,37,0.25)' },
  kiro:    { primary: '#7C3AED', bg: '#F5F3FF', text: '#5B21B6', border: 'rgba(124,58,237,0.2)' },
} as const;
```

#### Responsive Design

**Desktop-only for MVP.** The AI Spend Dashboard is an internal tool for ~29 team members on work laptops and monitors.

- **Supported range:** 1024px – 2560px
- **Card grid:** CSS Grid `auto-fill` with `minmax(240px, 1fr)` — responsive without breakpoints
- **Max content width:** 1440px centered (`margin: 0 auto`)
- **KPI bar:** Full-bleed (no max-width), spans viewport
- At narrow widths (< 1280px): vendor cards drop seat count; at < 1100px: vendor tokens text hides
- No mobile or tablet layouts designed or supported for MVP

### Infrastructure & Deployment

#### Vercel Configuration

- Vercel Hobby tier, single production deployment
- All secrets in Vercel environment variables
- Serverless functions for all API routes
- No edge runtime needed — standard Node.js serverless

#### Monitoring

- Vercel built-in function logs for MVP
- Adapter sync status tracked in `vendor_configs` table (`last_sync_at`, `last_sync_status`)
- Per-vendor confidence levels visible on dashboard for end-user transparency
- No external monitoring service for MVP

### Replit Scraper (Deferred — Breadcrumbs)

**Implementation: GitHub Action (post-MVP)**

Replit has no billing API (unlike the 4 API vendors: Cursor, Claude, Copilot, Kiro). Data ingestion via external web scraper running as a scheduled GitHub Action:

- **Scraper**: Playwright-based script scrapes Replit team billing page using stored session cookie
- **Schedule**: GitHub Actions cron (daily or weekly)
- **Auth**: Replit session cookie stored in GitHub Secrets; dashboard ingest endpoint authenticated with shared API key
- **Data flow**: Scraper parses per-member spend → POSTs to `/api/sync/replit` → stored as `source_type = 'scraping'`, `confidence = 'medium'`
- **Fallback**: Manual entry always available if scraper breaks
- **Repository**: Can live in the main repo under `.github/workflows/` or as a separate repo
- **Not needed for MVP launch**: Manual entry covers Replit data initially

### Decision Impact Analysis

**Implementation Sequence:**
1. Project initialization (`create-next-app`) + Drizzle + Neon setup + CSS design tokens (dual-tone system)
2. Better Auth integration with custom fields
3. Database schema (all tables incl. `suggestions`, `leaderboard_display_mode` on tenants)
4. Vendor adapter interface + first adapter (Cursor or Claude)
5. Member identity CRUD
6. Dashboard API + aggregation queries + KPI bar vendor summary data
7. Frontend views (KPI bar with vendor cards, cards view with tool pills, chart view with leaderboard podium)
8. `/my-progress` page (personal rank, badges, suggestion machine with caching, podium proximity bar)
9. Admin UI (vendor config, manual entry, user management, tenant settings)

**Cross-Component Dependencies:**
- Better Auth `user` table → custom `role`, `tenant_id`, `member_id` fields
- `usage_records` → depends on `members` and `member_identities` for aggregation
- Dashboard API → depends on all vendor adapters (5 vendors) + aggregation logic
- KPI bar vendor cards → depends on `vendor_configs` + usage aggregation per vendor
- Suggestion machine → depends on aggregated member metrics + `ANTHROPIC_API_KEY` + `suggestions` table for caching
- Gamification → depends on aggregated data for badge eligibility computation
- Leaderboard podium → depends on `leaderboard_display_mode` tenant setting
- `VENDOR_COLORS` constant → consumed by ToolPill, SpendChart, VendorCard, chart legends

## Implementation Patterns & Consistency Rules

### Naming Patterns

**Database (PostgreSQL/Drizzle):**
- Tables: `snake_case`, plural — `usage_records`, `member_identities`, `vendor_configs`
- Columns: `snake_case` — `spend_cents`, `tenant_id`, `period_start`, `last_sync_at`
- Foreign keys: `{referenced_table_singular}_id` — `member_id`, `tenant_id`
- Indexes: `idx_{table}_{columns}` — `idx_usage_records_tenant_id_vendor`
- Enums defined in Drizzle schema as TypeScript union types, not DB-level enums (simpler migrations)

**API Endpoints:**
- Routes: `kebab-case`, plural nouns — `/api/members`, `/api/vendor-config`, `/api/manual-entry`
- Route params: `[id]` — `/api/members/[id]`
- Query params: `camelCase` — `?periodStart=2026-01-01&vendorType=cursor`

**TypeScript:**
- Variables/functions: `camelCase` — `fetchUsageData`, `spendCents`, `syncStatus`
- Types/interfaces: `PascalCase` — `UsageRecord`, `VendorAdapter`, `DashboardResponse`
- Constants: `UPPER_SNAKE_CASE` — `VENDOR_TYPES`, `BADGE_DEFINITIONS`, `DEFAULT_STALENESS_THRESHOLD`
- Booleans: prefix with `is`/`has`/`can` — `isAdmin`, `hasLinkedMember`, `canSync`

**Files & Directories:**
- Route files: `kebab-case` per Next.js convention — `vendor-config/`, `manual-entry/`
- React components: `PascalCase` — `MemberCard.tsx`, `SpendChart.tsx`, `LeaderboardRow.tsx`
- Utilities/services: `kebab-case` — `vendor-adapters.ts`, `encryption.ts`, `format-currency.ts`
- Drizzle schema: `schema.ts` (single file for MVP, split later if needed)
- Type definitions: `types.ts` per module or `@/types/` for shared types

### Structure Patterns

**Component Organization: by feature, not by type.**

```
src/components/
├── dashboard/           # KpiBar, MemberCard, ToolPill, CardsView, SpendChart, ViewToggle, VendorCard
├── leaderboard/         # LeaderboardPodium, GrowthArrow, PodiumProximityBar
├── members/             # MemberTable, MemberForm (admin identity management)
├── gamification/        # BadgeCard, BadgeGallery, MemberAchievements, SuggestionMachine, SuggestionSnippet
├── admin/               # VendorConfigForm, ManualEntryForm, UserManagement, TenantSettings
├── layout/              # AppShell, NavBar, PageHeader
├── shared/              # EmptyState (invitation-framed, per-context variants)
└── ui/                  # shadcn/ui components (auto-generated location)
```

**Service Organization:**

```
src/lib/
├── db/
│   ├── schema.ts        # Drizzle schema (all tables incl. suggestions)
│   ├── index.ts          # DB connection (Neon adapter)
│   └── queries/
│       ├── members.ts    # Member + identity queries
│       ├── usage.ts      # Usage aggregation, KPIs, leaderboard, trends
│       ├── sync.ts       # Sync status, vendor config queries
│       └── suggestions.ts # Cached suggestion CRUD per member/period
├── adapters/
│   ├── types.ts          # VendorAdapter interface, shared types
│   ├── cursor.ts         # Cursor adapter implementation
│   ├── claude.ts         # Claude adapter implementation
│   ├── copilot.ts        # Copilot adapter implementation
│   ├── kiro.ts           # Kiro adapter implementation
│   └── registry.ts       # Adapter lookup by vendor type
├── auth.ts               # Better Auth configuration
├── encryption.ts         # AES-256 encrypt/decrypt for vendor credentials
├── suggestions.ts        # LLM prompt construction + Anthropic API call
├── vendor-colors.ts      # VENDOR_COLORS constant (single source of truth)
└── utils/
    ├── format-currency.ts  # spend_cents → "$14,280" (no decimals)
    ├── format-tokens.ts    # 39629164 → "39.6M tok" / 286874 → "287K tok"
    └── date-ranges.ts      # Period helpers, staleness checks, period keys
```

**Test Organization: co-located with source.**

```
src/lib/adapters/cursor.ts
src/lib/adapters/cursor.test.ts
src/lib/utils/format-currency.ts
src/lib/utils/format-currency.test.ts
```

No top-level `__tests__/` directory. Tests live next to what they test. Test files use `.test.ts` suffix (not `.spec.ts`).

### Format Patterns

**Dates:**
- DB storage: PostgreSQL `timestamp with time zone`
- API transport: ISO 8601 strings — `"2026-02-25T00:00:00Z"`
- Display: formatted at render time with `Intl.DateTimeFormat` or lightweight formatter
- Date range params: `YYYY-MM-DD` strings in query params

**Money:**
- DB: `integer` (cents) — `80038` for $800.38
- API: transport as cents (integer) — client converts for display
- Display: `formatCurrency(cents)` utility — `$800`, `$3,500`, `$14,280` (**no decimals**, per UX spec). Commas at thousands.

**Tokens:**
- DB: `bigint` or `integer`
- API: transport as raw number
- Display: `formatTokens(count)` utility — `39.6M tok` (>= 1M, one decimal), `287K tok` (< 1M, rounded to nearest K), `~ tok` (when unavailable / null)

**JSON field naming in API responses: `camelCase`.**
DB columns are `snake_case`, API responses are `camelCase`. Drizzle handles the mapping in query results.

**Null handling:**
- `null` means "not available" (e.g., tokens for Replit)
- `0` means "actually zero" (e.g., zero spend on an idle seat)
- Never use empty string `""` as a null substitute

### Communication Patterns

**Server → Client data flow:**
1. React Server Component fetches from DB via Drizzle queries in `src/lib/db/queries/`
2. Data passed as props to client components
3. No client-side `fetch` for initial dashboard load (server-rendered)
4. Client-side `fetch` only for: suggestion machine streaming, manual sync triggers, admin CRUD operations

**Stale-while-revalidate trigger:**
- Server component checks `vendor_configs.last_sync_at` vs `staleness_threshold_minutes`
- If stale: fires `fetch()` to `/api/sync/trigger` with `{ vendor }` — non-blocking, fire-and-forget
- Current request serves existing data from DB
- No WebSocket, no polling — next page load gets fresh data

**Suggestion machine (cached-per-period with streaming generation):**
- Client first sends GET to `/api/suggestions?memberId=X&period=2026-02` to check for cached suggestion
- If cached: return stored suggestion instantly (no LLM call)
- If not cached: client sends POST to `/api/suggestions` with `{ memberId, period }`
- Server fetches member metrics, calls Anthropic API with streaming
- Response uses `ReadableStream` / Server-Sent Events
- Client renders token-by-token with animated "thinking" state
- On stream completion, server stores the full suggestion in `suggestions` table
- "Regenerate" action sends DELETE then POST — clears cache and streams fresh output

### Process Patterns

**Error Handling:**

```typescript
// API route pattern
export async function GET(request: Request) {
  try {
    // ... business logic
    return Response.json({ data: result, meta: vendorSyncMeta });
  } catch (error) {
    console.error('[dashboard] Failed to load:', error);
    return Response.json(
      { error: { code: 'DASHBOARD_LOAD_FAILED', message: 'Failed to load dashboard data' } },
      { status: 500 }
    );
  }
}
```

- Error codes: `UPPER_SNAKE_CASE` — `ADAPTER_TIMEOUT`, `SYNC_FAILED`, `UNAUTHORIZED`, `MEMBER_NOT_FOUND`
- Log the full error server-side, return a safe message client-side
- Never expose stack traces, DB errors, or credential details in API responses

**Loading States:**
- Server-rendered pages: no loading state needed (data fetched before render)
- Client interactions (sync trigger, manual entry, suggestion machine): use `isLoading` boolean state
- Suggestion machine: custom animated text states, not a generic spinner

**Validation:**
- Zod for runtime validation of API request bodies and external data
- Validate at API route entry points — don't trust client input
- Adapter responses validated against expected shape before DB insert
- Drizzle schema provides type safety but not runtime validation — Zod fills that gap

### Enforcement Guidelines

**All AI Agents MUST:**
- Use `tenant_id` in every DB query (no exceptions — even if only one tenant exists)
- Store money as cents (integer), never floating point
- Display currency with no decimals (`$14,280` not `$14,280.38`)
- Use the `VendorAdapter` interface for API vendors, never ad-hoc fetch calls
- Return the standard `{ data, meta? }` / `{ error }` response wrapper from all API routes
- Include all 5 vendors (Cursor, Claude, Copilot, Replit, Kiro) in vendor meta responses
- Place components in feature directories, not a flat `components/` folder
- Co-locate tests with source files using `.test.ts` suffix
- Use `camelCase` in API responses, `snake_case` in DB columns
- Handle `null` tokens explicitly (Replit and some vendor data may not have token counts)
- Use `VENDOR_COLORS` constant from `src/lib/vendor-colors.ts` for all vendor color references — never hardcode vendor colors in components
- Apply `.cool-mode` class on chart view and admin pages — never mix warm/cool mode tokens
- Never show rank numbers or growth arrows on member cards in cards view — those belong on chart view podium and `/my-progress`
- Respect `leaderboard_display_mode` tenant setting when rendering the public podium

## Project Structure & Boundaries

### Complete Project Directory Structure

```
ai-spend-dashboard/
├── .env.local                          # Local dev env vars (gitignored)
├── .env.example                        # Template with required var names
├── .gitignore
├── .github/
│   └── workflows/
│       └── replit-scraper.yml          # Deferred: Replit scraping cron
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── drizzle.config.ts                   # Drizzle Kit migration config
├── package.json
│
├── src/
│   ├── app/
│   │   ├── globals.css                # CSS custom properties (dual-tone tokens), Tailwind imports
│   │   ├── layout.tsx                  # Root layout (Better Auth session provider)
│   │   ├── page.tsx                    # Redirect to /dashboard or /login
│   │   ├── login/
│   │   │   └── page.tsx               # Login form
│   │   ├── dashboard/
│   │   │   └── page.tsx               # Main dashboard (KPI bar, cards/chart toggle)
│   │   ├── my-progress/
│   │   │   └── page.tsx               # Personal progress: rank history, badges, suggestion machine, podium proximity
│   │   ├── admin/
│   │   │   ├── members/
│   │   │   │   └── page.tsx           # Member identity management (CRUD table)
│   │   │   ├── vendor-config/
│   │   │   │   └── page.tsx           # API credential management per vendor
│   │   │   ├── manual-entry/
│   │   │   │   └── page.tsx           # Manual usage data entry form
│   │   │   ├── users/
│   │   │   │   └── page.tsx           # User account management (roles, passwords)
│   │   │   └── settings/
│   │   │       └── page.tsx           # Tenant settings (leaderboard display mode, etc.)
│   │   └── api/
│   │       ├── auth/[...all]/
│   │       │   └── route.ts           # Better Auth catch-all
│   │       ├── dashboard/
│   │       │   └── route.ts           # GET: aggregated dashboard data + vendor sync meta (incl. spend, tokens, seats per vendor)
│   │       ├── members/
│   │       │   ├── route.ts           # GET: list, POST: create
│   │       │   └── [id]/
│   │       │       └── route.ts       # GET/PUT/DELETE: single member + identity linking
│   │       ├── sync/
│   │       │   ├── trigger/
│   │       │   │   └── route.ts       # POST: trigger manual sync for vendor
│   │       │   ├── status/
│   │       │   │   └── route.ts       # GET: sync status per vendor
│   │       │   └── replit/
│   │       │       └── route.ts       # POST: ingest endpoint for Replit scraper
│   │       ├── vendor-config/
│   │       │   ├── route.ts           # GET: list configs, POST: create/update
│   │       │   └── [vendor]/
│   │       │       └── route.ts       # GET/PUT: single vendor config + test connection
│   │       ├── manual-entry/
│   │       │   ├── route.ts           # GET: list, POST: create
│   │       │   └── [id]/
│   │       │       └── route.ts       # PUT/DELETE: edit/remove manual entry
│   │       ├── suggestions/
│   │       │   ├── route.ts           # GET: cached suggestion, POST: generate (streaming) + cache
│   │       │   └── [id]/
│   │       │       └── route.ts       # DELETE: clear cached suggestion
│   │       └── admin/
│   │           ├── users/
│   │           │   ├── route.ts       # GET: list, POST: create user
│   │           │   └── [id]/
│   │           │       └── route.ts   # PUT/DELETE: edit role, reset password
│   │           └── settings/
│   │               └── route.ts       # GET/PUT: tenant settings
│   │
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── KpiBar.tsx             # Dark gradient bar: hero metrics + vendor summary cards + period selector
│   │   │   ├── VendorCard.tsx         # Per-vendor summary in KPI bar (spend, tokens, seats, freshness dot)
│   │   │   ├── ViewToggle.tsx         # Cards | Chart toggle (shadcn/ui Tabs)
│   │   │   ├── MemberCard.tsx         # Individual member card: avatar, tool pills, total spend, suggestion CTA
│   │   │   ├── ToolPill.tsx           # Per-vendor spend+tokens pill with vendor-colored border
│   │   │   ├── CardsView.tsx          # CSS Grid of MemberCards
│   │   │   └── SpendChart.tsx         # Stacked horizontal bar chart (Recharts)
│   │   ├── leaderboard/
│   │   │   ├── LeaderboardPodium.tsx  # Top 5-8 display with gold/silver/bronze, anonymity-aware
│   │   │   ├── GrowthArrow.tsx        # Green ▲ (up) or gray — (neutral). No down variant.
│   │   │   └── PodiumProximityBar.tsx # "3 spots from the top 8" progress indicator
│   │   ├── gamification/
│   │   │   ├── BadgeCard.tsx          # Single badge display
│   │   │   ├── BadgeGallery.tsx       # Grid of available badges
│   │   │   ├── MemberAchievements.tsx # Per-member earned badges
│   │   │   ├── SuggestionMachine.tsx  # Full LLM interaction: thinking state + streaming + branded output card
│   │   │   └── SuggestionSnippet.tsx  # Truncated teaser on member card + CTA link to /my-progress
│   │   ├── members/
│   │   │   ├── MemberTable.tsx        # Admin: identity management table
│   │   │   └── MemberForm.tsx         # Admin: add/edit member + link identities
│   │   ├── admin/
│   │   │   ├── VendorConfigForm.tsx   # API credential entry + test connection
│   │   │   ├── ManualEntryForm.tsx    # Manual usage data entry
│   │   │   ├── UserManagement.tsx     # User account CRUD
│   │   │   └── TenantSettings.tsx     # Leaderboard display mode toggle, etc.
│   │   ├── shared/
│   │   │   └── EmptyState.tsx         # Invitation-framed empty states with per-context personality
│   │   ├── layout/
│   │   │   ├── AppShell.tsx           # Main layout with nav
│   │   │   ├── NavBar.tsx             # Navigation (role-aware: hides admin for viewers)
│   │   │   └── PageHeader.tsx         # Page title + description
│   │   └── ui/                        # shadcn/ui components (npx shadcn-ui add ...)
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts             # Drizzle schema: all tables (incl. suggestions)
│   │   │   ├── index.ts              # Neon DB connection
│   │   │   └── queries/
│   │   │       ├── members.ts        # Member + identity queries
│   │   │       ├── usage.ts          # Usage aggregation, KPIs, leaderboard, trends
│   │   │       ├── sync.ts           # Sync status, vendor config queries
│   │   │       └── suggestions.ts    # Cached suggestion CRUD per member/period
│   │   ├── adapters/
│   │   │   ├── types.ts              # VendorAdapter interface, shared types
│   │   │   ├── cursor.ts             # Cursor API adapter
│   │   │   ├── claude.ts             # Claude Admin API adapter
│   │   │   ├── copilot.ts            # GitHub Copilot API adapter
│   │   │   ├── kiro.ts               # Kiro API adapter
│   │   │   └── registry.ts           # Adapter lookup by vendor type
│   │   ├── auth.ts                   # Better Auth config + helpers (requireAdmin, etc.)
│   │   ├── encryption.ts             # AES-256 encrypt/decrypt
│   │   ├── suggestions.ts            # LLM prompt construction + Anthropic API call
│   │   ├── vendor-colors.ts          # VENDOR_COLORS constant (brand palettes, single source of truth)
│   │   └── utils/
│   │       ├── format-currency.ts    # spend_cents → "$14,280" (no decimals)
│   │       ├── format-tokens.ts      # 39629164 → "39.6M tok" / 286874 → "287K tok"
│   │       └── date-ranges.ts        # Period helpers, staleness checks, period key generation
│   │
│   ├── types/
│   │   └── index.ts                  # Shared TypeScript types (VendorType, SourceType, Confidence, etc.)
│   │
│   └── middleware.ts                  # Better Auth middleware (auth check on all routes)
│
├── drizzle/
│   └── migrations/                    # Drizzle Kit generated migrations
│
└── public/
    └── favicon.ico
```

### Architectural Boundaries

**API Boundaries:**
- All data access goes through `src/lib/db/queries/` — components and API routes never import Drizzle directly
- Vendor adapters only accessed through `src/lib/adapters/registry.ts` — never instantiated directly in routes
- Encryption only in `src/lib/encryption.ts` — never inline crypto in routes or adapters
- Auth checks in `src/middleware.ts` (global) + `src/lib/auth.ts` (`requireAdmin()` per-route)

**Data Flow:**

```
Vendor APIs → Adapters → usage_records table → Queries → Server Components → Client Components
                                                                  ↓
Admin UI → API Routes → DB writes                    Suggestion Machine → Anthropic API → Streaming response
```

**Page → Feature Mapping:**

| Page Route | Feature | Components | Queries | Role |
|---|---|---|---|---|
| `/dashboard` | KPI bar, cards/chart toggle, team view | `dashboard/*`, `leaderboard/LeaderboardPodium` | `usage.ts`, `sync.ts` | viewer |
| `/my-progress` | Personal rank, badges, suggestion machine, podium proximity | `gamification/*`, `leaderboard/PodiumProximityBar` | `usage.ts`, `suggestions.ts` | viewer (own data) |
| `/admin/members` | Member identity management | `members/*` | `members.ts` | admin |
| `/admin/vendor-config` | API credential management | `admin/VendorConfigForm` | `sync.ts` | admin |
| `/admin/manual-entry` | Manual usage data entry | `admin/ManualEntryForm` | `usage.ts` | admin |
| `/admin/users` | User account management | `admin/UserManagement` | Better Auth admin API | admin |
| `/admin/settings` | Tenant settings (leaderboard display mode) | `admin/TenantSettings` | tenants query | admin |
| `/login` | Authentication | standalone form | Better Auth | public |

### Integration Points

**Internal Communication:**
- Server Components → `src/lib/db/queries/` (direct DB access, no API call)
- Client Components → `src/app/api/` routes (fetch for mutations and streaming)
- API Routes → `src/lib/adapters/` (vendor data fetching)
- API Routes → `src/lib/db/queries/` (data persistence)

**External Integrations:**
- Cursor Analytics API (Basic Auth) → `src/lib/adapters/cursor.ts`
- Claude Admin API (API key + anthropic-version header) → `src/lib/adapters/claude.ts`
- GitHub Copilot API (PAT) → `src/lib/adapters/copilot.ts`
- Kiro API → `src/lib/adapters/kiro.ts`
- Anthropic Messages API (streaming) → `src/lib/suggestions.ts`
- Replit scraper (GitHub Action) → `POST /api/sync/replit`
- Neon PostgreSQL → `src/lib/db/index.ts` via `drizzle-orm/neon-http`

## Architecture Validation

### Functional Requirements Coverage

All 40 functional requirements from the PRD are architecturally supported:

**Dashboard & Visualization (FR1-6):**
- FR1 (Monthly spend per member): `usage_records` → `queries/usage.ts` → `CardsView.tsx` / `SpendChart.tsx`
- FR2 (Cards and chart views): `ViewToggle.tsx` client-side toggle, same data prop to both views
- FR3 (Leaderboard with rankings): Computed on-demand from `usage_records`, `LeaderboardRow.tsx`
- FR4 (Period-over-period growth): Computed from timestamped `usage_records` — no snapshot table needed
- FR5 (Per-tool spend breakdown): `usage_records.vendor` field, quadrant display in `MemberCard.tsx`
- FR6 (Data source indicators): `source_type` + `confidence` fields, `VendorSyncStatus.tsx`

**Gamification (FR7-13):**
- FR7-12 (Badge types): `badges` table, `BADGE_DEFINITIONS` constant, `BadgeGallery.tsx`
- FR13 (LLM suggestions): `/api/suggestions` streaming endpoint with per-period caching in `suggestions` table → `SuggestionMachine.tsx` on `/my-progress`, `SuggestionSnippet.tsx` teaser on member card

**Vendor Data Integration (FR14-23):**
- FR14-16 (Cursor, Claude, Copilot adapters) + Kiro adapter: `VendorAdapter` interface, per-vendor implementations in `src/lib/adapters/` (4 API vendor adapters total)
- FR17 (Replit support): External scraper → `/api/sync/replit` ingest + manual entry fallback
- FR18 (Normalized data model): All adapters output `UsageRecord` shape, stored in `usage_records`
- FR19 (Manual data entry): `/api/manual-entry` + `ManualEntryForm.tsx`, `source_type = 'manual'`
- FR20 (Confidence labeling): `source_type` + `confidence` on every `usage_records` row
- FR21 (Credential management): `vendor_configs` with AES-256 encryption, `VendorConfigForm.tsx`
- FR22 (Scheduled sync): Stale-while-revalidate pattern, no cron dependency
- FR23 (Manual sync trigger): `/api/sync/trigger` admin endpoint

**Member Identity Management (FR24-29):**
- FR24-29 (CRUD, cross-platform linking): `members` + `member_identities` tables, `/api/members/[id]`, `MemberTable.tsx`, `MemberForm.tsx`

**Authentication & Authorization (FR30-34):**
- FR30 (Email/password login): Better Auth with bcrypt
- FR31-32 (Admin user management): Better Auth admin plugin, `/api/admin/users`
- FR33 (Role-based access): `role` field on `user` table, `requireAdmin()` utility, middleware
- FR34 (Admin-only routes): Server-side role enforcement + UI nav hiding

**Data Aggregation (FR35-40):**
- FR35-40 (KPIs, rankings, trends, filtering): All computed on-demand from `usage_records` via `queries/usage.ts`. Period filtering via `periodStart`/`periodEnd` query params. No materialized views — raw records are the source of truth.

### Non-Functional Requirements Coverage

All 15 NFRs are architecturally addressed:

| NFR | Requirement | Architectural Support |
|---|---|---|
| NFR1 | Encrypted credentials at rest | AES-256 in `encryption.ts`, key in Vercel env var |
| NFR2 | Secure session management | Better Auth JWT cookies, httpOnly, secure flags |
| NFR3 | Server-side role enforcement | `requireAdmin()` utility + middleware, never client-only |
| NFR4 | Tenant isolation on all queries | `tenant_id` on all tables, enforced in `queries/*.ts` |
| NFR5 | Sub-3s initial page load | Server-rendered RSC, no client fetch for initial load |
| NFR6 | Dashboard usable across viewports | Desktop-only (1024–2560px), CSS Grid `auto-fill` adapts card columns, KPI bar vendor cards compress at narrow widths |
| NFR7 | Graceful degradation on adapter failure | Serve cached data + staleness indicator, never 500 to dashboard |
| NFR8 | Handle missing/partial vendor data | `null` tokens, `confidence` field, UI handles missing gracefully |
| NFR9 | 30-second adapter timeout | Per-adapter timeout in `VendorAdapter.fetchUsageData` |
| NFR10 | Data consistency across views | Single `usage_records` source, all views query same data |
| NFR11 | Audit trail for manual entries | `created_by` + `synced_at` on `usage_records` |
| NFR12 | Secure credential input | Server-side only decrypt, never exposed to client |
| NFR13 | Connection validation before save | `VendorAdapter.testConnection()` called from `VendorConfigForm` |
| NFR14 | Extensible adapter pattern | `VendorAdapter` interface + `registry.ts`, add vendor without core changes |
| NFR15 | Deployable on Vercel Hobby | Serverless functions, no persistent processes, no cron dependency |

### Coherence Validation

**Cross-Section Consistency:** All decisions reference the same type system (`ApiVendor` now includes `'kiro'`, `ScrapedVendor`, `VendorType`, `SourceType`, `Confidence`). Data flows from 5 vendor adapters through `usage_records` to queries to server components to client components without schema breaks. The `VENDOR_COLORS` constant ensures visual consistency across all vendor-colored surfaces.

**Pattern Consistency:** Naming conventions (snake_case DB, camelCase API, PascalCase components) are applied uniformly across schema, API routes, and project structure. Feature-based organization is consistent across `components/`, `lib/db/queries/`, and page routes. The dual-tone (warm/cool) CSS system is consistent with component mode-agnostic patterns.

**UX ↔ Architecture Alignment:** KPI bar vendor summary cards, tool pills (replacing quadrants), three-layer leaderboard architecture, suggestion caching, and vendor color system all match the UX Design Specification and HTML mockup decisions. Component names, page routes, and data flow match what the UX spec describes.

**Dependency Validation:** Implementation sequence (adapters → identity → aggregation → display → my-progress) aligns with data flow and table foreign key relationships. The `suggestions` table has FK to `members`, and the `leaderboard_display_mode` on `tenants` feeds into the podium rendering. No circular dependencies detected.

**PRD Deviation Tracking:**
1. Better Auth replacing NextAuth.js — with full rationale and confirmation that all FR30-34 requirements remain satisfied.
2. Kiro added as 5th tracked vendor — UX-driven addition. Kiro is an `ApiVendor` with a full adapter. PRD only specified 4 vendors; UX spec and design mockups include Kiro.
3. Suggestion machine changed from stateless to cached-per-period — UX-driven. The "unwrapping" moment requires a `suggestions` table. Functionally equivalent for FR13 but adds persistence.
4. `/achievements` replaced by `/my-progress` — UX-driven. Consolidates badges, suggestion machine, personal rank history, and podium proximity into a single personal progress page.
5. No materialized snapshots for period-over-period comparison — FR38 says "store periodic usage snapshots" but Architecture computes on demand from timestamped `usage_records`. Intentional substitution: eliminates snapshot storage overhead, keeps 0.5 GB free-tier constraint a non-issue, and `usage_records` already contain all needed temporal data. FR38 intent (period-over-period comparison) is fully satisfied.

### Gaps and Risks

**No critical gaps found.** All FRs and NFRs have clear architectural support. UX spec requirements are now architecturally integrated.

**Acknowledged deferred items (not gaps):**
- Replit scraper GitHub Action (manual entry covers MVP)
- Email service for password resets (admin-manual for MVP)
- External cron for data pre-warming (stale-while-revalidate covers MVP)
- Multi-tenant onboarding UI (single tenant for MVP)
- Display mode (`?mode=display`) for conference room wall display (Phase 2 — architecture should not block this)
- Dev reference page (`/dev/components`) for component visual testing (development convenience, not MVP-blocking)
