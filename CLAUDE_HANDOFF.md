# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** April 26, 2026 | **Branch:** `main` | **Build Status:** PASSING ✅ (0 errors)

---

## APRIL 26, 2026 SESSION — Operator Workflow, Dark Mode, Time-Off & Attendance, Late Clock-In

### What shipped
- **Work-performed page** — all 28 `alert()` calls replaced with `showNotification()` toast system (warning/error/success variants).
- **Daily-log 403 fix** — assignment check now covers: primary operator → helper (`helper_assigned_to`) → admin role bypass → existing-log fallback. Previously operators who were helpers or admins got blocked.
- **Post-submission locked card** — after "Done for Today" or "Complete Job", the day-complete page shows a polished success card (Sun amber / Trophy green) with expandable "Add a note for your supervisor" form instead of raw form or redirect.
- **Operator past 7-day job history** — My Jobs page now has a collapsible "Past 7 Days" section at bottom. Fetches completed/cancelled jobs within 7-day cutoff.
- **Green ticket highlights** — JobTicketCard highlights done-for-today jobs in emerald border + amber "Done for Today ✓" badge; completed jobs in full emerald + green "Completed ✓" badge.
- **"Continuing Tomorrow" section** — My Jobs shows amber section for `status=scheduled` + `is_multi_day=true` jobs. Day detail shows "Ready to Start Day X" banner.
- **Admin job detail — Daily Progress** — per-day cards with gradient day-number badge, hours worked, route/work start timestamps, work items list, operator name. Fetches via `GET /api/job-orders/[id]/daily-log`.
- **Admin job detail — Operator Notes panel** — right-column section showing notes from operators after submission; type badges: amber=done_for_day, emerald=completion, violet=amendment.
- **Admin active jobs** — `operator_notes_count` field + sky `StickyNote` badge on job cards when notes exist.
- **Admin completed jobs** — 4-tile metrics (Days Worked, Total Hours, Standby Time, Labor Cost) in job detail; Operator Notes panel.
- **Schedule board Mark Out** — rose "Mark Out" button on operator rows; `MarkOutModal` with reason dropdown (Sick, Personal Day, No-Show, Vacation, Other). Creates approved `operator_time_off` record. Operator row goes red (`bg-rose-50`) with "OUT" badge and disabled +Assign.
- **Time-off admin page** (`/dashboard/admin/time-off`) — 2-tab: Requests (table, filter by status/type, LogTimeOffModal) + Attendance Metrics (per-operator PTO progress bar, callout counts color-coded green/amber/red). Navigation item in admin sidebar.
- **PTO balance system** — `operator_pto_balance` table, `GET/PUT /api/admin/operators/pto-balance`, `GET /api/admin/time-off/stats`. Syncs on every time-off write.
- **Late clock-in tracking** — `is_late`, `late_minutes`, `scheduled_start_time`, `late_notified_at` columns on `timecards` fully wired. Flags ≥15 min late, sends fire-and-forget `schedule_notifications` to all admins in tenant. Fixed `recipient_id` column name bug.
- **Team payroll page** — 7th summary card "Late Arrivals This Week" (gray/amber/red); new "Late" column with per-operator color-coded badge (`Timer` icon); tfoot total; legend entry.
- **Operator detail timecard page** — 7th metric tile "Punctuality": 30-day late count, avg minutes late, last late date; color-coded emerald/amber/red with red border ring at 3+.
- **Stale "Needs Attention" badge fix** — `job_completion_requests` rows now cancelled when operator submits "Done for Today" (`continueNextDay=true`).
- **total_days_worked** — incremented on each successful "Done for Today" submission.
- **Migrations applied**: `20260426_job_notes.sql`, `job_orders_total_hours_worked`, `time_off_enhanced`, `operator_time_off_enhanced`, `time_off_enhancements`.

### Pending / next
- End-to-end workflow test: create job → dispatch → operator executes → Done for Today → Day 2 → Final completion → admin approves → invoice
- Mobile responsive audit on operator pages
- Patriot-specific visual assets and prod deploy prep

---

## APRIL 24, 2026 SESSION — Jobs UI refresh, Change Orders, Operator Skills

