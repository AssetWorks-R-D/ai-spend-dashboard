# AI Spend Dashboard - Session Handoff

## Project Overview
Internal dashboard to track and consolidate AI tool spending across 4 products:
**Cursor, Claude (subscription/team), GitHub Copilot, and Replit**

- **Stack**: Next.js + Vercel (free tier)
- **Auth**: Simple password protection
- **Domain**: assetworks.com team (~29 active members, 16-50 range)
- **Data**: Live API/scraping, auto-discover members + manual edit
- **Framework**: BMAD v6 installed (see `_bmad/` directory)

## What's Done
1. **BMAD v6 installed** - `npx bmad-method@6.0.1 install` with bmm module + claude-code tools
2. **All 4 product APIs researched** (details below)
3. **5 UI mockups captured** from user's screenshots (described below)

## API Research Results

### GitHub Copilot - BEST API SUPPORT
- `GET /orgs/{org}/copilot/billing` - org billing info (seat counts, plan type)
- `GET /orgs/{org}/copilot/billing/seats` - list seat assignments with last_activity
- `GET /orgs/{org}/members/{username}/copilot` - individual seat details
- `GET /organizations/{org}/settings/billing/premium_request/usage` - per-user premium usage with model, cost, quantities
- `GET /organizations/{org}/settings/billing/usage` - total usage report
- **Auth**: GitHub PAT with `manage_billing:copilot` or `read:org` scope, or fine-grained PAT with "Administration" org permission
- **Pricing**: Flat seat fee (~$19/seat/month Business, $39/seat Enterprise). User said they're phasing it out. Extra usage may be available via premium_request endpoint.

### Cursor - EXCELLENT API (Enterprise only)
- Analytics API with Basic Auth using API keys from team settings
- **Team endpoints**: `/analytics/team/{metric}` for agent-edits, tabs, dau, models, leaderboard, etc.
- **By-user endpoints**: `/analytics/by-user/{metric}` with pagination
- **Leaderboard**: `/analytics/team/leaderboard` - ranks members by usage
- Date params: `YYYY-MM-DD` or shortcuts like `7d`, `today`. Max 30-day range.
- Rate limits: 100 req/min team, 50 req/min by-user
- **Pricing**: Teams = $40/user/month with $20/month included credits per user. Extra usage billed per credit based on model used.
- **Key data**: Per-user token counts, acceptance rates, model breakdown, costs

### Claude (Anthropic Admin API) - GOOD API SUPPORT
- **Admin API key**: `sk-ant-admin...` prefix, provisioned by org admins in Console
- **Auth header**: `x-api-key: $ANTHROPIC_ADMIN_KEY`, `anthropic-version: 2023-06-01`
- `GET /v1/organizations/users` - list org members with roles
- `GET /v1/organizations/usage_report/messages` - usage report with group_by options (api_key_id, workspace_id, model, etc.)
- `GET /v1/organizations/usage_report/claude_code` - per-user Claude Code metrics (sessions, lines, tokens, estimated cost per model)
- **Claude Code report fields**: actor (email), core_metrics (commits, LOC, sessions, PRs), model_breakdown (tokens + estimated_cost), tool_actions
- **Messages report fields**: time-bucketed (1d/1h/1m), input/output tokens, cache tokens, model breakdown
- **Pricing**: Team plan ~$25-30/seat/month (standard), premium seats higher. Per-user spend tracking available.
- **NOTE**: The messages usage report is for API usage. For subscription (claude.ai chat) usage, the Claude Code analytics endpoint + admin dashboard scraping may be needed.

### Replit - NO API, SCRAPING REQUIRED
- No known billing/admin API for teams
- Team billing page will need to be scraped or data entered manually
- **Pricing**: ~$25/seat/month for Teams plan (varies)
- Per-user usage attribution may not be possible (user confirmed: add total Replit spend to top-line)
- Consider: manual data entry for Replit, or scrape team billing page with stored session cookie

## UI Mockups (from user screenshots)

### 1. Dashboard - Cards View (PRIMARY)
- Top KPIs: Total Team Spend, Total Tokens, Active Members
- Toggle: Cards | Chart
- Member cards ranked by spend (gold/silver/bronze badges)
- Each card: Name, Rank, Spend ($), Tokens, "By Tool" 4-quadrant grid
- Tool quadrants: Claude (orange border), Cursor (green), Replit (orange), Copilot (green)
- Grey/empty when member doesn't use a tool
- "~ tok" displayed when tokens unavailable for a tool

### 2. Dashboard - Chart View
- Same KPIs at top
- Horizontal stacked bar chart per member (Spend Comparison)
- Segments: Claude (orange), Cursor (dark grey), Replit (orange), Copilot (green)
- Per-bar legend showing which tools used

### 3. Team Management
- Table: Name, Email, Cursor ID, Copilot username, Replit username, Claude ID
- Auto-discover from billing data, allow manual editing
- Email domain: @assetworks.com

### 4. Team Achievements (Gamification)
- 6 badges: AI Pioneer (10K tokens), Token Titan (100K tokens), Big Spender ($100+), Productivity Champion, Multi-Tool Master, Early Adopter
- Some badges "coming soon"
- Per-member achievement counts

### 5. Usage Statistics
- Time range tabs: Last 7 Days | Last 30 Days
- Token Usage line chart (per tool over time)
- Cost Analysis section below

## Key Business Rules
1. **Seat cost attribution**: Each product's seat cost is included in per-member total (not just usage)
2. **Copilot**: Flat seat fee, phasing out. Capture extra usage if available.
3. **Cursor**: Seat charge ($40/user) + extra usage per member
4. **Claude**: Seat charge (standard + premium tiers) + extra usage per member
5. **Replit**: Seat charges only, total spend added to top-line (can't attribute to individuals)
6. **Default view**: Last 30 days, with custom date selection
7. **Member consolidation**: Auto-detect across platforms, match by email/name

## BMAD Next Steps
The BMAD framework expects you to follow its workflow. Recommended path:
1. Run `/bmad-help` to see what's next
2. Create a Product Brief or PRD using the BMAD workflows
3. Create architecture using `/bmad-bmm-create-architecture`
4. Create stories using `/bmad-bmm-create-epics-and-stories`
5. Implement using `/bmad-bmm-dev-story` or `/bmad-bmm-quick-dev`

Alternatively, since we have clear requirements, use `/bmad-bmm-quick-spec` or `/bmad-bmm-quick-dev` for a faster path.

## Environment Setup Still Needed
- [ ] Initialize git repo
- [ ] Create Next.js project (`npx create-next-app@latest`)
- [ ] Set up environment variables for API keys
- [ ] Choose database (SQLite via Prisma for simplicity, or JSON file store for MVP)
