---
stepsCompleted: ["step-01-init", "step-01b-continue", "step-02-discovery", "step-02b-vision", "step-02c-executive-summary", "step-03-success", "step-04-journeys", "step-05-domain", "step-06-innovation", "step-07-project-type", "step-08-scoping", "step-09-functional", "step-10-nonfunctional", "step-11-polish"]
inputDocuments: ["HANDOFF.md"]
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 0
date: 2026-02-25
projectName: ai-spend-dashboard
classification:
  projectType: saas_b2b
  projectTypeLabel: "SaaS B2B (Web Dashboard)"
  domain: "Developer Tools / Engineering Ops"
  complexity: medium
  projectContext: greenfield
---

# Product Requirements Document - AI Spend Dashboard

**Author:** Benjamin Smith
**Date:** 2026-02-25
**Project:** AI Spend Dashboard
**Status:** PRD Complete — Ready for Architecture

## Document Purpose

Complete product specification for the AI Spend Dashboard. Source context: HANDOFF.md (API research, UI mockups, team overview, pricing structures).

## Executive Summary

AI Spend Dashboard is a gamified web dashboard that consolidates AI tool spending across an extensible set of vendor integrations for engineering teams. It reframes AI spend from a cost to control into an adoption metric to celebrate — every token burned represents human time redeemed. Built for the AssetWorks team (~29 members), it aggregates per-member usage and spend data into a single view with leaderboards, achievement badges, and an LLM-powered suggestion machine that turns raw usage data into shareable, delightful moments ("With the time you saved, you could parasail from Uzbekistan to Norway!").

**Launch integrations:** Cursor, Claude, GitHub Copilot, and Replit. The vendor integration layer is designed as an adapter pattern so new providers (Lovable, Gemini, Windsurf, etc.) can be added by developers without restructuring the core application.

Target users are individual engineers (who see their own stats, discover peer tool usage, and climb leaderboards) and engineering leads (who track team-wide adoption trajectories). The dashboard exists because engineers *want* to open it — not because finance requires it.

### What Makes This Special

**Adoption acceleration, not cost control.** While conventional spend dashboards optimize for reduction, this product celebrates growth. Token burn is the new lines-of-code metric — a proxy for how aggressively a team leverages AI as a force multiplier.

**Gamification that only goes up.** Leaderboards show green arrows for climbers; no one falls in rank. Badges reward first steps ("First Claude session!") as much as milestones ("100K tokens"). Growth-based recognition celebrates adoption at every level.

**Tool discovery engine.** Peer usage data surfaces which tools teammates in similar roles use and for what — turning a spend tracker into an onboarding and adoption accelerator.

**LLM suggestion machine.** Converts usage metrics into fun, shareable, occasionally practical suggestions. Organic Slack screenshots become the product's viral loop.

**Data trust as P0.** Per-source confidence indicators, sync timestamps, and transparent reliability ratings ("API: reliable" vs "scraping: best effort") ensure numbers are trusted from day one.

## Project Classification

- **Type:** SaaS B2B (Web Dashboard) — single-tenant for AssetWorks at launch, multi-tenant architected at the DB layer (`tenant_id`) for future expansion
- **Domain:** Developer Tools / Engineering Operations — AI adoption intelligence for engineering teams
- **Complexity:** Medium — extensible vendor integration layer with heterogeneous auth models/data shapes per provider, cross-platform member identity resolution, and multi-tenant data modeling
- **Context:** Greenfield — new product, no existing codebase

## Success Criteria

### User Success

- Engineers see consolidated AI spend and usage across all integrated tools in a single dashboard
- Member cards display per-tool breakdown with spend, tokens, and usage indicators
- Leaderboard creates a "check it out" moment worth screenshotting to Slack
- New team members discover which AI tools their peers use

### Business Success

- AssetWorks has a single source of truth for AI tool spending across the team
- Data flows automatically from vendor APIs (manual entry fallback for vendors without APIs)
- Dashboard is live and usable within the first development sprint

### Technical Success

- Vendor adapter pattern supports adding new providers without core refactoring
- Data sync runs reliably with per-source confidence indicators and staleness detection
- DB schema includes `tenant_id` for future multi-tenant expansion
- NextAuth.js with email/password and admin/viewer roles protects the dashboard

### Measurable Outcomes

- All ~29 AssetWorks team members represented in the dashboard
- At least 3 vendor integrations delivering live data at launch (Cursor, Claude, Copilot)
- Member identity linking functional: at least 80% of team members have linked identities across 2+ platforms

