# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** April 30, 2026 | **Branch:** `claude/sleepy-shannon-95c45b` (pushed) — local `main` ahead of origin by ~30 commits | **Build Status:** PASSING ✅ (0 errors, 8.8s)

---

## APRIL 30, 2026 SESSION — Active-Jobs Filter, Real-Time Draft, Back-Nav, Survey Redesign

### Four-issue fix shipped (3 parallel tracks + 2 follow-up bug fixes)

#### Issue 1 — Hide pending_approval from Active Jobs
- `app/api/admin/active-jobs/route.ts` — added `pending_approval` to the excluded status set: `not('status', 'in', '("completed","cancelled","archived","pending_approval")')`.
- Active-jobs-summary route already used a whitelist (`['assigned','in_route','on_site','in_progress']`), so it was already correctly excluding pending_approval.

#### Issue 2 — Real-time draft transparency
- `app/api/admin/jobs/[id]/live-status/route.ts` extended with `draft_work_performed: { items, notes, updated_at, source } | null`.
- Pulls from `daily_job_logs.work_performed_draft` jsonb for the operator's row on today's date. Picks the most recently edited row (operator vs helper) that has actual items.
- `app/dashboard/admin/jobs/[id]/page.tsx` — new pulsing violet "Draft in progress" pill on the Live Status panel showing typed item chips with quantities + "edited Xs ago".

#### Issue 3 — Work-performed back-nav data loss
- `handleSubmit` no longer clears the draft on the Next button. Drafts survive navigation away and back.
- Auto-save debounce reduced **2000ms → 500ms** for near-real-time admin transparency.
- Mount fallback: if no draft exists in DB or localStorage, GET `/api/job-orders/[id]/work-history` and hydrate the form from today's submitted work_items (highest day_number rows). User who already submitted can re-edit on Back-button return.

#### Issue 4 — Job Survey UI redesign
- Full visual rewrite preserving all state, logic, localStorage keys, equipment categories, and submit flow.
- Gradient violet→indigo header accent stripe, sticky header with back/home/dark-mode buttons.
- Progress indicator: "X / Y sections" + gradient fill bar driven by `useMemo` over completeness.
- Helper Rating: 10 buttons in `grid-cols-5`, color-coded selection (rose 1-2, amber 3-5, emerald 6-10).
- Equipment Details: lucide thumbnails per category (Drill / Scissors / Cable etc.); per-category card with tone-coded accent (violet/sky/amber/rose/teal/indigo).
- Segmented Yes/No and Water Source buttons with Droplets/Truck icons, all `min-h-[44px]` (iOS guideline preserved from session 2 mobile audit).
- Summary review card before submit + emerald-gradient submit button with `CheckCircle` icon.

### Two follow-up bug fixes (caught during E2E test)
- `daily_job_logs` has NO `updated_at` column — only `created_at` and `work_performed_draft_updated_at`.
  - Live-status query was selecting `updated_at` → silently returned null draft → admin pill never appeared.
  - PUT `/work-performed-draft` was writing `updated_at: now` → every draft save returned 500.
  - Both fixed: live-status now uses `work_performed_draft_updated_at` (with `created_at` fallback). PUT route stripped the bogus column write.

### E2E verification (against running localhost:3000 with magic-link minted tokens)
- ✅ Operator PUTs draft → 200 (no more 500)
- ✅ Admin GET live-status sees the draft with 2 items, correct source='operator', fresh updated_at
- ✅ Operator updates draft → admin sees the UPDATED draft (1 item, qty 15)
- ✅ Operator clears draft (PUT null) → 200; admin sees `draft_work_performed: null`
- ✅ Active-jobs returns 1 job (in_progress only); pending_approval WS/TS correctly excluded
- ✅ Build passes; pre-commit TypeScript check green

### Commits on `main` (LOCAL — NOT pushed)
```
a31bd3b4  fix: live-status draft query and work-performed-draft PUT use real column names
1c4d36fc  feat: hide pending_approval jobs + real-time draft transparency for admins
[merge]   Track C — job survey redesign
[merge]   Track B — work-performed back-nav fix
b77b90cb  fix: persist work-performed draft across back-navigation; hydrate from submitted items when draft empty
cfc35bb9  feat: redesign job survey page UI for operators
```

