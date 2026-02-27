---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
---

# ai-spend-dashboard - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for ai-spend-dashboard, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Dashboard & Visualization (FR1–FR6)**

- FR1: Viewers can see a cards view displaying individual member cards with per-tool usage breakdown
- FR2: Viewers can see a chart view displaying stacked bar comparison of spend and usage across team members
- FR3: Viewers can toggle between cards view and chart view
- FR4: Viewers can see top-line KPIs (Total Team Spend, Total Tokens, Active Members) on the dashboard
- FR5: Viewers can see per-tool quadrant breakdown on each member card (spend, tokens, usage indicators per vendor)
- FR6: Viewers can see data confidence indicators showing sync status and staleness per data source

**Gamification & Engagement (FR7–FR13)**

- FR7: Viewers can see a leaderboard ranking members by spend
- FR8: Viewers can see growth-only directional indicators (green up-arrows for climbers, no negative indicators)
- FR9: The system can award achievement badges to members based on developer-defined threshold criteria (static set: AI Pioneer, Token Titan, Big Spender, Multi-Tool Master, Early Adopter)
- FR10: Viewers can see earned badges displayed on member cards
- FR11: The system can generate personalized suggestions by sending member usage metrics to an LLM
- FR12: Viewers can see LLM-generated suggestion machine content per member ("with the time you saved, you could...")
- FR13: Viewers can see peer tool usage patterns on member cards (which tools each teammate uses)

**Vendor Data Integration (FR14–FR23)**

- FR14: The system can fetch usage and spend data from Cursor via REST API
- FR15: The system can fetch usage and spend data from Claude via Admin API
- FR16: The system can fetch usage and spend data from GitHub Copilot via REST API
- FR17: Admins can manually enter usage and spend data for vendors without API support (Replit)
- FR18: Admins can edit or delete previously entered manual data
- FR19: The system can normalize vendor data into a common shape (member identity, spend, tokens, usage period, confidence level)
- FR20: The system can display per-source data confidence levels and last-sync timestamps
- FR21: Admins can configure and update API credentials (keys, tokens, auth parameters) per vendor through the dashboard
- FR22: The system can run scheduled background syncs to fetch fresh data from vendor APIs
- FR23: Admins can trigger a manual data sync for any vendor adapter on demand

**Member Identity Management (FR24–FR29)**

- FR24: Admins can view auto-discovered member accounts from vendor API data
- FR25: Admins can create new member identities
- FR26: Admins can link or merge multiple vendor accounts into a single member identity
- FR27: Admins can unlink vendor accounts from a member identity
- FR28: Admins can manually add vendor usernames and emails for team members
- FR29: Admins can edit member details (name, linked accounts)

**Authentication & Access Control (FR30–FR34)**

- FR30: Users can authenticate with email and password
- FR31: Admins can create new user accounts with assigned roles (viewer or admin)
- FR32: Admins can manage user accounts (edit roles, reset passwords)
- FR33: The system can enforce role-based access (viewers see dashboard; admins access member management, API keys, manual data entry)
- FR34: The system can maintain user sessions via JWT

**Data Aggregation & Computation (FR35–FR40)**

- FR35: The system can aggregate per-member spend across all linked vendor accounts
- FR36: The system can aggregate per-member token usage across all linked vendor accounts
- FR37: The system can compute team-level totals for KPI display
- FR38: The system can store periodic usage snapshots to enable period-over-period comparison
- FR39: The system can compute leaderboard rankings and detect position changes between periods
- FR40: The system can compute badge eligibility based on member usage data

### NonFunctional Requirements

**Security (NFR1–NFR4)**

- NFR1: API credentials (vendor keys, tokens, PATs) must be encrypted at rest
- NFR2: Authentication sessions must use signed JWT tokens with expiration
- NFR3: Admin-only routes must enforce role checks server-side (not just UI hiding)
- NFR4: All data queries must be scoped by `tenant_id` to enforce data isolation

**Performance (NFR5–NFR6)**

- NFR5: Dashboard pages must render within 3 seconds on initial load
- NFR6: View toggling (cards ↔ chart) must complete within 500ms client-side

**Integration Reliability (NFR7–NFR9)**

- NFR7: Vendor adapter failures must not block dashboard rendering (graceful degradation with stale data + staleness indicator)
- NFR8: Each vendor adapter must report sync status (last success, last failure, confidence level)
- NFR9: Vendor API timeouts must be capped at 30 seconds per adapter

**Data Integrity (NFR10–NFR12)**

- NFR10: Data staleness must be visually indicated when last sync exceeds a configured threshold per source
- NFR11: Manual data entries must be timestamped and attributed to the admin who entered them
- NFR12: Member identity merges must preserve all historical data from merged accounts

**Scalability (NFR13–NFR15)**

- NFR13: Database schema must include `tenant_id` on all data tables from day one
- NFR14: System must support adding new vendor adapters without modifying core application code
- NFR15: Free-tier database storage constraints must be monitored; data retention policy deferred to architecture

### Additional Requirements

**From Architecture:**