## Product Scope

### MVP Strategy

**Approach:** Experience MVP — ship a complete, delightful experience for one team (AssetWorks) rather than a feature-thin product for many teams. The celebration framing and gamification are the product, not nice-to-haves — they ship in v1.

**Resource Requirements:** Solo developer (AI-assisted), leveraging Next.js + Vercel for rapid deployment. Free-tier infrastructure only.

**Core User Journeys Supported:** All four (Dana, Nora, Mike, Ben)

### MVP Feature Set (Phase 1)

- Dashboard: cards view + chart view with top-line KPIs (per HANDOFF.md mockups)
- Leaderboard: growth-only arrows (green up, no down), ranked by spend
- Member cards: per-tool quadrant breakdown (spend, tokens, usage indicators)
- Achievement badges: static set (AI Pioneer, Token Titan, Big Spender, Multi-Tool Master, Early Adopter)
- LLM suggestion machine: fun/practical "with the time you saved, you could..." per-member content (screenshottable; share buttons deferred)
- Vendor adapters: Cursor (API), Claude (Admin API), GitHub Copilot (API), Replit (manual entry)
- Member management: CRUD page for linking identities across platforms
- Data confidence: per-source sync status and staleness indicators
- Auth: NextAuth.js with email/password, admin + viewer roles, admin-provisioned accounts
- Deploy: Vercel free tier + external free-tier DB

### Phase 2 (Growth)

- Share buttons for suggestion machine output (Slack, clipboard)
- Peer tool discovery ("3 people in your role use Cursor for refactoring")
- Usage statistics page with time-range charts
- Slack notifications / weekly digest
- Additional vendor adapters (Lovable, Gemini, Windsurf, etc.)
- Email-based password reset flow

### Phase 3 (Expansion)

- Multi-tenant onboarding for external teams
- Backlog-aware suggestions (JIRA/project management integration)
- Role-relative benchmarking
- Adoption trajectory analytics
- Tenant management UI and billing (if SaaS demand materializes)

### Risk Mitigation Strategy

**Technical Risks:**
- *Data accuracy/trust (P0)*: Mitigated by per-source confidence indicators, sync timestamps, and transparent "API vs. scraping vs. manual" labeling
- *Vendor API changes*: Adapter pattern isolates breakage to single provider; manual entry fallback always available
- *Member identity matching*: Simple CRUD approach — no complex auto-matching that could silently merge wrong people

**Market Risks:**
- *Celebration framing doesn't resonate*: Underlying data aggregation remains valuable as standard spend tracker. Gamification is additive, not structural.
- *Suggestion machine outputs aren't useful/funny*: Feature can be hidden without structural impact
- *No demand beyond AssetWorks*: Product is useful for one team regardless. Multi-tenant is a DB schema decision, not a feature investment.

**Resource Risks:**
- *Solo developer scope*: AI-assisted development, free-tier infra, no external services for MVP. If time-constrained, suggestion machine can launch with simpler prompts; adapter count can reduce to 2-3.

## User Journeys

### Journey 1: Dana the Engineer — "Where Do I Rank?"

Dana hears about the AI Spend Dashboard in the team Slack channel. She logs in with her email and password and lands on the cards view. Immediately she sees the top-line KPIs — total team spend, total tokens, active members — and then the leaderboard ranked by spend. She spots herself at #4 with a green up-arrow from last period. Her card shows a 4-quadrant tool breakdown: heavy Cursor usage, moderate Claude, a Copilot seat she barely touches, no Replit. Below her stats, the suggestion machine says: "With 14 hours of AI-assisted work this month, you could have hand-knitted a scarf for every member of a mid-sized jazz ensemble." She screenshots it to Slack. She toggles to chart view to see the stacked bar comparison across the team, then closes the tab satisfied.

**Capabilities revealed:** Dashboard cards view, chart view, leaderboard ranking with growth arrows, per-tool quadrant breakdown, suggestion machine display, top-line KPIs, password auth.

### Journey 2: Nora the New Hire — "Wait, We Have Four AI Tools?"

Nora joined AssetWorks two weeks ago. Her manager mentions the dashboard in her first 1:1. She logs in and sees herself near the bottom of the leaderboard — but with no down-arrow, just a neutral position. Her card shows only GitHub Copilot (auto-provisioned by IT). She notices her peers' cards have Cursor and Claude quadrants lit up. She asks her team lead about getting access. Next month, her card shows Cursor activity appearing and a green up-arrow. She's earned her first badge: "AI Pioneer."