### What shipped
- **Active Jobs + Job Detail redesign** — light-default aesthetic with `dark:` variants; gradient accent bars per status; 5 metric tiles in hero card; tabs: Scope & Progress / Change Orders / Daily Activity.
- **Change Orders data model** — new `change_orders` table (migration `supabase/migrations/20260423_change_orders.sql` applied to `klatddoyncxidgqtcjnu`), separate from `job_scope_items`. Auto-numbered `CO-NNN` via trigger. API routes: `GET/POST /api/admin/jobs/[id]/change-orders`, `PATCH /api/admin/jobs/[id]/change-orders/[coId]` (approve/reject).
- **Multi-day progress analytics** — `GET /api/admin/jobs/[id]/progress-by-day` returns per-entry `cumulative_quantity` + `cumulative_pct`. `in_route` derived from `daily_job_logs` → `timecards` fallback → `job_status_history`.
- **Summary route fix** — `/api/admin/jobs/[id]/summary` was 404ing because it embedded `profiles!job_orders_assigned_to_fkey` but the FK targets `auth.users`. Fixed by fetching the operator profile in a second query.
- **Light-mode factory reset** — `contexts/ThemeContext.tsx` gained a `theme.factory-reset=v1` sentinel that one-time wipes stale `theme=dark` from localStorage. Default is now explicit-opt-in light. `DarkModeIconToggle` added to admin topbar.
- **Billing / Completed Jobs / Completed Job Tickets** — rewritten to match active-jobs light-default: gradient shells, white/90 ring-slate-200 cards, emerald/amber/rose/violet chip system, lucide icons, Link navigation.
- **Schedule form step reorder** — Difficulty & Notes moved to step 5, Scheduling to step 6, Site Compliance to step 7. Scheduling preview already filters operators by `difficulty_rating`.
- **Schedule board fix** — removed floating role badge that was overlapping the logout button.
- **Approve Job modal — operator availability panel** — extended `/api/admin/schedule-board/skill-match` with optional `date` param (flags operators already assigned that day). New panel inside `ApprovalModal` groups operators as good / stretch / under-skilled / busy.
- **Operator skills system** — per-scope skill levels stored in existing `profiles.skill_levels` jsonb (no migration needed; columns existed). Taxonomy at `lib/skills-taxonomy.ts`:
  - Cutting scopes (0–10): core_drill, slab_saw, wall_saw, push_saw, chain_saw, hand_saw, removal, demo
  - Equipment proficiency (0–5): mini_ex, skid_steer, lull, forklift
  - Freeform `notes` text
  - Service-code → scope map used by smart scheduling
  - API: `GET/PUT /api/admin/team-profiles/[id]/skills` (operators + apprentices only)
  - UI: new "Skills & Proficiency" tab in Team Profiles right panel
  - Smart scheduling now uses the per-scope skill when a job's service codes map to a scope

### Pending / next
- Wire each operator's per-scope skill numbers into the Approve Job availability panel so the displayed match uses the scope-specific value (backend returns it once skill-match is updated to read `skill_levels` by scope).
- Optionally render per-scope skill bars in the Team Profiles preview card for at-a-glance proficiency.
- Continue Week 2 polish (end-to-end workflow test, mobile audit, loading/error pass, Patriot assets, prod deploy prep).

---

## APRIL 26, 2026 SESSION — Late Clock-In Tracking & Metrics

### What shipped
- **Late detection in clock-in API** (`app/api/timecard/clock-in/route.ts`) — already-existing DB columns (`is_late`, `late_minutes`, `scheduled_start_time`, `late_notified_at`) now fully wired: on each clock-in, looks up the operator's assigned job for today, compares clock-in time vs `arrival_time`/`shop_arrival_time`, and flags the timecard if ≥15 min late.
- **Admin late notifications** — on late clock-in, fires a fire-and-forget insert into `schedule_notifications` for all admins/ops managers in the tenant. Fixed `recipient_id` column name (was incorrectly `operator_id` in earlier stubs).
- **Operator detail API** (`app/api/admin/timecards/operator/[id]/route.ts`) — added 30-day punctuality stats block: `lateCountMonth`, `avgMinutesLate`, `lastLateDate`. Included in returned `stats.punctuality`.
- **Team summary API** (`app/api/admin/timecards/team-summary/route.ts`) — added `lateArrivalsThisWeek` counter in totals, deduplicating by day per operator.
- **Team payroll page** (`app/dashboard/admin/timecards/page.tsx`) — 7th summary card "Late Arrivals This Week" (color: gray/amber/red); new "Late" column in the operator table showing late-day count as color-coded badge (`Timer` icon, `Xd` format); tfoot total; legend entry.
- **Operator detail page** (`app/dashboard/admin/timecards/operator/[id]/page.tsx`) — 7th metric tile "Punctuality" showing 30-day late count, avg minutes late, last late date; color-coded emerald/amber/red.
- All changes committed `e28fa1a0`, pushed, and merged to `main`.