### Known follow-up
- `day-complete` page submission does NOT yet clear `daily_job_logs.work_performed_draft` after final submit. Track B left a TODO. Without it, drafts orphan after day-complete (not user-visible — fallback hydration logic uses `max(day_number)` to surface only today's items). Address when next touching day-complete.

---

---

## APRIL 28, 2026 SESSION (PT 3) — Sales Scoping + Commissions Dashboard

### Three parallel tracks shipped (all merged, all build-clean, all E2E-tested)

#### Track A — Server-enforced active-jobs role scoping
- `app/api/admin/active-jobs/route.ts` and `app/api/admin/active-jobs-summary/route.ts`
- Salesmen can ONLY see jobs they created (`created_by = userId`). Server enforces regardless of `?mine` flag.
- Full admins (`super_admin`, `operations_manager`, `admin`) see all tenant jobs by default; can opt into `?mine=true` for their own.
- Response now includes `scope: { is_scoped, role, scoped_to_user }` so the UI can render appropriate copy.
- Active-jobs-summary aligned with the same scoping logic — counts no longer leak across salesmen.

#### Track B — Sales dashboard backend
- New `GET /api/sales/dashboard` — returns `{ user, quoted (mtd/ytd/last_month/trend_pct), jobs (active/completed/total counts), commissions (pending/earned_mtd/earned_ytd/breakdown[]) }`. Self-scoped; super_admin can pass `?userId=`.
- New `PATCH /api/admin/invoices/[id]/mark-paid` — admin-only. Updates `amount_paid`, `paid_at`, `paid_by`, `balance_due`, `status` (paid/partial). Audit-logged.
- New `PATCH /api/admin/jobs/[id]/commission-rate` — admin-only. Validates 0–100. Audit-logged.
- New `PATCH /api/profile/commission-rate-default` — self-update; admins can target via `?userId=`. Validates 0–100.
- Invoice → job linkage flows through `invoice_line_items.job_order_id` (no `job_id` direct column on invoices). Multi-job invoices are distributed proportionally by line-item amount share.

#### Track C — Salesman dashboard UI + scoped active-jobs UI + per-job % progress
- `app/dashboard/admin/page.tsx` — when `role === 'salesman'`, page short-circuits to a sales-specific layout: 4 KPI tiles (Active / Quoted MTD / Pending Commissions / Earned MTD), Commissions card, quick actions. Other roles untouched.
- New `components/CommissionsCard.tsx` — gradient card with editable default rate, 3 stat tiles, desktop table / mobile cards breakdown by job, status badges (Earned / Pending / No invoice), empty state.
- `app/dashboard/admin/active-jobs/page.tsx` — reads new `scope.is_scoped` from the API. When scoped: header subtitle becomes "My active jobs", top-right badge sky "My Jobs" (instead of violet "Showing All"), empty-state copy adapts. Salesmen see no toggle button.
- Per-job % complete progress bar on each card — lazy fetches `/api/admin/jobs/[id]/summary` with concurrency 3. Thin emerald bar, "X% complete" label.

### Schema added (Supabase MCP applied)
Migration `20260428_commission_and_paid_invoice_fields`:
- `profiles.commission_rate_default numeric(5,2) DEFAULT 0`
- `job_orders.commission_rate numeric(5,2) NULL` (per-job override)
- `invoices.paid_at timestamptz`, `invoices.paid_by uuid REFERENCES profiles(id)`
- Indexes: `invoices_paid_at_idx`, `job_orders_created_by_active_idx` (partial)

### E2E verification (against running localhost:3000 with magic-link minted tokens)
- ✅ Salesman GET `/active-jobs` → returns ONLY their 2 jobs, `is_scoped: true`
- ✅ Super Admin GET `/active-jobs` → returns all jobs, `is_scoped: false`
- ✅ Super Admin GET `/active-jobs?mine=true` → returns 0 jobs (correctly scoped to super_admin's own)
- ✅ Salesman GET `/api/sales/dashboard` → 200, full payload populated
- ✅ Salesman PATCH `/api/profile/commission-rate-default` (rate 7.5) → 200, persisted
- ✅ Super Admin PATCH `/api/admin/jobs/.../commission-rate` (rate 10) → 200, persisted
- ✅ Validation: rate=150 → 400
- ✅ Authorization: salesman trying to PATCH job commission-rate → 403
- Test artifacts (test rates) rolled back to clean state

### Commits on `main` (LOCAL — NOT pushed to origin yet)
```
d9ee644f  feat: sales dashboard endpoints — quoted revenue, commissions, mark-paid
54d6c455  feat: server-enforced role scoping on active-jobs endpoint
2ee40e75  feat: salesman dashboard — quoted MTD, commissions card, scoped active jobs UI, % progress
```

### Pending follow-ups (deferred from Track C)
- **Mark Paid button on invoice list page** ([app/dashboard/admin/billing/page.tsx](app/dashboard/admin/billing/page.tsx)) — backend ready (PATCH `/api/admin/invoices/[id]/mark-paid`), UI not wired. Need: row-level "Mark Paid" button + modal capturing paid_amount/paid_at.
- **Commission Rate inline editor on job detail page** ([app/dashboard/admin/jobs/[id]/page.tsx](app/dashboard/admin/jobs/[id]/page.tsx)) — backend ready (PATCH `/api/admin/jobs/[id]/commission-rate`), UI not wired. Mirror the pattern from CommissionsCard's default-rate inline editor.
- **Partial billing UI** — backend has `summary.scope.overall_pct`. Could add "Bill at X%" CTA on Active Jobs cards that pre-fills an invoice draft for the completed portion.

---

---

## APRIL 28, 2026 SESSION (PT 2) — Operator Transparency Panel + Editable Timestamps

### Problem reported
Admin opens job detail for an active job and gets "Failed to load job details" full-screen. User needed real-time visibility into operator activity (in-route, arrived, work performed, standby) AND the ability to edit timestamps when operators forget to click.

### Diagnosis
- **Root cause of page-load failure:** stale browser session token. Server-side `/summary` endpoint returns 200 with valid JSON when called with a fresh token (verified via E2E magic-link test). The browser was sending an expired bearer.
- **Hidden UX flaw:** the page short-circuits the entire layout when `/summary` errors, hiding the live-status panel that *did* successfully load. So even when transparency data was available, admins saw nothing.

### Three parallel agent tracks (all merged, all build-clean)

#### Track A — Backend: editable timestamps + work-performed notifications
- New `PATCH /api/admin/jobs/[id]/timestamps` — accepts any of `in_route_at`, `arrived_at_jobsite_at`, `work_started_at`, `work_completed_at` (each can be ISO string or `null` to clear) + optional `edit_reason`. requireAdmin. Returns updated values. Validation: 400 on no keys / malformed ISO; 404 if job not found.
- Audit-logged via `audit_logs.action='admin_edit_job_timestamps'` with `before/after` snapshot + `edit_reason` in `details` JSON.
- `app/api/job-orders/[id]/work-items/route.ts` (operator submission endpoint) now fans out a `notifications` row to every `admin/super_admin/operations_manager` profile in the tenant after each work-performed insert. Fire-and-forget pattern, doesn't block operator response.
- Notification fields used: `type='work_performed'`, `title='Work performed update'`, computed message string, `action_url=/dashboard/admin/jobs/<id>`, `sender_id=operator`, `tenant_id=job.tenant_id`.

#### Track B — Backend: live-status enriched
- `GET /api/admin/jobs/[id]/live-status` extended (existing fields preserved):
  - `standby_segments_today: Array<{ id, started_at, ended_at, duration_minutes, reason }>` — all of today's segments, ongoing duration computed live
  - `last_work_performed_at: string|null`
  - `work_performed_count_today: number`
  - `route_start_coords: {lat, lng}|null` and `work_start_coords: {lat, lng}|null` (from existing `route_start_*`/`work_start_*` columns)
- All new queries wrapped in try/catch with safe defaults so a single failure doesn't kill the response.

#### Track C — Frontend: non-blocking error + live ops panel + edit modal
- `pageError` state widened from `string|null` → `{status?: number; message: string}|null` so HTTP status is preserved for display.
- Old full-screen "Failed to load job details" replaced with rose-accent inline banner. **Live status panel still renders even when summary fails**, so dispatch never loses operator visibility.
- Banner shows status code, "Retry" button (calls `fetchJob`), "Reload page", and a small "Sign out" link in case of corrupted session.
- New [components/admin/EditTimestampModal.tsx](components/admin/EditTimestampModal.tsx) (293 lines) — bottom-sheet on mobile, centered on desktop, datetime-local input + edit-reason textarea + Save/Clear/Cancel.
- Pencil icons next to in-route, arrived, work-started, work-completed timestamps in the live-status panel — opens the edit modal.
- Always-rendered rows (em-dash placeholder + pencil) so admins can fill in missed clicks for any of the four timestamps.
- Active standby block now shows a **live ticking elapsed timer** (`formatHMS`, 1s setInterval) with pulsing rose dot.
- New collapsible "Today's standby (N)" list when there are completed segments.
- Sky chip showing work-performed count + last update timestamp; click scrolls to Daily Progress card.
- Live indicator now intelligent: emerald LIVE (<60s), amber STALE (>90s), grey "Polling".

### E2E verification (against running localhost:3000 with super_admin token)
- ✅ `GET /live-status` → 200 with all new fields populated
- ✅ `PATCH /timestamps` setting `arrived_at_jobsite_at` → 200, value persists, reflected in next GET
- ✅ `PATCH /timestamps` to null → 200, clears column
- ✅ Audit log captures both edits with correct `changed_keys` and `edit_reason`
- ✅ Empty body → 400; malformed ISO → 400
- ✅ Page renders 67KB shell without React error markers

### Commits on `main` (LOCAL only — NOT pushed to origin yet pending user QA)
```
[merge] live operator transparency — editable timestamps, standby segments, non-blocking errors
0acaee11  feat: live ops transparency — editable timestamps + standby segments + non-blocking errors
1ec00aaa  feat: extend live-status with standby segments, work counts, GPS coords
92f34146  feat: editable job timestamps API + work-performed admin notifications
```

### Note on the original "Failed to load" report
The user's specific page-load failure was a stale browser session — the server endpoint was 200ing the whole time. With Track C's non-blocking error UI, this scenario now degrades gracefully (banner + live panel) instead of total blackout. If it recurs, the banner offers a "Sign out" → re-login path.

---

## APRIL 28, 2026 SESSION — Pending Migrations Applied, Parallel Polish (Mobile / Loading / Deploy Doc)

### Head-developer parallel sprint
Dispatched 3 isolated-worktree agents simultaneously, all returned clean builds, all merged with zero conflicts (deliberate non-overlapping file scopes: page.tsx vs loading/error.tsx vs new doc).

#### Track 1 — Mobile responsive audit on operator pages
- 4 pages fixed, 9 already clean.
- `app/dashboard/my-jobs/page.tsx` — schedule-updated banner dismiss button, multi-day "View" links, "Resume" links upgraded to ≥40×32px touch targets, "Awaiting Approval" badge shortened to fit at 375px.
- `app/dashboard/job-schedule/[id]/work-performed/page.tsx` — Add Hole Entry modal grid: `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`. Cut Area form: `grid-cols-4` → `grid-cols-2 sm:grid-cols-4`.
- `app/dashboard/job-schedule/[id]/job-survey/page.tsx` — 5 segmented water-source pickers were 36px tall (below iOS 44px target); bumped to `min-h-[44px]`.
- Already clean: my-jobs detail, jobsite, in-route, day-complete, standby, utility-waiver, timecard, my-profile, request-time-off, notifications.
- **Pre-existing color bug flagged (not in scope)**: 4 modal close buttons in work-performed (lines 3534, 3699, 3928, 4103) use `text-white hover:bg-white/20` on a white sticky modal header — invisible until hovered.

#### Track 2 — Loading & error boundaries on dashboard routes
- 54 `loading.tsx` files added (custom skeletons for high-traffic routes: jobs/[id], team-profiles, time-off, operator timecard, mobile pages; generic admin/operator templates for the rest).
- 55 `error.tsx` files added (client-component, retry button, "Back to dashboard" link; job detail and operator timecard get tailored back-links).
- Existing loading skeletons preserved on `app/dashboard/admin/`, `admin/billing/`, `admin/customers/`, `admin/schedule-board/`, `admin/timecards/`.
- Skipped intentionally: `app/dashboard/debug/*` (internal tools).

#### Track 3 — Production deployment checklist
- New file [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) at repo root — 9-section launch runbook.
- **26 distinct env vars** found in code; 6 missing from `.env.example`. White-label-critical: `NEXT_PUBLIC_CONTACT_EMAIL`.
- **24 hardcoded "Pontifex" strings** still rendering to customers. Highest-priority offenders:
  - [app/sign/[token]/page.tsx:818](app/sign/[token]/page.tsx:818) — "Powered by Pontifex Industries" on customer signature page
  - [app/error.tsx:59](app/error.tsx:59) and [app/global-error.tsx:136](app/global-error.tsx:136)
  - Single-source-of-truth: [components/landing/brand-config.ts](components/landing/brand-config.ts)
- **Production hazard found**: [app/api/send-email/route.ts:17](app/api/send-email/route.ts:17) hardcodes the old vercel.app domain in SSRF allowlist — must add custom domain before launch.
- **Risk**: [lib/supabase.ts:4-5](lib/supabase.ts:4) and [lib/supabase-admin.ts:36-37](lib/supabase-admin.ts:36) silently fall back to `placeholder.supabase.co` if env vars missing — recommended fail-fast hardening.
- 1130 `console.*` calls (mostly legit catch-blocks); worst offender [lib/database.ts](lib/database.ts) at 27.
- Stale [app/dashboard/admin/schedule-board/page.backup.tsx](app/dashboard/admin/schedule-board/page.backup.tsx) shipping in bundle — delete before launch.
- Vercel project confirmed: `prj_vubQAdrHfAlSq9msk0sfedlBq5zJ`, region `iad1`.

### Migrations applied (start of session)
- `20260427_utility_waiver_fields` — 5 utility_waiver_* columns on job_orders
- `20260427_operator_badges` — table + RLS (admins manage / operators see own).
  - **FK fix during apply**: original migration had `tenant_id REFERENCES auth.users(id)`; corrected to `REFERENCES tenants(id) ON DELETE CASCADE` to match codebase convention. SQL file in repo updated to match what was applied.

### Commits on `claude/sleepy-shannon-95c45b` (pushed to origin)
```
7b77c9b7  Merge: add production deployment checklist (Track 3)
7e383838  Merge: add loading and error boundaries to dashboard routes (Track 2)
54745538  Merge: mobile responsive audit on operator pages (Track 1)
029c76bb  chore: apply pending migrations + fix operator_badges tenant FK
3991407b  feat: add loading and error boundaries to dashboard routes
5ea5e163  docs: add production deployment checklist
3cc84357  fix: mobile responsive audit on operator pages
```

### Pending manual actions
- **Merge `claude/sleepy-shannon-95c45b` → `main`** to deploy to Vercel.
- **Delete test job**: JOB-2026-119492 (WS/TS test job) — use the trash icon on Active Jobs page.
- **Address white-label rebranding TODOs** — see [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) section "White-label rebranding TODOs". Most-visible: customer signature footer.
- **Add custom domain to SSRF allowlist** in [app/api/send-email/route.ts:17](app/api/send-email/route.ts:17) once domain is decided.

---

## APRIL 27, 2026 SESSION — Navigation Cross-Contamination, Auth Fixes, Live Status, Timecard Repairs

### Critical bugs fixed this session

#### 1. Navigation Cross-Contamination (root cause: stale localStorage cache)
- **Problem**: Backspace sent Demo Operator to admin portal; clicking Active Jobs as Super Admin sent to operator dashboard; role state bled between browser tabs when two different users had been logged in.
- **Root cause**: `getCurrentUser()` in `lib/auth.ts` read `supabase-user` from localStorage without verifying that key belonged to the *current* Supabase session. If a previous user's data was cached, the new user inherited the wrong role.
- **Fix 1 — `lib/auth.ts`**: `getCurrentUser()` now cross-validates the `supabase-user` cache against the active `sb-*-auth-token` Supabase session. Mismatched IDs → cache purged → returns null → forces re-auth. `logout()` also clears all `sb-*-auth-token` keys to prevent session bleed.
- **Fix 2 — `lib/hooks/useAuthUser.ts`** (new file): async-safe React hook that calls `supabase.auth.getSession()` as ground truth, enforces `requiredRoles`, and redirects mismatch to the correct dashboard.
- **Fix 3 — page guards**: Admin pages that were doing `!currentUser || !isAdmin()` → single redirect were split: `!currentUser` → `/login`, wrong role → `/dashboard`. Fixed in `schedule-form/page.tsx`, `timecards/page.tsx`.
- **Fix 4 — operator dashboard Active Jobs tile**: Was a plain `div` — clicking it was a no-op then falling through to router. Converted to `Link href="/dashboard/my-jobs"`.

#### 2. Operator Dashboard Redirect
- **Problem**: Super Admin opened `/dashboard` (operator root) instead of `/dashboard/admin`.
- **Fix**: Expanded role check from `if role === 'admin'` to full ADMIN_ROLES array `['super_admin', 'admin', 'operations_manager', 'salesman', 'shop_manager', 'inventory_manager']`.

#### 3. Stale Timecard Blocking Clock-In
- **Problem**: Demo Operator showed "already clocked in" with 34.7 hours — yesterday's open timecard entry was not closed and had no date scope.
- **Fix**: Added `.eq('date', todayStr)` to both the "already clocked in" check in `clock-in/route.ts` and the active timecard query in `current/route.ts`. Added auto-close loop for stale previous-day open timecards (sets `clock_out_time = '{date}T23:59:59'`).

#### 4. Job Daily Assignments Sync
- **Problem**: Demo Operator saw 2 jobs; schedule board showed 1. The `job_daily_assignments` table overrides were not respected in `GET /api/job-orders`.
- **Fix**: `api/job-orders/route.ts` now cross-references `job_daily_assignments` for any non-admin date-scoped query. If a daily override exists and the current user isn't that day's operator → job is excluded. Also added client-side role-based filter on `my-jobs/page.tsx` (non-apprentices only see `assigned_to === uid` jobs).

#### 5. Super Admin "Job Not Found"
- **Problem**: Admin job detail returned 404 for Super Admin because `tenantId = null` caused `.eq('tenant_id', null)` to match nothing.
- **Fix**: All 4 queries in `summary/route.ts` now use conditional `if (tenantId) query.eq('tenant_id', tenantId)`.

#### 6. Real-Time Operator Transparency Panel
- **New**: `GET /api/admin/jobs/[id]/live-status` — polls every 30s from admin job detail. Returns:
  - `status`, `operator_name`, `helper_name`
  - `in_route_at`, `arrived_at`, `work_started_at` (timestamps)
  - `standby_active`, `standby_started_at`, `standby_duration_minutes`
  - `time_on_site_minutes` (computed)
  - `clock_in_time`, `clock_out_time` (today's timecard)
  - `work_performed_today` (array of progress entries)
  - `status_history` (last 20 transitions)
  - Gracefully handles missing optional tables (`standby_logs`, `job_status_history`)

#### 7. Delete Job from Active Jobs
- Added trash icon + confirmation modal on Active Jobs cards. Calls `DELETE /api/admin/jobs/[id]`.

#### 8. Skill-Match Slash Split Fix
- `job.job_type = "WS/TS"` was producing `['ws/ts']` — not found in the scope map. Fixed: `split(/[,/]/)` → correctly produces `['ws', 'ts']`.

### Commits on main (chronological)
```
71501d64  fix: operator my-jobs now matches schedule board assignment
8585e7ad  fix: redirect all admin/management roles from operator dashboard to admin dashboard
daa3960c  fix: resolve TS errors in live-status route + skill-match slash split
2022f937  fix: super_admin Job not found bug + add Live Status panel
52e0c3b6  fix: scope active timecard check to today; auto-close stale open timecards
7cad1ad7  fix: validate getCurrentUser against Supabase session; add useAuthUser hook; clear session on logout
c66b1f7b  fix: admin role-fail redirects and operator back button navigation
3194af26  fix: show approval card based on completion request status not job status
33c2da5c  fix: change past jobs history window from 30 days to 7 days
```

### Pending manual actions
- **Delete test job**: JOB-2026-119492 (WS/TS test job) — use the trash icon on Active Jobs page

### Migrations applied (April 27, late session)
- `20260427_utility_waiver_fields` — 5 utility_waiver_* columns on job_orders
- `20260427_operator_badges` — operator_badges table + RLS (admins manage / operators see own).
  - **FK fix during apply**: original migration had `tenant_id REFERENCES auth.users(id)`; corrected to `REFERENCES tenants(id) ON DELETE CASCADE` to match codebase convention. SQL file in repo updated to match.

### Known remaining issues (low priority)
- Clock-in event isn't persisted across page navigation if user force-navigates mid-flow (timecard state in operator dashboard resets on back-navigation). The underlying timecard row IS correctly saved to DB — this is a display-only race.
- Operator "Active Jobs" stat tile text says "Active Jobs" but links to My Jobs. Consider renaming tile label to "My Jobs" for clarity.

---

## APRIL 26, 2026 SESSION — Operator Workflow, Dark Mode, Time-Off & Attendance, Late Clock-In

### What shipped
- **Work-performed page** — all 28 `alert()` calls replaced with `showNotification()` toast system.
- **Daily-log 403 fix** — assignment check covers helper + admin bypass.
- **Post-submission locked card** — polished success card after Done for Today / Complete Job.
- **Operator past 7-day job history** — My Jobs collapsible "Past 7 Days" section.
- **Green ticket highlights** — emerald/amber status badges on JobTicketCard.
- **"Continuing Tomorrow" section** — My Jobs amber section for multi-day scheduled jobs.
- **Admin job detail — Daily Progress** — per-day cards with gradient badge, hours, work items, operator name.
- **Admin job detail — Operator Notes panel** — notes after submission; type badges amber/emerald/violet.
- **Admin active jobs** — `operator_notes_count` badge on cards.
- **Admin completed jobs** — 4 metric tiles + Operator Notes panel.
- **Schedule board Mark Out** — rose "Mark Out" button → MarkOutModal → creates approved time_off record.
- **Time-off admin page** — 2-tab: Requests + Attendance Metrics (PTO bars, callout counts).
- **PTO balance system** — `operator_pto_balance` table fully wired.
- **Late clock-in tracking** — is_late, late_minutes fully wired; admin fire-and-forget notifications.
- **Team payroll** — 7th "Late Arrivals" summary card + per-operator Late column.
- **Operator detail timecard** — 7th Punctuality metric tile.
- **Stale "Needs Attention" badge fix** — `job_completion_requests` cancelled on Done for Today.

---

## APRIL 24, 2026 SESSION — Jobs UI refresh, Change Orders, Operator Skills

### What shipped
- Active Jobs + Job Detail redesign — light-default, gradient accent bars, 5 metric tiles, 3 tabs
- Change Orders data model + API (`change_orders` table, `CO-NNN` auto-numbering, approve/reject)
- Multi-day progress analytics — `GET /api/admin/jobs/[id]/progress-by-day`
- Summary route 404 fix for Super Admin
- Light-mode factory reset sentinel
- Billing / Completed Jobs / Completed Job Tickets rewritten to light-default
- Schedule form step reorder (Difficulty→5, Scheduling→6, Site Compliance→7)
- Approve Job modal — operator availability panel with date param
- Operator skills taxonomy in `lib/skills-taxonomy.ts` + Skills & Proficiency tab in Team Profiles
- Smart scheduling — per-scope skill used when job service code maps to scope

---

## CURRENT STATE

### Git
- **Branch:** `main`
- **Pushed to origin** ✅
- **Build:** PASSING (0 errors)
- **Localhost**: Restart `npm run dev` to pick up all auth.ts and navigation changes

### Supabase
- **Project ID**: `klatddoyncxidgqtcjnu`
- **100+ tables**, all RLS enabled

### Dev Server
- Preview: `preview_start` / `preview_stop` MCP tools
- Config in `.claude/launch.json`
- If changes don't appear: `lsof -ti:3000 | xargs kill -9`, delete `.next/`, restart

### Vercel
- Auto-deploy: pushes to `main` → production
- **Env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

---

## REMAINING SPRINT TASKS (Week 2)

- [ ] End-to-end workflow test: create job → dispatch → clock-in → work performed → complete → invoice
- [ ] Mobile responsive audit on operator pages
- [ ] Loading states & error handling audit
- [ ] Patriot-specific visual assets (logos, custom colors)
- [ ] Production deployment prep (env vars, custom domain, SSL)
- [ ] Final build verification & merge to main (already on main)