- Starter template: `create-next-app@latest` (Next.js 16.1) — Epic 1, Story 1 must initialize from this
- Auth: Better Auth (deviation from PRD's NextAuth.js — Auth.js is maintenance-only; Better Auth is the active successor)
- Database: Neon PostgreSQL free tier (0.5 GB, scales to zero) with Drizzle ORM
- UI Components: shadcn/ui (copy-paste model, Radix UI + Tailwind CSS)
- Charting: Recharts (stacked bars, line charts)
- Credential encryption: Application-layer AES-256 for vendor API keys; encryption key in Vercel env var
- Data sync pattern: Stale-while-revalidate (serve cached data, trigger background refresh if stale, fresh data on next load)
- Suggestion machine pattern: Cached-per-period with on-demand streaming generation (1 LLM call per member per period unless regenerated)
- Kiro added as 5th vendor (UX-driven): API vendor with adapter, brand color #7C3AED
- Replit scraper deferred to post-MVP (GitHub Action); manual entry covers Replit initially
- Vendor type system: `ApiVendor = 'cursor' | 'claude' | 'copilot' | 'kiro'`; `ScrapedVendor = 'replit'`
- Zod for runtime validation at API route entry points
- Co-located tests with `.test.ts` suffix (no top-level `__tests__/` directory)
- No materialized snapshots — period-over-period computed on demand from timestamped `usage_records`
- `spend_cents` as integer (cents, not dollars) throughout
- Standard API response wrapper: `{ data, meta? }` / `{ error: { code, message } }`
- Feature-based component organization (not flat `components/` folder)
- Server components for data fetching; client-side fetch only for suggestion streaming, sync triggers, admin CRUD

**From UX Design:**

- Desktop-only for MVP: supported range 1024px–2560px, max content width 1440px centered
- Dual-tone design system: warm mode (default — cards view, badges, suggestions) and cool mode (chart view, admin pages) via `.cool-mode` CSS class
- CSS custom properties for theming (`--page-bg`, `--card-bg`, `--card-radius`, `--kpi-bar-bg`, etc.)
- KPI bar: full-width dark gradient strip with hero metrics (left), vendor summary cards (center), period selector (right)
- Vendor summary cards in KPI bar show spend, tokens, seats, freshness dot — freshness indicators live here and nowhere else
- Freshness thresholds: Fresh (green, < 6h), Stale (amber, 6–24h), Old (red, > 24h), Manual (gray, days since entry)
- Tool pills on member cards: per-vendor spend+tokens with vendor-colored borders, CSS Grid for 5 vendors
- Highlighted "your card" for logged-in user: warm tint background + amber border + outer glow
- No rank numbers or growth arrows on member cards in cards view — those belong on chart view podium and /my-progress
- Suggestion snippet (truncated teaser) on member card with CTA link to /my-progress
- Suggestion machine: animated "thinking" state, token-by-token streaming, branded output card (screenshottable)
- /my-progress page: personal rank, trajectory over time, badges, suggestion machine, podium proximity bar
- Leaderboard podium (top 5-8 in chart view): gold/silver/bronze treatment, growth arrows, admin-configurable anonymity
- Leaderboard display mode setting on tenant: `'named' | 'initialed' | 'anonymous'` (admin-configurable)
- Empty states framed as invitations, not failures (per-context personality variants)
- Admin pages share same visual language and components as dashboard (cool mode applied)
- No decimals on currency display ($14,280 not $14,280.38)
- Token formatting: 39.6M tok (>=1M), 287K tok (<1M), ~ tok (unavailable)

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR1 | Epic 4 | Cards view with member cards |
| FR2 | Epic 4 | Chart view with stacked bars |
| FR3 | Epic 4 | Toggle between cards/chart |
| FR4 | Epic 4 | Top-line KPIs |
| FR5 | Epic 4 | Per-tool quadrant on member cards |
| FR6 | Epic 4 | Data confidence indicators |
| FR7 | Epic 5 | Leaderboard ranking |
| FR8 | Epic 5 | Growth-only arrows |
| FR9 | Epic 5 | Achievement badge awards |
| FR10 | Epic 5 | Badges on member cards |
| FR11 | Epic 5 | LLM suggestion generation |
| FR12 | Epic 5 | Suggestion machine display |
| FR13 | Epic 4 | Peer tool usage on cards |
| FR14 | Epic 2 | Cursor API adapter |
| FR15 | Epic 2 | Claude API adapter |
| FR16 | Epic 2 | Copilot API adapter |
| FR17 | Epic 2 | Manual entry (Replit) |
| FR18 | Epic 2 | Edit/delete manual data |
| FR19 | Epic 2 | Vendor data normalization |
| FR20 | Epic 2 | Confidence levels + timestamps |
| FR21 | Epic 2 | Admin credential management |
| FR22 | Epic 2 | Scheduled background sync |
| FR23 | Epic 2 | Manual sync trigger |
| FR24 | Epic 3 | Auto-discovered accounts |
| FR25 | Epic 3 | Create member identities |
| FR26 | Epic 3 | Link/merge vendor accounts |
| FR27 | Epic 3 | Unlink vendor accounts |
| FR28 | Epic 3 | Add vendor usernames manually |
| FR29 | Epic 3 | Edit member details |
| FR30 | Epic 1 | Email/password auth |
| FR31 | Epic 1 | Admin creates user accounts |
| FR32 | Epic 1 | Admin manages users |
| FR33 | Epic 1 | Role-based access enforcement |
| FR34 | Epic 1 | JWT session management |
| FR35 | Epic 3 | Aggregate per-member spend |
| FR36 | Epic 3 | Aggregate per-member tokens |
| FR37 | Epic 3 | Team-level totals |
| FR38 | Epic 3 | Periodic snapshots for comparison |
| FR39 | Epic 5 | Leaderboard rankings + changes |
| FR40 | Epic 5 | Badge eligibility computation |

## Epic List

### Epic 1: Project Foundation & User Access
Users can log in to a secured application with role-based access (admin vs. viewer). The application shell, navigation, design system, and database are in place.
**FRs covered:** FR30, FR31, FR32, FR33, FR34
**NFRs addressed:** NFR1 (encryption utils), NFR2 (JWT), NFR3 (server-side role checks), NFR4 (tenant_id scoping), NFR13 (tenant_id on all tables)

### Epic 2: Vendor Integration & Data Sync
Admins can configure API credentials for each vendor, the system automatically fetches and normalizes usage data from Cursor/Claude/Copilot/Kiro, admins can manually enter Replit data, and data freshness is tracked per source.
**FRs covered:** FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23
**NFRs addressed:** NFR1 (credential encryption), NFR7 (graceful degradation), NFR8 (sync status), NFR9 (timeouts), NFR11 (manual entry attribution), NFR14 (adapter extensibility)

### Epic 3: Member Identity & Data Aggregation
Admins can create team member profiles, link identities across platforms, and the system aggregates per-member and team-level metrics across all linked accounts.
**FRs covered:** FR24, FR25, FR26, FR27, FR28, FR29, FR35, FR36, FR37, FR38
**NFRs addressed:** NFR12 (merge preserves history), NFR15 (storage monitoring)

### Epic 4: Dashboard Experience
Viewers land on a polished dashboard with a KPI bar, cards view showing each member's tool usage breakdown, chart view with stacked bar comparisons, and a client-side toggle between views. Logged-in users see their own card highlighted.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR13
**NFRs addressed:** NFR5 (3s load), NFR6 (500ms toggle), NFR10 (staleness indicators)

### Epic 5: Gamification & Personal Progress
Users see a leaderboard podium with growth arrows in chart view, earn achievement badges, access an LLM-powered suggestion machine with streaming output, view their personal progress page with rank trajectory, badges, and podium proximity, and admins access a full-ranked member list for operational and executive reporting.
**FRs covered:** FR7, FR8, FR9, FR10, FR11, FR12, FR39, FR40
**NFRs addressed:** NFR5 (continued), NFR6 (continued)

---

## Epic 1: Project Foundation & User Access

Users can log in to a secured application with role-based access (admin vs. viewer). The application shell, navigation, design system, and database are in place.

### Story 1.1: Initialize Next.js Project with Core Dependencies

As a developer,
I want a properly initialized Next.js project with all core dependencies installed,
So that the team has a consistent, Architecture-aligned foundation to build upon.

**Acceptance Criteria:**

**Given** no existing project in the repository
**When** `npx create-next-app@latest ai-spend-dashboard --yes` is executed
**Then** a Next.js project is created with TypeScript (strict), Tailwind CSS, App Router, Turbopack, ESLint, and `@/*` import alias

**Given** the initialized project
**When** core dependencies are installed
**Then** the following packages are available: `drizzle-orm`, `@neondatabase/serverless`, `better-auth`, `zod`, `recharts`, and `drizzle-kit` (dev dependency)

**Given** the project
**When** `npx shadcn@latest init` is executed
**Then** shadcn/ui is configured and the `src/components/ui/` directory is created

**Given** the project root
**When** `.env.example` is created
**Then** it lists all required environment variable names: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CREDENTIAL_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`

**Given** the project
**When** the directory structure is reviewed
**Then** it contains: `src/app/`, `src/components/` (with feature subdirectories: dashboard, leaderboard, gamification, members, admin, layout, shared, ui), `src/lib/` (with db, adapters, utils subdirectories), `src/types/`

**Given** the project
**When** `npm run dev` is executed
**Then** the application starts successfully on localhost with no errors

### Story 1.2: Database Connection and Core Schema

As a developer,
I want a connected PostgreSQL database with the core auth and tenant tables,
So that authentication and multi-tenant data isolation can be built on a solid schema foundation.

**Acceptance Criteria:**

**Given** a valid `DATABASE_URL` in `.env.local` pointing to a Neon PostgreSQL instance
**When** the application initializes the database connection
**Then** `src/lib/db/index.ts` successfully connects via the `drizzle-orm/neon-http` adapter

**Given** the Drizzle schema in `src/lib/db/schema.ts`
**When** `npx drizzle-kit push` (or `generate` + `migrate`) is run
**Then** the `tenants` table is created with columns: `id` (UUID, PK), `name`, `slug`, `leaderboard_display_mode` (default `'named'`), `created_at`

**Given** the Drizzle schema
**When** migrations are applied
**Then** the `user` table is created with Better Auth default fields plus custom columns: `role` (`'admin'` | `'viewer'`, default `'viewer'`), `tenant_id` (FK to tenants, NOT NULL), `member_id` (FK, nullable)

**Given** the Drizzle schema
**When** migrations are applied
**Then** the `session` table is created with Better Auth required fields including `user_id` FK

**Given** any data table in the schema
**When** its columns are inspected
**Then** it includes a `tenant_id` column with a foreign key to `tenants` (NFR4, NFR13)

**Given** the Drizzle config at `drizzle.config.ts`
**When** it is reviewed
**Then** it points to `src/lib/db/schema.ts` and uses the `DATABASE_URL` environment variable

**Given** a fresh database
**When** the seed script is executed
**Then** a default tenant with name "AssetWorks" and slug "assetworks" is created
**And** a default admin user account is created linked to the AssetWorks tenant

### Story 1.3: Authentication System and Login Page

As a user,
I want to log in with my email and password,
So that I can securely access the dashboard with my assigned role.

**Acceptance Criteria:**

**Given** Better Auth configured in `src/lib/auth.ts`
**When** a user submits a valid email and password on the login page
**Then** they are authenticated and redirected to `/dashboard` (FR30)

**Given** a successful authentication
**When** the session is created
**Then** a signed JWT token with expiration is stored in an HTTP-only cookie (NFR2)
**And** the JWT payload contains user `id`, `email`, `role`, `tenant_id`, and `member_id`

**Given** an unauthenticated user
**When** they navigate to any route other than `/login`
**Then** they are redirected to `/login`

**Given** the login page at `/login`
**When** it renders
**Then** it displays a clean email and password form with a submit button

**Given** invalid credentials (wrong email or wrong password)
**When** login is attempted
**Then** a generic error message "Invalid email or password" is displayed without revealing whether the email exists in the system

**Given** the Better Auth catch-all route at `/api/auth/[...all]/route.ts`
**When** any auth-related request is received
**Then** Better Auth handles it (sign-in, sign-out, session validation)

**Given** an authenticated session
**When** the user clicks "Sign Out" in the navigation
**Then** the session is destroyed and the user is redirected to `/login` (FR34)

### Story 1.4: App Shell, Navigation, and Design System Foundation

As a user,
I want a consistent application layout with role-aware navigation,
So that I can navigate between dashboard sections intuitively and the visual design feels cohesive.

**Acceptance Criteria:**

**Given** an authenticated user
**When** they access any page
**Then** the page renders inside the AppShell layout with a NavBar and a content area constrained to max-width 1440px centered

**Given** a user with `role = 'viewer'`
**When** the NavBar renders
**Then** it shows links to: Dashboard and My Progress only

**Given** a user with `role = 'admin'`
**When** the NavBar renders
**Then** it shows links to: Dashboard, My Progress, and Admin section (Members, Vendor Config, Manual Entry, Users, Settings) (FR33 — UI level)

**Given** `src/app/globals.css`
**When** the application loads
**Then** CSS custom properties are defined for the dual-tone design system including at minimum: `--page-bg`, `--card-bg`, `--card-radius`, `--kpi-bar-bg`, `--card-border`, `--text-primary`, `--text-secondary`

**Given** warm mode (default, no `.cool-mode` class)
**When** any page renders
**Then** `--page-bg` resolves to `#EDEAE4` (warm cream) and other warm-mode tokens are active

**Given** a container with the `.cool-mode` class applied
**When** its children render
**Then** `--page-bg` resolves to `#F5F5F5` (neutral gray), `--kpi-bar-bg` resolves to flat slate `#334155`, and animations are disabled (`--animation-duration: 0ms`)

**Given** `src/app/globals.css`
**When** `@media (prefers-reduced-motion: reduce)` is evaluated
**Then** all animations and transitions are suppressed (`animation-duration: 0.01ms !important; transition-duration: 0.01ms !important`) for accessibility compliance

**Given** the `AppShell` layout component
**When** it renders
**Then** a visually-hidden skip-to-content link is the first focusable element, targeting the main content area (`#main-content`)

**Given** the root page at `/`
**When** an authenticated user visits it
**Then** they are redirected to `/dashboard`

### Story 1.5: Admin User Management and Role Enforcement

As an admin,
I want to create and manage user accounts with assigned roles,
So that I can control who accesses the dashboard and what permissions they have.

**Acceptance Criteria:**

**Given** an admin user navigating to `/admin/users`
**When** the page loads
**Then** it displays a table of all user accounts showing email, name, role, and creation date
**And** the page applies cool-mode design tokens (FR31)

**Given** the admin users page
**When** the admin clicks "Create User" and fills in email, name, password, and selects a role (viewer or admin)
**Then** a new user account is created via `POST /api/admin/users` with the specified role and the admin's `tenant_id` (FR31)

**Given** an existing user in the table
**When** the admin clicks "Edit" on that user
**Then** they can change the user's role between viewer and admin and save the update via `PUT /api/admin/users/[id]` (FR32)

**Given** the edit user form
**When** the admin clicks "Reset Password" and enters a new password
**Then** the user's password is updated with bcrypt hashing (FR32)

**Given** a `requireAdmin()` server-side utility in `src/lib/auth.ts`
**When** a user with `role = 'viewer'` attempts to access any `/api/admin/*` endpoint
**Then** the server returns a `403 Forbidden` response with `{ error: { code: 'UNAUTHORIZED', message: 'Admin access required' } }` (NFR3)

**Given** a user with `role = 'viewer'`
**When** they attempt to navigate to any `/admin/*` page directly via URL
**Then** they are redirected to `/dashboard` (NFR3, FR33)

**Given** API routes for user management
**When** any query is executed
**Then** it is scoped by the admin's `tenant_id` (NFR4)

---

## Epic 2: Vendor Integration & Data Sync

Admins can configure API credentials for each vendor, the system automatically fetches and normalizes usage data from Cursor/Claude/Copilot/Kiro, admins can manually enter Replit data, and data freshness is tracked per source.

### Story 2.1: Vendor Adapter Interface, Type System, and Data Tables

As a developer,
I want a standardized vendor adapter interface with the required database tables,
So that all vendor integrations follow a consistent pattern and data flows into a unified schema.

**Acceptance Criteria:**

**Given** `src/lib/adapters/types.ts`
**When** the type system is reviewed
**Then** it exports: `ApiVendor = 'cursor' | 'claude' | 'copilot' | 'kiro'`, `ScrapedVendor = 'replit'`, `VendorType = ApiVendor | ScrapedVendor`, `SourceType = 'api' | 'scraping' | 'manual'`, `Confidence = 'high' | 'medium' | 'low'`

**Given** `src/lib/adapters/types.ts`
**When** the `VendorAdapter` interface is reviewed
**Then** it defines: `vendor: ApiVendor`, `fetchUsageData(config: VendorConfig, dateRange: DateRange): Promise<UsageRecord[]>`, `testConnection(config: VendorConfig): Promise<boolean>`

**Given** the Drizzle schema
**When** migrations are applied
**Then** the `usage_records` table exists with columns: `id`, `tenant_id` (FK), `member_id` (FK, nullable), `vendor` (VendorType), `spend_cents` (integer), `tokens` (bigint, nullable), `period_start`, `period_end`, `confidence`, `source_type`, `synced_at`, `created_by` (nullable), `vendor_username`, `vendor_email`

**Given** the Drizzle schema
**When** migrations are applied
**Then** the `vendor_configs` table exists with columns: `id`, `tenant_id` (FK), `vendor` (ApiVendor), `encrypted_credentials`, `last_sync_at` (nullable), `last_sync_status` (nullable), `staleness_threshold_minutes` (default 360)

**Given** `src/lib/adapters/registry.ts`
**When** an adapter is requested by vendor name
**Then** it returns the corresponding `VendorAdapter` implementation (or undefined for non-API vendors) (NFR14)

**Given** `src/types/index.ts`
**When** shared types are reviewed
**Then** it exports the standard API response types: `ApiResponse<T> = { data: T, meta?: VendorSyncMeta }` and `ApiError = { error: { code: string, message: string } }`

### Story 2.2: Credential Encryption and Vendor Configuration Management

As an admin,
I want to securely store and manage API credentials for each vendor,
So that vendor API keys are encrypted at rest and I can configure integrations through the dashboard.

**Acceptance Criteria:**

**Given** `src/lib/encryption.ts` and a `CREDENTIAL_ENCRYPTION_KEY` environment variable
**When** `encrypt(plaintext)` is called
**Then** it returns an AES-256 encrypted string (NFR1)

**Given** an encrypted credential string
**When** `decrypt(ciphertext)` is called with the same `CREDENTIAL_ENCRYPTION_KEY`
**Then** it returns the original plaintext

**Given** an admin navigating to `/admin/vendor-config`
**When** the page loads
**Then** it displays a card for each API vendor (Cursor, Claude, Copilot, Kiro) showing configuration status and last sync info
**And** Replit is not shown (no API credentials needed — manual entry only)
**And** the page applies cool-mode design tokens

**Given** a vendor config card
**When** the admin enters API credentials and clicks "Save"
**Then** the credentials are encrypted via `encrypt()` before being stored in `vendor_configs` via `POST /api/vendor-config` (FR21, NFR1)

**Given** a saved vendor configuration
**When** the admin clicks "Test Connection"
**Then** the system calls `adapter.testConnection()` and displays success or failure (FR21)

**Given** the vendor config page
**When** a vendor has saved credentials
**Then** the credential fields display masked values (e.g., `••••••••last4`) — never the raw key

**Given** any vendor config API route
**When** a request is made
**Then** it enforces admin role and tenant_id scoping (NFR3, NFR4)

### Story 2.3: Cursor API Adapter

As a system,
I want to fetch usage and spend data from Cursor via REST API,
So that Cursor usage is automatically tracked for all team members.

**Acceptance Criteria:**

**Given** `src/lib/adapters/cursor.ts` implementing the `VendorAdapter` interface
**When** `fetchUsageData()` is called with valid Cursor API credentials and a date range
**Then** it returns an array of `UsageRecord` objects with `vendor = 'cursor'`, `source_type = 'api'`, `confidence = 'high'` (FR14, FR19)

**Given** valid Cursor API credentials
**When** `testConnection()` is called
**Then** it returns `true` if the API responds successfully within 30 seconds (NFR9)

**Given** invalid or expired Cursor API credentials
**When** `fetchUsageData()` is called
**Then** it throws a descriptive error that includes the vendor name and failure reason

**Given** the Cursor API response
**When** data is normalized
**Then** spend is converted to `spend_cents` (integer), tokens are extracted if available (nullable), and each record includes `vendor_username` and `vendor_email` for identity matching (FR19)

**Given** a network timeout exceeding 30 seconds
**When** the Cursor adapter is fetching data
**Then** the request is aborted and an `ADAPTER_TIMEOUT` error is thrown (NFR9)

### Story 2.4: Claude API Adapter

As a system,
I want to fetch usage and spend data from Claude via the Admin API,
So that Claude usage is automatically tracked for all team members.

**Acceptance Criteria:**

**Given** `src/lib/adapters/claude.ts` implementing the `VendorAdapter` interface
**When** `fetchUsageData()` is called with valid Claude Admin API credentials and a date range
**Then** it returns an array of `UsageRecord` objects with `vendor = 'claude'`, `source_type = 'api'`, `confidence = 'high'` (FR15, FR19)

**Given** the Claude Admin API's specific header requirements
**When** requests are made
**Then** the adapter includes all required headers per the Claude Admin API specification

**Given** valid Claude Admin API credentials
**When** `testConnection()` is called
**Then** it returns `true` if the API responds successfully within 30 seconds (NFR9)

**Given** the Claude API response
**When** data is normalized
**Then** spend is stored as `spend_cents`, tokens are extracted, and records include `vendor_email` for identity matching (FR19)

### Story 2.5: GitHub Copilot API Adapter

As a system,
I want to fetch usage and spend data from GitHub Copilot via REST API,
So that Copilot seat costs and usage are automatically tracked.

**Acceptance Criteria:**

**Given** `src/lib/adapters/copilot.ts` implementing the `VendorAdapter` interface
**When** `fetchUsageData()` is called with a valid GitHub PAT and date range
**Then** it returns an array of `UsageRecord` objects with `vendor = 'copilot'`, `source_type = 'api'`, `confidence = 'high'` (FR16, FR19)

**Given** the GitHub Copilot API
**When** seat assignment data is fetched
**Then** idle seats (assigned but zero usage) are represented as records with `spend_cents > 0` and `tokens = 0`

**Given** valid Copilot PAT with required scopes
**When** `testConnection()` is called
**Then** it returns `true` if the API responds successfully within 30 seconds (NFR9)

**Given** the Copilot API response
**When** data is normalized
**Then** spend includes per-seat cost attribution, and records include `vendor_username` for identity matching (FR19)

### Story 2.6: Kiro API Adapter

As a system,
I want to fetch usage and spend data from Kiro via API,
So that Kiro usage is tracked alongside the other four vendors.

**Acceptance Criteria:**

**Given** `src/lib/adapters/kiro.ts` implementing the `VendorAdapter` interface
**When** `fetchUsageData()` is called with valid Kiro API credentials and a date range
**Then** it returns an array of `UsageRecord` objects with `vendor = 'kiro'`, `source_type = 'api'`, `confidence = 'high'` (FR19)

**Given** valid Kiro API credentials
**When** `testConnection()` is called
**Then** it returns `true` if the API responds successfully within 30 seconds (NFR9)

**Given** the Kiro API response
**When** data is normalized
**Then** spend is stored as `spend_cents`, tokens extracted if available, and records include vendor identity fields for matching (FR19)

**Given** the adapter registry
**When** the Kiro adapter is registered
**Then** it is accessible via `registry.getAdapter('kiro')` without modifying core application code (NFR14)

### Story 2.7: Stale-While-Revalidate Sync Engine

As a system,
I want to automatically refresh vendor data when it becomes stale and allow admins to trigger manual syncs,
So that the dashboard always shows reasonably fresh data without blocking page loads.

**Acceptance Criteria:**

**Given** a dashboard page load
**When** the server checks `vendor_configs.last_sync_at` against `staleness_threshold_minutes` for each API vendor
**Then** stale vendors are identified (FR22)

**Given** one or more stale vendors detected on page load
**When** the stale-while-revalidate pattern triggers
**Then** a non-blocking `fetch()` to `/api/sync/trigger` fires for each stale vendor, and the current request serves existing cached data from the database

**Given** `POST /api/sync/trigger` with `{ vendor: 'cursor' }`
**When** the sync function executes
**Then** it decrypts the vendor's credentials, calls `adapter.fetchUsageData()`, upserts resulting records into `usage_records`, and updates `vendor_configs.last_sync_at` and `last_sync_status`

**Given** a vendor adapter failure during sync
**When** the error is caught
**Then** `vendor_configs.last_sync_status` is updated to the error message, `last_sync_at` is NOT updated, and cached data remains available (NFR7)

**Given** an admin on the vendor config page
**When** they click "Sync Now" for a specific vendor
**Then** `POST /api/sync/trigger` is called for that vendor, and the UI shows sync progress and result (FR23)

**Given** `GET /api/sync/status`
**When** called
**Then** it returns per-vendor sync status: `last_sync_at`, `last_sync_status`, `confidence`, `staleness_threshold_minutes` for all 5 vendors (NFR8, FR20)

**Given** a vendor adapter sync in progress
**When** the adapter exceeds the 30-second timeout
**Then** the sync is aborted and marked as failed without affecting other vendors (NFR9)

### Story 2.8: Manual Data Entry for Replit

As an admin,
I want to manually enter usage and spend data for Replit,
So that Replit costs are tracked even though Replit has no billing API.

**Acceptance Criteria:**

**Given** an admin navigating to `/admin/manual-entry`
**When** the page loads
**Then** it displays a form for entering usage data with fields: member (dropdown), vendor (defaulting to Replit), spend amount (dollars — converted to cents on save), tokens (optional), period start, period end
**And** the page applies cool-mode design tokens

**Given** a completed manual entry form
**When** the admin submits it via `POST /api/manual-entry`
**Then** a `usage_records` row is created with `source_type = 'manual'`, `confidence = 'medium'`, `created_by` set to the admin's user ID, and `synced_at` set to current timestamp (FR17, NFR11)

**Given** existing manual entries
**When** the admin views the manual entry page
**Then** a table of previous manual entries is displayed with member name, vendor, spend, tokens, period, entered by, and entry date

**Given** an existing manual entry in the table
**When** the admin clicks "Edit"
**Then** they can modify the spend, tokens, and period values and save via `PUT /api/manual-entry/[id]` (FR18)

**Given** an existing manual entry
**When** the admin clicks "Delete" and confirms
**Then** the record is removed via `DELETE /api/manual-entry/[id]` (FR18)

**Given** manual entry API routes
**When** any request is made
**Then** it enforces admin role and tenant_id scoping (NFR3, NFR4)

---

## Epic 3: Member Identity & Data Aggregation

Admins can create team member profiles, link identities across platforms, and the system aggregates per-member and team-level metrics across all linked accounts.

### Story 3.1: Member Profiles and Admin Members Page

As an admin,
I want to create and manage team member profiles,
So that each person on the team has a single identity in the dashboard.

**Acceptance Criteria:**

**Given** the Drizzle schema
**When** migrations are applied
**Then** the `members` table exists with columns: `id`, `tenant_id` (FK), `name`, `email` (nullable), `created_at`

**Given** the Drizzle schema
**When** migrations are applied
**Then** the `member_identities` table exists with columns: `id`, `member_id` (FK), `vendor` (VendorType), `vendor_username`, `vendor_email` (nullable), `created_at`

**Given** an admin navigating to `/admin/members`
**When** the page loads
**Then** it displays a table of all members showing name, email, linked vendor accounts count, and actions
**And** the page applies cool-mode design tokens

**Given** the admin members page
**When** the admin clicks "Add Member" and fills in name and email
**Then** a new member is created via `POST /api/members` with the admin's `tenant_id` (FR25)

**Given** an existing member
**When** the admin clicks "Edit" on that member
**Then** they can update the member's name and email via `PUT /api/members/[id]` (FR29)

**Given** member API routes
**When** any query is executed
**Then** it is scoped by `tenant_id` (NFR4)

### Story 3.2: Vendor Account Linking and Identity Management

As an admin,
I want to link vendor accounts (Cursor username, Claude email, etc.) to member profiles,
So that usage data from multiple platforms is correctly attributed to each person.

**Acceptance Criteria:**

**Given** a member's detail view on the admin members page
**When** the admin clicks "Link Account"
**Then** they can select a vendor, enter a vendor username and/or vendor email, and save the link via `POST /api/members/[id]` (FR28)

**Given** a member with multiple linked vendor accounts
**When** the admin views that member's detail
**Then** all linked accounts are displayed with vendor name, username, and email

**Given** a linked vendor account on a member
**When** the admin clicks "Unlink"
**Then** the `member_identities` row is removed, but the associated `usage_records` are preserved with `member_id` set to null (FR27, NFR12)

**Given** two separate member profiles that represent the same person
**When** the admin selects "Merge" and chooses the primary profile
**Then** all `member_identities` from the secondary profile are moved to the primary, all `usage_records` are re-linked to the primary `member_id`, and the secondary profile is deleted (FR26, NFR12)

**Given** a merge operation
**When** it completes
**Then** zero usage records or identity records are lost — all historical data is preserved under the primary member (NFR12)

### Story 3.3: Auto-Discovery of Member Accounts from Vendor Data

As an admin,
I want to see vendor accounts discovered from API sync data that aren't yet linked to any member,
So that I can quickly link or create members for newly discovered accounts.

**Acceptance Criteria:**

**Given** `usage_records` with `member_id = null` (unlinked records from vendor sync)
**When** the admin views the members page
**Then** an "Unlinked Accounts" section displays unique `vendor_username` / `vendor_email` combinations from unlinked records, grouped by vendor (FR24)

**Given** an unlinked vendor account in the discovery list
**When** the admin clicks "Link to Existing Member"
**Then** they can select an existing member from a dropdown, and a `member_identities` row is created linking the vendor account to that member
**And** all matching `usage_records` are updated with the member's `member_id`

**Given** an unlinked vendor account
**When** the admin clicks "Create New Member"
**Then** a new member profile is created with the vendor account's name/email pre-filled, and the vendor account is automatically linked

**Given** auto-discovery results
**When** displayed
**Then** accounts whose `vendor_email` exactly matches an existing member's email are flagged with a "Possible match" indicator (fuzzy/Levenshtein name matching deferred to Phase 2)

### Story 3.4: Per-Member Data Aggregation

As a system,
I want to aggregate spend and token usage per member across all linked vendor accounts,
So that the dashboard can display consolidated per-member metrics.

**Acceptance Criteria:**

**Given** `src/lib/db/queries/usage.ts`
**When** `getMemberAggregates(tenantId, periodStart, periodEnd)` is called
**Then** it returns an array of member objects, each containing: `memberId`, `memberName`, `totalSpendCents`, `totalTokens`, and a per-vendor breakdown with `{ vendor, spendCents, tokens, confidence, sourceType }` (FR35, FR36)

**Given** a member with linked accounts across multiple vendors
**When** their aggregate is computed for a period
**Then** `totalSpendCents` is the sum of all `usage_records.spend_cents` for that member in the period across all vendors

**Given** a member with Replit data (tokens = null)
**When** their aggregate is computed
**Then** `totalTokens` sums only non-null token values, and the Replit vendor breakdown shows `tokens: null` (not zero)

**Given** an aggregation query
**When** it executes
**Then** it is scoped by `tenant_id` and filters by the specified period range (NFR4)

**Given** a vendor with no usage records for a member in the period
**When** aggregation runs
**Then** that vendor appears in the per-vendor breakdown with `spendCents: 0` and `tokens: 0` (indicating an inactive vendor, not missing data)

### Story 3.5: Team-Level Aggregation and Period Queries

As a system,
I want to compute team-level totals and support period-based data queries,
So that KPIs and period-over-period comparisons are available for the dashboard.

**Acceptance Criteria:**

**Given** `src/lib/db/queries/usage.ts`
**When** `getTeamTotals(tenantId, periodStart, periodEnd)` is called
**Then** it returns: `totalSpendCents` (sum across all members), `totalTokens` (sum of non-null tokens), `activeMemberCount` (members with at least one usage record in period) (FR37)

**Given** `src/lib/db/queries/usage.ts`
**When** `getVendorSummaries(tenantId, periodStart, periodEnd)` is called
**Then** it returns per-vendor totals: `{ vendor, totalSpendCents, totalTokens, seatCount, lastSyncAt, lastSyncStatus, confidence }` for all 5 vendors

**Given** the `usage_records` table with timestamped records
**When** period-over-period comparison data is requested
**Then** the system computes current period vs. previous period aggregates on demand from raw `usage_records` — no materialized snapshots (FR38)

**Given** `src/lib/utils/date-ranges.ts`
**When** period helpers are used
**Then** they support generating period keys (e.g., `"2026-02"`), computing period start/end dates, determining previous period boundaries, and checking staleness against thresholds

**Given** `src/lib/utils/format-currency.ts`
**When** `formatCurrency(cents)` is called with `1428000`
**Then** it returns `"$14,280"` (no decimals, commas at thousands)

**Given** `src/lib/utils/format-tokens.ts`
**When** `formatTokens(39629164)` is called
**Then** it returns `"39.6M tok"`
**And** `formatTokens(286874)` returns `"287K tok"`
**And** `formatTokens(null)` returns `"~ tok"`

---

## Epic 4: Dashboard Experience

Viewers land on a polished dashboard with a KPI bar, cards view showing each member's tool usage breakdown, chart view with stacked bar comparisons, and a client-side toggle between views. Logged-in users see their own card highlighted.

### Story 4.1: Dashboard API Endpoint

As a system,
I want a single API endpoint that returns all aggregated dashboard data,
So that the dashboard page can render from one server-side data fetch.

**Acceptance Criteria:**

**Given** `GET /api/dashboard?period=2026-02`
**When** called by an authenticated user
**Then** it returns `{ data: { teamTotals, memberCards, vendorSummaries }, meta: { vendors: { cursor: {...}, claude: {...}, copilot: {...}, replit: {...}, kiro: {...} } } }`

**Given** the dashboard API response `data.teamTotals`
**When** examined
**Then** it contains: `totalSpendCents`, `totalTokens`, `activeMemberCount` for the requested period

**Given** the dashboard API response `data.memberCards`
**When** examined
**Then** it is an array of member objects sorted by `totalSpendCents` descending, each containing: `memberId`, `memberName`, `totalSpendCents`, `totalTokens`, per-vendor breakdown, `earnedBadges` (empty array initially), `suggestionSnippet` (null initially)

**Given** the dashboard API response `meta.vendors`
**When** examined
**Then** each vendor entry includes: `syncedAt`, `confidence`, `status`, `spendCents`, `tokens`, `seats`

**Given** the dashboard page (`src/app/dashboard/page.tsx`) as a React Server Component
**When** it renders
**Then** it fetches dashboard data server-side via Drizzle queries (not client-side fetch) and passes data as props to client components (NFR5)

**Given** a stale vendor detected during the server-side data fetch
**When** the dashboard page renders
**Then** a non-blocking background refresh is triggered for the stale vendor(s) while serving cached data immediately

### Story 4.2: KPI Bar with Hero Metrics and Vendor Summary Cards

As a viewer,
I want to see top-line KPIs and per-vendor summaries at the top of the dashboard,
So that I can instantly understand total team spend, token usage, and per-vendor health at a glance.

**Acceptance Criteria:**

**Given** the KPI bar component (`src/components/dashboard/KpiBar.tsx`)
**When** it renders
**Then** it displays as a full-width dark gradient strip (`#1a1a2e` → `#6C63FF`) spanning the viewport (no max-width constraint) (FR4)
**And** the KPI bar uses `position: sticky; top: 0; z-index: 40` so it remains visible when the user scrolls the page content

**Given** the KPI bar's left section (hero metrics cluster)
**When** displayed
**Then** it shows: Total Spend (formatted with `formatCurrency`), Total Tokens (formatted with `formatTokens`), Active Members count — in bold white text

**Given** the KPI bar's center section
**When** displayed
**Then** it shows one `VendorCard` per vendor (Cursor, Claude, Copilot, Replit, Kiro) with: vendor name, freshness dot (colored by threshold), total spend, total tokens, seat count (FR6)

**Given** a `VendorCard` component (`src/components/dashboard/VendorCard.tsx`)
**When** the vendor's `lastSyncAt` is less than 6 hours ago
**Then** the freshness dot is green (Fresh)

**Given** a vendor's `lastSyncAt` is between 6–24 hours ago
**When** the VendorCard renders
**Then** the freshness dot is amber (Stale)

**Given** a vendor's `lastSyncAt` is more than 24 hours ago
**When** the VendorCard renders
**Then** the freshness dot is red (Old)

**Given** a vendor with `source_type = 'manual'` (Replit)
**When** the VendorCard renders
**Then** the freshness dot is gray with "Manual" label and shows days since last entry

**Given** the KPI bar's right section
**When** displayed
**Then** it shows a period selector dropdown (Feb 2026, Jan 2026, etc.) that updates the dashboard data when changed

### Story 4.3: Cards View with Member Cards and Tool Pills

As a viewer,
I want to see a grid of member cards showing each person's AI tool usage breakdown,
So that I can scan team-wide adoption patterns and see which tools each teammate uses.

**Acceptance Criteria:**

**Given** the `CardsView` component (`src/components/dashboard/CardsView.tsx`)
**When** it renders
**Then** it displays a CSS Grid of `MemberCard` components using `auto-fill` with `minmax(240px, 1fr)` — responsive without breakpoints (FR1)

**Given** a `MemberCard` component (`src/components/dashboard/MemberCard.tsx`)
**When** it renders for a member
**Then** it displays: member name, total spend (formatted), and a grid of `ToolPill` components for each vendor the member has data for (FR5, FR13)

**Given** a `ToolPill` component (`src/components/dashboard/ToolPill.tsx`)
**When** it renders for a vendor
**Then** it shows: vendor name, spend (formatted), tokens (formatted), with the vendor's brand-colored border from `VENDOR_COLORS` constant in `src/lib/vendor-colors.ts`

**Given** `src/lib/vendor-colors.ts`
**When** imported
**Then** it exports the `VENDOR_COLORS` constant with `primary`, `bg`, `text`, `border` values for all 5 vendors (cursor, claude, copilot, replit, kiro)

**Given** a member with no usage for a specific vendor
**When** the ToolPill for that vendor renders
**Then** it appears dimmed/muted (not hidden) to show the vendor exists but is inactive

**Given** the cards view
**When** it renders
**Then** member cards do NOT display rank numbers or growth arrows (those belong on chart view podium and /my-progress only)

**Given** the cards view
**When** it renders
**Then** warm-mode design tokens are active (no `.cool-mode` class)

### Story 4.4: Chart View with Stacked Bar Comparison

As a viewer,
I want to see a stacked bar chart comparing spend across all team members by tool,
So that I can visually compare relative spend and tool mix across the team for budget conversations.

**Acceptance Criteria:**

**Given** the `SpendChart` component (`src/components/dashboard/SpendChart.tsx`) using Recharts
**When** it renders
**Then** it displays horizontal stacked bar chart with one bar per member, segments colored by vendor using `VENDOR_COLORS` (FR2)

**Given** the chart
**When** bars are rendered
**Then** they are sorted by total spend descending (highest spender at top)

**Given** the chart
**When** a user hovers over a bar segment
**Then** a tooltip shows: vendor name, spend amount (formatted), and token count

**Given** the chart
**When** it renders
**Then** a legend is displayed mapping each vendor color to its name, using `VENDOR_COLORS`

**Given** the chart view container
**When** it renders
**Then** `.cool-mode` class is applied — neutral gray background, flat slate KPI bar, animations disabled

**Given** the chart
**When** rendered on a screen width of 1024px–2560px
**Then** all member bars are visible and legible without horizontal scrolling

### Story 4.5: View Toggle and Dashboard Page Assembly

As a viewer,
I want to toggle between cards view and chart view on the dashboard,
So that I can switch between the daily-driver view and the presentation-ready view instantly.

**Acceptance Criteria:**

**Given** the `ViewToggle` component (`src/components/dashboard/ViewToggle.tsx`) using shadcn/ui `Tabs`
**When** it renders
**Then** it shows two tabs: "Cards" (default active) and "Chart" (FR3)

**Given** the "Cards" tab is active
**When** the user clicks "Chart"
**Then** the view switches to `SpendChart` within 500ms with no loading spinner (client-side toggle, no API call) (NFR6)
**And** `.cool-mode` class is applied to the view container

**Given** the "Chart" tab is active
**When** the user clicks "Cards"
**Then** the view switches to `CardsView` within 500ms (NFR6)
**And** `.cool-mode` class is removed from the view container

**Given** the dashboard page (`/dashboard`)
**When** a logged-in user with a linked `member_id` views cards view
**Then** their member card is visually highlighted with warm tint background, amber border, and subtle outer glow

**Given** the dashboard page
**When** a logged-in user's card renders
**Then** it includes a suggestion snippet area (showing truncated teaser text if a cached suggestion exists, or a "Generate your [Month] insight" CTA linking to `/my-progress`)

**Given** the complete dashboard page
**When** it renders
**Then** the layout is: KPI bar (full-width, top), ViewToggle below KPI bar, then either CardsView or SpendChart in the content area (max-width 1440px, centered)

**Given** the period selector in the KPI bar
**When** the user selects a different period (e.g., Jan 2026)
**Then** the dashboard re-fetches data for the selected period, the URL does not change, and a skeleton transition is shown during loading

---

## Epic 5: Gamification & Personal Progress

Users see a leaderboard podium with growth arrows in chart view, earn achievement badges, access an LLM-powered suggestion machine with streaming output, and view their personal progress page with rank trajectory, badges, and podium proximity.

### Story 5.1: Leaderboard Rankings and Admin Settings

As a system,
I want to compute leaderboard rankings with period-over-period position changes and provide admin controls for display settings,
So that the leaderboard reflects current standings and admins can configure how identities are shown.

**Acceptance Criteria:**

**Given** `src/lib/db/queries/usage.ts`
**When** `getLeaderboardRankings(tenantId, currentPeriod)` is called
**Then** it returns members ranked by `totalSpendCents` descending, each with: `rank`, `memberId`, `memberName`, `totalSpendCents`, `previousRank` (from prior period), `rankChange` (positive = climbed, 0 = steady, null = new) (FR39)

**Given** a member who was ranked #7 last period and is now #4
**When** their leaderboard entry is computed
**Then** `rankChange` is `+3` (positive integer indicating climbing)

**Given** a member with no data in the previous period
**When** their leaderboard entry is computed
**Then** `previousRank` is `null` and `rankChange` is `null` (new entrant, no arrow)

**Given** an admin navigating to `/admin/settings`
**When** the page loads
**Then** it shows the "Leaderboard Display Mode" setting with options: Named, Initialed, Anonymous
**And** the page applies cool-mode design tokens

**Given** the admin settings page
**When** the admin changes leaderboard display mode and saves
**Then** `tenants.leaderboard_display_mode` is updated via `PUT /api/admin/settings`

**Given** leaderboard ranking queries
**When** executed
**Then** they are scoped by `tenant_id` (NFR4)

### Story 5.2: Leaderboard Podium Display in Chart View

As a viewer,
I want to see a leaderboard podium celebrating the top spenders in chart view,
So that top AI adopters are recognized and I know who's leading the team.

**Acceptance Criteria:**

**Given** the `LeaderboardPodium` component (`src/components/leaderboard/LeaderboardPodium.tsx`)
**When** it renders in chart view
**Then** it displays the top 5–8 members with gold (#FFD700), silver (#C0C0C0), bronze (#CD7F32) treatment for positions 1, 2, 3 (FR7)

**Given** the `GrowthArrow` component (`src/components/leaderboard/GrowthArrow.tsx`)
**When** a member has `rankChange > 0` (climbed)
**Then** a green up-arrow (▲) is displayed next to their entry (FR8)

**Given** a member with `rankChange === 0` (steady) or `rankChange === null` (new)
**When** the GrowthArrow renders
**Then** a gray dash (—) is shown — never a red or down arrow (FR8)

**Given** the tenant's `leaderboard_display_mode` is `'named'`
**When** the podium renders
**Then** full member names are shown (e.g., "Dana Martinez")

**Given** `leaderboard_display_mode` is `'initialed'`
**When** the podium renders
**Then** only initials are shown (e.g., "D.M.")

**Given** `leaderboard_display_mode` is `'anonymous'`
**When** the podium renders
**Then** entries show rank and stats only (e.g., "#1 — $2,400 across 4 tools")

**Given** the leaderboard podium is in chart view
**When** it renders
**Then** cool-mode design tokens are active (consistent with chart view)

### Story 5.3: Achievement Badge System

As a system,
I want to award achievement badges to members based on their usage data,
So that AI adoption milestones are celebrated and visible.

**Acceptance Criteria:**

**Given** the Drizzle schema
**When** migrations are applied
**Then** the `badges` table exists with columns: `id`, `member_id` (FK), `tenant_id` (FK), `badge_type`, `earned_at`

**Given** badge definitions in the codebase
**When** reviewed
**Then** 5 badge types are defined: `AI Pioneer` (first session with any AI tool), `Token Titan` (exceeds token threshold), `Big Spender` (exceeds spend threshold), `Multi-Tool Master` (usage across 3+ vendors), `Early Adopter` (among first N users with data) (FR9)

**Given** `src/lib/db/queries/usage.ts`
**When** `computeBadgeEligibility(tenantId, memberId)` is called
**Then** it evaluates the member against all badge criteria and returns newly eligible badges not yet awarded (FR40)

**Given** a member becomes eligible for a badge
**When** badge computation runs
**Then** a new row is inserted into the `badges` table with the member's ID, badge type, and current timestamp (FR9)

**Given** a member who already has a badge
**When** badge computation runs again
**Then** the existing badge is not duplicated

**Given** the `BadgeCard` component (`src/components/gamification/BadgeCard.tsx`)
**When** it renders
**Then** it displays the badge icon/name with a visually distinct design per badge type

**Given** a member card in cards view
**When** the member has earned badges
**Then** small badge indicators are visible on their card (FR10)

### Story 5.4: Suggestion Machine with LLM Streaming

As a user,
I want to generate a personalized, fun AI-generated suggestion based on my usage data,
So that I get a delightful, screenshottable moment that makes the dashboard worth sharing.

**Acceptance Criteria:**

**Given** the Drizzle schema
**When** migrations are applied
**Then** the `suggestions` table exists with columns: `id`, `member_id` (FK), `tenant_id` (FK), `period_key` (string, e.g., "2026-02"), `content` (text), `generated_at`

**Given** `GET /api/suggestions?memberId=X&period=2026-02`
**When** a cached suggestion exists for that member and period
**Then** it returns the stored suggestion content instantly (no LLM call) (FR12)

**Given** `POST /api/suggestions` with `{ memberId, period }`
**When** no cached suggestion exists
**Then** the server fetches the member's aggregated metrics, constructs a prompt, calls the Anthropic API with streaming enabled, and returns a `ReadableStream` response (FR11)

**Given** the streaming response
**When** the client receives it
**Then** the `SuggestionMachine` component (`src/components/gamification/SuggestionMachine.tsx`) renders an animated "thinking" state that cycles through the copy sequence "Consulting the oracle...", "Crunching vibes...", "Almost there..." at 2-second intervals, followed by token-by-token text reveal once the stream begins

**Given** the stream completes
**When** the full suggestion text is assembled
**Then** it is stored in the `suggestions` table for the member and period (cached for subsequent visits)

**Given** a cached suggestion on the member card in cards view
**When** the `SuggestionSnippet` component renders
**Then** it shows the first line truncated as a teaser with a CTA linking to `/my-progress` for the full experience

**Given** the full suggestion display (on `/my-progress`)
**When** rendered
**Then** it appears as a visually branded output card — bounded, styled, and screenshottable

**Given** a user viewing their cached suggestion
**When** they click "Regenerate"
**Then** `DELETE /api/suggestions/[id]` clears the cache, then `POST /api/suggestions` streams a fresh suggestion and overwrites the cache

**Given** suggestion API routes
**When** accessed
**Then** they are scoped by `tenant_id` and only allow users to generate suggestions for their own linked `member_id` (NFR4)

### Story 5.5: My Progress Page

As a user,
I want a dedicated personal progress page showing my rank, badges, suggestion, and podium proximity,
So that I can see my AI adoption story and track my growth over time.

**Acceptance Criteria:**

**Given** an authenticated user with a linked `member_id` navigating to `/my-progress`
**When** the page loads
**Then** it displays their personal dashboard with: current rank, rank trajectory, earned badges, suggestion machine, and podium proximity bar

**Given** the rank section
**When** displayed
**Then** it shows: current rank (e.g., "#4 of 29"), previous rank, and rank change with growth arrow (green ▲ if climbed, gray — if steady)

**Given** the `PodiumProximityBar` component (`src/components/leaderboard/PodiumProximityBar.tsx`)
**When** the user is not in the top 8
**Then** it shows a progress indicator: "3 spots from the top 8" with a visual bar

**Given** the user is already in the top 8
**When** the PodiumProximityBar renders
**Then** it shows a celebratory state: "You're on the podium!" with their podium position

**Given** the badges section
**When** displayed
**Then** it shows all earned badges with `BadgeCard` components, and unearned badges appear grayed out with the criteria needed to earn them

**Given** the suggestion machine section
**When** a cached suggestion exists for the current period
**Then** it displays the full suggestion in a branded output card with "Your [Month] insight" heading

**Given** the suggestion machine section
**When** no cached suggestion exists
**Then** it displays a CTA: "Generate your [Month] insight" that triggers the streaming generation flow

**Given** an authenticated user WITHOUT a linked `member_id`
**When** they navigate to `/my-progress`
**Then** an invitation-framed empty state is displayed: "Link your account to a team member to see your progress" with a link to ask their admin

**Given** the My Progress page
**When** it renders
**Then** warm-mode design tokens are active (this is a personal, celebratory page)

### Story 5.6: Admin Full-View Leaderboard

As an admin,
I want to see a complete ranked list of all team members with full spend and usage details,
So that I can answer VP questions with exact data and identify operational patterns (idle seats, low adoption) without gamification chrome.

**Acceptance Criteria:**

**Given** an admin navigating to `/admin/leaderboard`
**When** the page loads
**Then** it displays a table of all members ranked by `totalSpendCents` descending, showing: rank, full name, total spend (formatted), total tokens (formatted), per-vendor spend breakdown, badge count, and rank change from previous period

**Given** the admin leaderboard table
**When** rendered
**Then** all members are shown with full names regardless of the tenant's `leaderboard_display_mode` setting (this is the admin operational view — no anonymity applied)

**Given** the admin leaderboard
**When** a member has zero usage across all vendors for the current period
**Then** they appear at the bottom of the list with $0 spend and a visual "inactive" indicator

**Given** the admin leaderboard
**When** viewed at viewport widths 1024px–2560px
**Then** the table is fully legible without horizontal scrolling, with per-vendor columns collapsing to a summary at narrow widths

**Given** a user with `role = 'viewer'`
**When** they attempt to access `/admin/leaderboard`
**Then** they are redirected to `/dashboard` (NFR3)

**Given** the admin leaderboard page
**When** it renders
**Then** cool-mode design tokens are active (consistent with other admin pages)

**Given** the admin leaderboard data
**When** queried
**Then** it reuses `getLeaderboardRankings()` from Story 5.1 and is scoped by `tenant_id` (NFR4)