### Pending / next
- End-to-end workflow testing (schedule → dispatch → execute → complete → invoice)
- Mobile responsive audit on all operator pages
- Loading states & error handling audit
- Patriot-specific visual assets and prod deploy prep

---

## APRIL 22, 2026 SESSION — Permission plumbing end-to-end

### Problem reported by user
Sales user had permission toggles ON in Team Profiles but could not see Customers, Active Jobs, Invoicing, Completed Jobs in the sidebar. Schedule Board + Billing pages redirected on first visit.

### 5-layer fix (3 parallel remediation agents + 3 verification agents)
1. **Route guards (Agent J)** — 24 routes switched `requireAdmin` → `requireSalesStaff`; `grant-super-admin` → `requireSuperAdmin`; `commission` gated (self-only for non-admin); `profiles/[id]` GET/PATCH self-or-admin, non-admins can't edit role/active/hire_date. Commits `f1015c44`, `7aac68b1`.
2. **Seed trigger (Agent K)** — `supabase/migrations/20260421120000_seed_user_feature_flags_by_role.sql`: AFTER INSERT on `profiles` auto-seeds role-appropriate `user_feature_flags`; AFTER UPDATE OF role re-seeds with 30-day stale-override heuristic; backfill for existing 5 profiles (was 2/5, now 5/5). Applied to `klatddoyncxidgqtcjnu`. Commit `427921eb`.
3. **UI consumers + schema cleanup (Agent L)** — Added `flagKey` on Schedule Board / Schedule Form sidebar items; fixed page guards in team-profiles / settings / billing to honor flags; reconciled `ROLE_PERMISSION_PRESETS` with `ADMIN_CARDS` via new `preset()` helper; hid dead toggles (`can_grant_super_admin`, personal metrics). Commits `1dc2ea6e`, `18ef763e`, `f882c6bf`.
4. **Feature-flag race (new)** — `useFeatureFlags` hook was setting `loading=false` when `userId` was still null, causing guards to briefly see `loading=false` + DEFAULT_FLAGS (all false) and redirect. Fix: keep loading=true until userId arrives; on stale-token 401 call `refreshSession()` and retry; subscribe to `onAuthStateChange` to catch late-arriving sessions. Also hardened billing page's inline flag fetch to poll getSession() up to 1.5s. Commit `b521a05e`.
5. **Verification (3 agents)** — curl-verified 38 routes accept salesman (0 false-401s), SQL-verified triggers fire + backfill covers all profiles + stale-override heuristic works both branches, browser-verified sidebar + gated pages via Preview MCP. Reports: `AGENT_J_VERIFY.md`, `AGENT_K_VERIFY.md`, `AGENT_L_VERIFY.md`.

### Login page
Added Sales/PM demo account card (sales@pontifex.com / Sales1234!). Commit `5148c641`.

---

---

## CURRENT STATE

### Git Status
- **Branch:** `feature/schedule-board-v2`
- **Pushed to origin** ✅
- **Build:** PASSING (0 errors)

### Session Summary (April 18, 2026)
Full 5-agent team execution: DANA → ALEX + SAM (parallel) → RILEY + MORGAN (parallel) → P0/P1 fixes.

---

## WHAT WAS DONE (April 18, 2026)

### DANA — Database
- Created `billing_milestones` table (RLS, indexes, tenant isolation)
- Created `notification_recipients` table (RLS, indexes)
- Added `expected_scope JSONB` and `billing_type TEXT` columns to `job_orders`
- Created `job_completion_summary` view (joins work_items + timecards aggregates)
- Migration file: `supabase/migrations/20260418000001_cycle_billing_schema.sql`

### ALEX — Backend API
- `GET /api/admin/jobs/[id]/completion-summary` — full completion data (job, work_items, timecards, invoices, milestones, scope %)
- `GET + POST /api/admin/jobs/[id]/billing-milestones` — milestone CRUD
- `POST /api/admin/billing-milestones/[id]/trigger` — manual milestone trigger (409 on double-trigger)
- `GET + POST /api/admin/jobs/[id]/work-items` — with fire-and-forget auto-trigger logic
- `POST /api/admin/jobs/[id]/notify-salesperson` — sends in-app notification to assigned salesperson