**Capabilities revealed:** Badge award system, growth-only leaderboard (no negative indicators), peer tool visibility on cards, new member onboarding path through observation.

### Journey 3: Mike the Engineering Lead — "What Are We Spending?"

Mike's VP asks "what's our AI tooling bill this month?" Mike opens the dashboard, glances at the Total Team Spend KPI, and has his answer in 3 seconds. He scrolls through the cards to see which team members are actively using their seats versus sitting idle. He notices 5 people have Copilot seats but zero usage — that's $95/month wasted. He also sees the team's overall token volume trending up via the chart view, confirming adoption is growing. He takes a screenshot of the top-line KPIs and the chart for his next budget conversation.

**Capabilities revealed:** Top-line KPIs as instant answers, idle seat detection (zero usage visible on cards), chart view for trend visualization, per-member spend attribution including seat costs.

### Journey 4: Ben the Dashboard Admin — "Keeping the Lights On"

Ben sets up the dashboard initially: enters API keys for Cursor, Claude, and Copilot in the config; marks Replit as manual-entry. He opens the member management page and sees auto-discovered accounts from API data — but "Ben Smith" appears as three separate entries (bsmith@assetworks.com from Claude, benjamin-smith from Cursor, bsmith from Copilot). He merges them into one member identity with a few clicks. He adds Replit usernames manually for team members who use it. He spots a data confidence indicator showing Cursor's last sync was 2 hours ago (green) while Replit shows "manual entry, last updated 5 days ago" (amber). He updates the Replit spend figure for the month.

**Capabilities revealed:** API key configuration, member management CRUD (merge/link identities across platforms), auto-discovery from API data, manual data entry for unsupported vendors, data confidence/staleness indicators, per-source sync status.

### Journey Requirements Summary

| Capability Area | Journeys |
|---|---|
| Dashboard cards view with per-tool quadrants | Dana, Nora, Mike |
| Chart view (stacked bar comparison) | Dana, Mike |
| Leaderboard with growth-only arrows | Dana, Nora |
| Achievement badges | Nora |
| LLM suggestion machine | Dana |
| Top-line KPIs | Dana, Mike |
| Email/password auth | Dana |
| Member management CRUD | Ben |
| API key configuration | Ben |
| Auto-discovery + manual identity linking | Ben |
| Data confidence indicators | Ben, Mike |
| Manual data entry (Replit fallback) | Ben |

## Innovation & Novel Patterns

### Detected Innovation Areas

**Spend-as-celebration paradigm.** The product inverts the conventional spend dashboard model. Instead of cost optimization, it frames AI tool spend as an adoption success metric. No known competitor takes this approach.

**LLM-generated contextual content.** The suggestion machine uses AI to convert raw usage metrics into personalized, humorous, shareable content. This transforms a data display into an engagement tool — a pattern not seen in B2B analytics dashboards.

**Positive-only gamification.** The growth-only leaderboard (green arrows for climbers, no negative indicators) is a deliberate design choice that removes the anxiety common in ranked systems while preserving competitive motivation.

### Validation Approach

- MVP launch with AssetWorks team validates whether the celebration framing drives engagement vs. a standard cost dashboard
- Suggestion machine quality validated through Slack screenshot frequency (organic sharing = content resonates)
- Leaderboard sentiment validated through team feedback within first month

## SaaS B2B Specific Requirements

### Project-Type Overview

Internal-first SaaS web dashboard with future multi-tenant aspiration. Primary deployment is single-tenant for AssetWorks (~29 members). Architecture supports multi-tenancy at the data layer without building tenant management UI.

### Authentication & Authorization

- **Auth framework:** NextAuth.js (Auth.js) with Credentials provider
- **User accounts:** Email + password, bcrypt salt/hash
- **Roles:** `viewer` (dashboard access) and `admin` (member management, API keys, manual data entry)
- **Account creation:** Admin-provisioned (no self-registration)
- **Password reset:** Manual by admin for MVP; email reset flow deferred to Growth phase
- **Sessions:** JWT in cookies, serverless-compatible

### Tenant Model

- `tenant_id` column on all data tables from day one
- Single tenant provisioned at deploy time (AssetWorks)
- No tenant switching UI, onboarding, or billing for MVP
- Data isolation enforced at query level for future-proofing

### Integration Architecture

