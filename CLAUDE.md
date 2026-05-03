# Pontifex Industries Platform — Claude Instructions

## Project
Concrete cutting operations platform for Patriot Concrete Cutting (white-label as Pontifex Industries).
Next.js 15 (App Router) + React 19 + TypeScript + Supabase (PostgreSQL) + Tailwind CSS.

## Autonomous Mode
- Make all code changes directly — do not ask for confirmation on edits, file creation, or refactors
- Apply database migrations via Supabase MCP when ready
- Run `npm run build` after significant changes to verify no errors
- Commit work in logical chunks with descriptive messages
- Push to feature branch when commits are ready
- When starting a new session, read CLAUDE_HANDOFF.md first to resume context
- At the END of every session, update CLAUDE_HANDOFF.md with what was done and what's next

## Session Workflow
1. **Start of session:** Read CLAUDE_HANDOFF.md → pick up where last session left off
2. **During session:** Work through sprint backlog top-to-bottom unless user reprioritizes
3. **After each feature:** Run `npm run build` to verify, commit with descriptive message
4. **End of session:** Update CLAUDE_HANDOFF.md + push to branch
5. **If user says "pick up next task":** Read the sprint backlog and start the next unchecked item

## Parallel Work
- User can request multiple features built simultaneously using parallel agents
- Each agent works in an isolated worktree to avoid conflicts
- Batch by layer when possible: all backend API routes → all UI pages → all migrations
- **CRITICAL**: Worktree branches MUST be merged back to `feature/schedule-board-v2` before session ends. User's localhost runs from the main repo, not worktrees.
- **CRITICAL**: Worktrees do NOT inherit `.env.local` — copy it from the main repo or Supabase calls will fail.
- If `.next/` cache causes "routes-manifest.json" errors, delete `.next/` and restart the dev server.

## Key Conventions
- API routes use `requireAuth()`, `requireAdmin()`, `requireSuperAdmin()`, or `requireScheduleBoardAccess()` from `lib/api-auth.ts`
- Client pages use `getCurrentUser()` from `lib/auth.ts` with role array checks in useEffect
- Supabase admin client (`lib/supabase-admin.ts`) for all server-side DB operations (bypasses RLS)
- Supabase public client (`lib/supabase.ts`) for client-side
- API response format: `{ success: true, data: {...} }` or `{ error: 'message' }` with HTTP status
- All logging is fire-and-forget via `Promise.resolve(supabaseAdmin.from(...).insert(...)).then(...).catch(() => {})`
- Job numbers: `JOB-{year}-{6 digits}` (schedule form) or `QA-{year}-{6 digits}` (quick add)
- Purple/dark theme aesthetic with Tailwind
- Use lucide-react icons throughout
- Mobile-first responsive design

## Database
- Supabase project: `klatddoyncxidgqtcjnu`
- 70+ migrations in `supabase/migrations/`
- 90+ tables in production
- All tables have RLS enabled
- **DO NOT use `auth.jwt() -> 'user_metadata'` in RLS.** `user_metadata` is client-writable via `supabase.auth.updateUser({ data: { role: 'super_admin' } })`, so any operator could self-promote. Supabase's linter flags this as `rls_references_user_metadata` (ERROR).
- For role/tenant checks in RLS, use the SECURITY DEFINER helpers that read from `public.profiles`:
  - `public.is_admin()` — true for `admin` or `super_admin`
  - `public.current_user_role()` — returns the caller's `profiles.role`
  - `public.current_user_tenant_id()` — returns the caller's `profiles.tenant_id`
  - `public.current_user_has_role(VARIADIC text[])` — membership check against an allowed list
- Example: `USING ( public.current_user_has_role('admin','super_admin','operations_manager') AND tenant_id = public.current_user_tenant_id() )`
- If you need immutable identity claims, `auth.jwt() -> 'app_metadata'` is acceptable (server-only writable) — `user_metadata` is never safe for authorization.

## Roles (priority order)
super_admin > operations_manager > admin > salesman > shop_manager > inventory_manager > operator > apprentice

## Branch
Working branch: `feature/schedule-board-v2` (main is production)

## Build & Test
```bash
npm run dev        # Dev server on port 3000
npm run build      # Production build check (must pass with 0 errors)
```

## Context Files
- `CLAUDE_CONTEXT.md` — Full project architecture reference
- `CLAUDE_SESSION_CONTEXT.md` — Detailed schema, patterns, business rules
- `CLAUDE_HANDOFF.md` — Latest session handoff with pending work (ALWAYS update at end of session)

---

## Platform Vision

The end-state is a multi-tenant SaaS called **Pontifex Industries** that hosts multiple concrete-cutting / construction-services companies on a single platform. Tenant #1 is Patriot Concrete Cutting (currently in trial). Each tenant has its own brand, users, jobs, customers — fully isolated by `tenant_id` and RLS.