### SAM — Frontend
- Rebuilt `app/dashboard/admin/completed-job-tickets/[id]/page.tsx` with 6 sections:
  1. Job Overview (customer, dates, billing type, estimated vs actual cost)
  2. Scope Completed (cores + LF with progress bars vs expected)
  3. Labor Hours (table: operator/date/regular/OT/NS premium, cost breakdown)
  4. Cycle Billing Milestones (add/trigger inline, info callout when not cycle)
  5. Customer Feedback (star rating, comments, cleanliness/communication)
  6. Documents & Photos (PDF cards, photo grid)
- `app/dashboard/admin/billing/page.tsx` — billing type column + All/Fixed/Cycle/T&M filter
- `app/dashboard/admin/jobs/[id]/page.tsx` — Billing Settings card (type dropdown, cycle milestone builder, T&M rate sheet)

### RILEY — Review Fixes (P0s)
- Removed phantom `square_feet_cut` column from work-items and completion-summary queries
- Fixed `BillingMilestone` interface: `percent_target` → `milestone_percent`, `status` → `!!triggered_at`
- Fixed T&M billing filter: `time_and_material` value now matches correctly

### MORGAN + Fix Pass — P1s
- Fixed rating `0` hiding entire Customer Feedback section (falsy check → explicit null check)
- Added cycle billing info callout when `billing_type !== 'cycle'` with link to Job Detail
- Added tenant filter to `autoTriggerMilestones` billing_milestones query
- Made `autoTriggerMilestones` fire for super_admin (was previously skipped)
- Aligned `expected_scope` JSONB keys: `cores_drilled` → `cores`, `linear_feet_cut` → `linear_feet`
- Added `time_and_material` key to billing type badge map

---

## FEATURE STATUS

### Complete ✅
| Feature | Notes |
|---------|-------|
| Multi-tenant architecture | Company code login, tenant_id on all tables |
| White-label branding | Patriot red/navy in DB + code fallback |
| Schedule Board | All operators, editing, crew grid, notifications |
| Schedule Form | 8-step, operations_manager role bug fixed |
| Timecard System | NFC, GPS, segments, OT, night shift premium, approval |
| Operator Workflow | clock-in → work-performed → day-complete → complete |
| Billing & Invoicing | Create, send, QuickBooks CSV |
| **Cycle Billing System** | **NEW — milestones, auto-trigger, % completion tracking** |
| **Job Completion Summary** | **NEW — professional 6-section page with all data** |
| **Notify Salesperson** | **NEW — in-app notification from completion page** |
| Analytics Dashboard | 20 widgets, charts, commission tracking |
| Facilities | CRUD, badge tracking |
| Customer Management | Multi-contact, Google Maps |
| Security Audit | Tenant isolation, NFC bypass, XSS |

### Remaining — Manual / Operational
- [ ] **Manual E2E test**: Create customer → job → dispatch → clock-in → work performed → complete → invoice → paid → approve timecard
- [ ] **Cycle billing E2E**: Set billing_type=cycle on a job → add milestones → log work → verify auto-trigger fires
- [ ] **Patriot logo**: Upload logo file to `tenant_branding.logo_url`
- [ ] **Vercel env vars**: Confirm all 8 required vars set in Vercel dashboard
- [ ] **Go live**: Merge `feature/schedule-board-v2` → `main`

---

## KNOWN P2s (low priority, not blocking)
- API failure shows "Job Not Found" instead of proper error message on completion summary
- Scope Completed section silently absent when `expected_scope` not configured (no callout)
- Billing filter state lost on navigation (no URL persistence)
- Null `billing_type` falls into Fixed bucket silently
- Milestones not cleared in UI when switching Cycle → Fixed (doesn't affect DB)
- "Billing settings saved" message never auto-clears
- Milestone double-trigger race condition under concurrent saves (UNIQUE constraint not yet added)

---

## INFRASTRUCTURE

### Vercel
- Auto-deploy: pushes to `feature/schedule-board-v2` trigger preview deploys
- Merges to `main` → production at pontifexindustries.com
- **Env vars required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

### Supabase
- **Project ID**: `klatddoyncxidgqtcjnu`
- **97+ tables**, all RLS enabled
- New tables this session: `billing_milestones`, `notification_recipients`
- New view: `job_completion_summary`

### Dev Server
- Preview server: `preview_start` / `preview_stop` MCP tools
- Config in `.claude/launch.json`
- Commits require `export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"` prefix

### Cache Issues
- If changes don't appear: `lsof -ti:3000 | xargs kill -9`, delete `.next/`, restart
- If Vercel production stale: Cloudflare → Caching → Purge Everything