- Vendor adapter pattern: standardized interface per provider
- Launch adapters: Cursor (REST API, Basic Auth), Claude (Admin API, API key), GitHub Copilot (REST API, PAT), Replit (manual entry)
- Each adapter normalizes to common data shape: member identity, spend, tokens, usage period, confidence level
- New adapters added by implementing the interface — no core changes required

### Deployment & Infrastructure

- **Hosting:** Vercel Hobby (free tier), serverless functions for API routes
- **Database:** External free-tier DB (Supabase, Turso, or Neon — decision deferred to architecture)
- **No additional services for MVP** — email service added in Growth phase for password resets

## Functional Requirements

### Dashboard & Visualization

- FR1: Viewers can see a cards view displaying individual member cards with per-tool usage breakdown
- FR2: Viewers can see a chart view displaying stacked bar comparison of spend and usage across team members
- FR3: Viewers can toggle between cards view and chart view
- FR4: Viewers can see top-line KPIs (Total Team Spend, Total Tokens, Active Members) on the dashboard
- FR5: Viewers can see per-tool quadrant breakdown on each member card (spend, tokens, usage indicators per vendor)
- FR6: Viewers can see data confidence indicators showing sync status and staleness per data source

### Gamification & Engagement

- FR7: Viewers can see a leaderboard ranking members by spend
- FR8: Viewers can see growth-only directional indicators (green up-arrows for climbers, no negative indicators)
- FR9: The system can award achievement badges to members based on developer-defined threshold criteria (static set: AI Pioneer, Token Titan, Big Spender, Multi-Tool Master, Early Adopter)
- FR10: Viewers can see earned badges displayed on member cards
- FR11: The system can generate personalized suggestions by sending member usage metrics to an LLM
- FR12: Viewers can see LLM-generated suggestion machine content per member ("with the time you saved, you could...")
- FR13: Viewers can see peer tool usage patterns on member cards (which tools each teammate uses)

### Vendor Data Integration

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

### Member Identity Management

- FR24: Admins can view auto-discovered member accounts from vendor API data
- FR25: Admins can create new member identities
- FR26: Admins can link or merge multiple vendor accounts into a single member identity
- FR27: Admins can unlink vendor accounts from a member identity
- FR28: Admins can manually add vendor usernames and emails for team members
- FR29: Admins can edit member details (name, linked accounts)

### Authentication & Access Control

- FR30: Users can authenticate with email and password
- FR31: Admins can create new user accounts with assigned roles (viewer or admin)
- FR32: Admins can manage user accounts (edit roles, reset passwords)
- FR33: The system can enforce role-based access (viewers see dashboard; admins access member management, API keys, manual data entry)
- FR34: The system can maintain user sessions via JWT

### Data Aggregation & Computation

- FR35: The system can aggregate per-member spend across all linked vendor accounts
- FR36: The system can aggregate per-member token usage across all linked vendor accounts
- FR37: The system can compute team-level totals for KPI display
- FR38: The system can store periodic usage snapshots to enable period-over-period comparison
- FR39: The system can compute leaderboard rankings and detect position changes between periods
- FR40: The system can compute badge eligibility based on member usage data

## Non-Functional Requirements

### Security

- NFR1: API credentials (vendor keys, tokens, PATs) must be encrypted at rest
- NFR2: Authentication sessions must use signed JWT tokens with expiration
- NFR3: Admin-only routes must enforce role checks server-side (not just UI hiding)
- NFR4: All data queries must be scoped by `tenant_id` to enforce data isolation

### Performance

- NFR5: Dashboard pages must render within 3 seconds on initial load
- NFR6: View toggling (cards ↔ chart) must complete within 500ms client-side

### Integration Reliability

- NFR7: Vendor adapter failures must not block dashboard rendering (graceful degradation with stale data + staleness indicator)
- NFR8: Each vendor adapter must report sync status (last success, last failure, confidence level)
- NFR9: Vendor API timeouts must be capped at 30 seconds per adapter

### Data Integrity

- NFR10: Data staleness must be visually indicated when last sync exceeds a configured threshold per source
- NFR11: Manual data entries must be timestamped and attributed to the admin who entered them
- NFR12: Member identity merges must preserve all historical data from merged accounts

### Scalability

- NFR13: Database schema must include `tenant_id` on all data tables from day one
- NFR14: System must support adding new vendor adapters without modifying core application code
- NFR15: Free-tier database storage constraints must be monitored; data retention policy deferred to architecture