### Login model (multi-tenant)
- Every tenant has a `company_code` in `public.tenants` (Patriot's is `PATRIOT`).
- Login UI takes **company code + email + password**. The company code disambiguates which tenant the user belongs to + drives the white-label branding (logo, primary color) on the login page itself.
- One email = one tenant for now. (If a single user ever needs to belong to multiple tenants, that's a profiles refactor — punt until needed.)
- White-label fields already in `tenants`: `name`, `slug`, `domain`, `logo_url`, `primary_color`, `plan`, `max_users`, `max_jobs_per_month`, `features` jsonb. `BrandingProvider` reads these client-side.

### Distribution roadmap
1. **Web (live now)** — `pontifexindustries.com` is the primary access point. Trial customer (Patriot) running here.
2. **Mobile apps (planned)** — wrap the existing Next.js app with **Capacitor** (or Tauri for desktop). Same codebase, same APIs, ships to App Store + Google Play. No React Native rewrite. Why Capacitor: zero refactor, native plugins (NFC, geolocation, camera, push) available, fast to ship.
3. **Per-tenant subdomain (longer-term, optional)** — `patriot.pontifexindustries.com` with tenant-aware routing. Useful when multiple tenants are live and we want to brand the URL.

### Non-negotiables
- Every new table has `tenant_id` and tenant-scoped RLS. Use the SECURITY DEFINER helpers (`current_user_tenant_id()`, etc.) — never `auth.jwt() -> 'user_metadata'`.
- Every new feature works for any tenant out of the box — no Patriot-specific branding hardcoded. Use `BrandingProvider` / `tenants.primary_color` / `tenants.logo_url`.
- Mobile-first. Operators are on phones. Tap targets ≥ 44px, no horizontal overflow at 375px. Use the `mobile-responsive-auditor` subagent before merging operator-page changes.

---

## Deployment & Testing Workflow

We have **production live on Vercel + a single Supabase project**. Trial customer using prod. The discipline is to make changes safely without disrupting their data.

### Three environments (no extra hosting cost)

| Environment | URL | Branch | Supabase | When to use |
|---|---|---|---|---|
| **Production** | `pontifexindustries.com` | `main` (origin) | Production project `klatddoyncxidgqtcjnu` | Customer-facing. Push only after verification. |
| **Vercel preview** | `pontifex-industries-software-awja-git-<branch>-...vercel.app` | Any non-main branch on origin | Same prod project (read/write — careful) | Test UI / client-only changes against real data on a sharable URL. Auto-created by Vercel on every branch push. |
| **Local dev** | `localhost:3000` | Whatever you have checked out | Same prod project via `.env.local` | Active iteration. Hot reload, fast cycle. |

### Rules of the road

1. **Never `git push origin main` until you've verified** — preview URL is green, build passes, you've eyeballed the change. The trial is using `main`.
2. **Code-only changes** (UI, API routes, business logic) — push branch → use the auto-generated Vercel preview URL → verify → THEN merge to main.
3. **Schema changes (migrations)** — these hit the live DB regardless of which branch the code is on. Two options:
   - **Risky migration** (drops a column, alters a heavily-used table, backfills data): create a Supabase Database Branch first via the Supabase MCP `create_branch` tool. Apply + test against the branch DB. When green, apply to production.
   - **Additive migration** (new table, new column with default, new index): apply directly to prod via MCP `apply_migration`. The convention is idempotent DDL (`CREATE TABLE IF NOT EXISTS`, `CREATE POLICY ... EXCEPTION WHEN duplicate_object`) so re-runs are no-ops.
4. **Cron jobs** (`/api/cron/*`) — defined in `vercel.json` and run only against production. Don't expect them to fire on previews. The `CRON_SECRET` env var must be set in Vercel for the route to authorize.

### Quick reference

```bash
# Local dev (touches prod DB unless you swap .env.local)
npm run dev

# Push to branch — Vercel auto-creates a preview URL
git push origin <branch>

# Find the preview URL after pushing
gh pr view --json url   # if a PR is open
# or check Vercel dashboard

# Promote to prod (only after preview is verified)
git checkout main && git merge <branch> && git push origin main
```

### When you want a fully-isolated staging URL

Optional — not set up by default. To add later:
1. Create a `staging` branch in git.
2. In the Vercel dashboard, alias the staging branch's deployment to `staging.pontifexindustries.com`.
3. Optionally configure separate "Preview" env vars in Vercel that point at a second Supabase project (creating one is free on hobby tier — but data sync becomes a chore).

For now, the auto-preview URL per branch is enough.

---

## Sprint Backlog (Target: April 2, 2026)

### Week 1 — Core Feature Completion (March 19–25) ✅ COMPLETE
- [x] Finish dispatch ticket PDF generation
- [x] Apply permit fields migration to Supabase
- [x] Customer signature capture in job completion flow
- [x] Photo upload during job execution
- [x] PDF invoice generation (using @react-pdf/renderer)
- [x] QuickBooks CSV export from billing page

### Sessions 4-6 — Major Features (March 25-26) ✅ COMPLETE
- [x] Schedule board: all operators view, time-off, skill warnings, realtime colors, inline editing
- [x] Schedule form redesign: customer-first flow, project name, smart contact dropdown, facility compliance
- [x] Timecard + NFC system: weekly view, per-operator breakdown, NFC management
- [x] Facilities & badging: facility CRUD, badge tracking, auto-expiration
- [x] Approval workflow: reject/approve/resubmit, form history
- [x] Customer portal: public signature page, form builder, surveys
- [x] Work-performed gate: block completion without logging work

### Sessions 7-8 — Multi-Tenant & Landing (March 28-29) ✅ COMPLETE
- [x] Multi-tenant architecture (tenant_id on all tables, company code login)
- [x] White-label branding system (tenant_branding, BrandingProvider)
- [x] Debranded all hardcoded Pontifex references
- [x] Landing page rebuild as product showcase
- [x] Request Demo funnel (3-step with API)

### Session 9 — Timecard System & Security (March 31) ✅ COMPLETE
- [x] Timecard system overhaul (DB, API, UI, NFC, GPS, segments)
- [x] Configurable break deduction (auto-deduct, paid/unpaid, threshold)
- [x] Operator timecard detail view (segments, GPS, coworkers, notes)
- [x] Team payroll overview (Mon-Sun grid, batch approve, export)
- [x] Notification system (in-app + email, auto-reminders, NFC bypass)
- [x] NotificationBell on admin + operator dashboards
- [x] Comprehensive security audit (NFC bypass, XSS, tenant isolation)
- [x] Database audit (indexes, RLS, seeded defaults)
- [x] Restored all 230+ files from unmerged worktree branches
- [x] Fixed login (all 8 roles), RBAC (admin full access), dashboard branding

### Session — April 24, 2026 — Jobs UI, Change Orders, Skills ✅ COMPLETE
- [x] Active Jobs + Job Detail redesigned (light-default, gradient accent bars, 5 metric tiles, tabs: Scope & Progress / Change Orders / Daily Activity)
- [x] Change Orders data model — new `change_orders` table (migration `20260423_change_orders.sql` applied), auto-numbered `CO-NNN`, separate from `job_scope_items`
- [x] Change Orders API — `GET/POST /api/admin/jobs/[id]/change-orders` and `[coId]` approve/reject
- [x] Multi-day progress analytics — `/api/admin/jobs/[id]/progress-by-day` with per-entry cumulative_quantity + cumulative_pct; in_route derived from daily_job_logs → timecards → job_status_history
- [x] Fixed `/api/admin/jobs/[id]/summary` 404 (FK `assigned_to` targets `auth.users`, not `profiles`; second-query fetch for operator profile)
- [x] Light-mode factory reset — `theme.factory-reset=v1` sentinel wipes stale `theme=dark`; DarkModeIconToggle added to admin topbar
- [x] Billing / Completed Jobs / Completed Job Tickets rewritten to light-default (gradient shells, white/90 ring-slate-200, emerald/amber/rose/violet chips, lucide icons, Link navigation)
- [x] Schedule form step reorder — Difficulty (5), Scheduling (6), Site Compliance (7); Scheduling preview filters by `difficulty_rating`
- [x] Schedule board — removed floating role badge overlapping logout
- [x] Approve Job modal — operator availability panel (good / stretch / under-skilled / busy); extended `/api/admin/schedule-board/skill-match` with optional `date` param
- [x] Operator skills taxonomy — `lib/skills-taxonomy.ts` (cutting 0–10, equipment 0–5, notes); service-code → scope map; stored in existing `profiles.skill_levels` jsonb
- [x] Skills API — `GET/PUT /api/admin/team-profiles/[id]/skills` (operators + apprentices only)
- [x] Team Profiles — new "Skills & Proficiency" tab in right panel
- [x] Smart scheduling — uses per-scope skill when a job's service codes map to a scope

### Session — April 26, 2026 — Operator Workflow, Dark Mode, Time-Off, Late Clock-In ✅ COMPLETE
- [x] Replace all browser alert() dialogs with toast notifications in work-performed page (28 calls)
- [x] Fix "You are not assigned to this job" 403 — helper + admin bypass + existing-log fallback
- [x] Full dark mode pass: day-complete, in-route, standby, timecard, my-profile pages
- [x] Post-submission locked state: done-for-today and complete show success card with optional notes
- [x] Operator past 7-day job history on My Jobs (collapsible section, collapsed by default)
- [x] Green ticket highlights: done-for-today (emerald border) and completed (full emerald) on My Jobs
- [x] "Continuing Tomorrow" amber section on My Jobs for multi-day jobs resuming next day
- [x] Admin job detail — Daily Progress per-day cards (hours, timestamps, work items, operator names)
- [x] Admin job detail — Operator Notes panel with type badges (done_for_day, completion, amendment)
- [x] Admin active jobs — operator notes count badge (sky StickyNote icon)
- [x] Admin completed jobs — 4-tile metrics (days worked, total hours, standby time, labor cost) + notes
- [x] Schedule board — Mark Out button (rose) → operator row blocked, disabled +Assign
- [x] Time-off admin page — 2-tab: Requests + Attendance Metrics; PTO tracking; callout counts per operator
- [x] PTO balance API — operator_pto_balance table, per-year allocation, admin adjust endpoint
- [x] Late clock-in tracking — is_late/late_minutes flagged at clock-in, fire-and-forget admin notifications
- [x] Team payroll page — Late Arrivals summary card + Late column (color-coded badge, Timer icon)
- [x] Operator detail timecard page — Punctuality tile (30-day late count, avg minutes, last late date)
- [x] Stale "Needs Attention" badge fix — job_completion_requests cancelled on continueNextDay
- [x] total_days_worked incremented on each Done for Today submission
- [x] Migrations applied: job_notes, job_orders_total_hours_worked, time_off_enhanced, operator_time_off_enhanced, time_off_enhancements

### Session — April 27, 2026 — Auth Fixes, Navigation Cross-Contamination, Transparency ✅ COMPLETE
- [x] Fix stale localStorage cache causing role bleed — `getCurrentUser()` now cross-validates `supabase-user` against active `sb-*-auth-token` Supabase session
- [x] New `lib/hooks/useAuthUser.ts` — async-safe hook with Supabase session as ground truth + role enforcement
- [x] `logout()` clears all `sb-*-auth-token` keys to prevent session bleed across users
- [x] Admin page role guards split: `!currentUser` → `/login`, wrong role → `/dashboard` (schedule-form, timecards pages)
- [x] Operator dashboard Active Jobs stat tile converted from `div` to `Link href="/dashboard/my-jobs"`
- [x] Super Admin redirect — expanded role check from `admin` only to all 6 management roles
- [x] Stale timecard blocking clock-in — `.eq('date', today)` added to both clock-in and current timecard queries; auto-close loop for previous-day open timecards
- [x] Job daily assignments sync — `GET /api/job-orders` now respects `job_daily_assignments` overrides for date-scoped non-admin queries
- [x] `my-jobs/page.tsx` — client-side role filter: non-apprentices only see `assigned_to === uid` jobs
- [x] Super Admin "Job not found" — `summary/route.ts` all 4 queries now use conditional tenant filter (null-safe for super_admin)
- [x] Real-time live status panel — `GET /api/admin/jobs/[id]/live-status` (30s poll): in-route, arrived, standby, work performed, status history
- [x] Delete job — trash icon + confirmation modal on Active Jobs cards
- [x] Skill-match slash split — `split(/[,/]/)` handles "WS/TS" combined service codes

### Week 2 — Final Polish & Launch
- [ ] End-to-end workflow testing (schedule → dispatch → execute → complete → invoice) — demo passed May 1
- [x] Mobile responsive audit on all operator pages — completed May 2 (login/offer/sign clean, NPS chips fixed)
- [ ] Loading states & error handling audit across remaining pages
- [ ] Patriot-specific visual assets (logos, custom colors)
- [x] **Production deployment LIVE** — May 2, https://www.pontifexindustries.com (commit `0963259f`)
- [ ] Apply pending migrations: `20260427_utility_waiver_fields.sql`, `20260427_operator_badges.sql`
- [ ] Set `CRON_SECRET` env var in Vercel dashboard (required for `/api/cron/invoice-30d-reminders`)

### Session — May 2, 2026 — Post-Demo Refinement + Production Deploy
- [x] Linear Ft + Cut Depth mode rebuilt with cross-cut calculator (length × width + cross-cut spacing + overcut → auto LF)
- [x] Edit Scope button on schedule-board edit modal → opens schedule-form in edit mode at scope step (Option A redirect approach)
- [x] Schedule-form supports `?editJobId=<uuid>&jumpTo=scope` query params: prefills from job, shows "Editing existing job" badge, PATCHes on submit
- [x] Mobile audit: NPS chips collapse to 5x2 on phones (was unusably tight at 10-col)
- [x] **Pushed 97 commits to origin/main → production live**

### Ongoing / As-Needed
- [ ] SMS integration for signature request delivery
- [ ] Schedule board performance optimization
