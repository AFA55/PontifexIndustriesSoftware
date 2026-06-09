# CLAUDE_HANDOFF.md — Pontifex Industries Platform
**Last updated:** Jun 9, 2026 | **Branch:** `main` | **HEAD:** `2f6541a4` (diagnostic) — invite system + Face ID + editable emails + light restyle + email-sender fixes all PUSHED & LIVE (`818f646e`→`799f3180`→`562c3c57`→`6957f784`→`2f6541a4`) | **Production:** ✅ LIVE at pontifexindustries.com | **iOS:** v1.0.2 LIVE on App Store + v1.0.3/Build 8 (Face ID) in TestFlight processing.

> 🔴🔴 **#1 OPEN BLOCKER — INVITE/EMAIL STILL FAILS ON PROD. ROOT CAUSE FOUND, FIX IS A 1-LINE VERCEL EDIT (founder only):**
> The Vercel env var **`RESEND_API_KEY`** (project `pontifex-industries-software-awja`, "Project" tab, added Jan 20, flagged "Needs Attention") has a **MALFORMED VALUE**: it's `RESEND_API_KEY=re_CBn…` — i.e. the variable NAME is glued to the front of the value. So `process.env.RESEND_API_KEY` = `"RESEND_API_KEY=re_CBn…"` → Resend rejects it → every email 502s. **FIX:** Vercel → project → Settings → Environment Variables → RESEND_API_KEY → Edit → set Value to JUST the key (`re_CBn…`, no `RESEND_API_KEY=` prefix; clean value is in `.env.local`) → Save → Redeploy. Claude is HARD-BLOCKED from entering API keys into fields, so this last paste is founder-only. After it works: **revert the temp diagnostic in `2f6541a4`** (the EMAIL DIAG logging + raw-error response in `app/api/admin/invite/route.ts` POST+PUT handlers).

> ⚠️ **VERCEL BUDGET: ~5 builds spent this session — credit near/at zero. CONFIRM before any push.**

---

## ⚡ START HERE (Jun 8, 2026) — Invite system, Face ID Build 8, editable emails, EMAIL FIX — ✅ ALL LIVE

Big session. Everything below is **pushed to prod and verified READY**. 4 guardians ran (all PASS). Migrations applied.

### 1. 🔴 EMAIL SENDER FIX (the big one — was silently breaking ALL outbound email)
- **Root cause:** the ONLY verified Resend domain is **`admin.pontifexindustries.com`**. The root `pontifexindustries.com` is **NOT verified** → Resend `403 "domain is not verified"`. The Vercel env var `RESEND_FROM_EMAIL` was set to the unverified root, and ~9 email routes read it first → **every** email (invites, password resets, invoices, demo, PDFs) 403-failed.
- **Fix (code, bypasses the bad env var entirely):** `lib/email.ts` now exports `VERIFIED_EMAIL_DOMAIN` + `DEFAULT_EMAIL_FROM` (single source of truth = `admin.pontifexindustries.com`). Every sender uses it; `RESEND_FROM_EMAIL` is **no longer read anywhere** (grep: comments only). Reproduced + verified via a Node script with the real key (admin→external = success; root→403).
- **Vercel MCP is read/deploy-only — NO env-var tool.** The stale `RESEND_FROM_EMAIL` env var is now unused/harmless; founder can delete it in the dashboard. Full gotcha saved to `memory/resend-verified-domain.md`.

### 2. User INVITE system (admin onboards crew) — built + guardian-hardened
- Admin → **Team → Invite Users** (`/dashboard/admin/team/invite`, sidebar item for admin/ops/super) → email + name + role → emailed setup link → `/setup-account?token=…` → photo + password (twice) → active with correct role/tenant.
- **Guardian caught 3 BLOCKING (all fixed + re-verified PASS):** cross-tenant account-takeover (global email check both seams), two-pass profile upsert (core role/tenant never blocked by missing optional columns), non-unique token. Plus CSPRNG tokens, post-onboarding token rotation, rank-escalation guard.
- Migrations applied: `20260608_invite_flow_columns` (user_invitations cols + tenant-admin RLS), `20260608_profile_setup_columns`, `20260608_invite_token_unique`.

### 3. Editable TEAM EMAILS (admin/ops/super) — guardian PASS
- Team Profiles → Edit Info → Email is now an editable input (was display-only). Backend (`/api/admin/profiles/[id]` PATCH) syncs `auth.users` + `profiles`, tenant-scoped, rank-guarded, global case-insensitive uniqueness, auth-first with revert-on-desync. Migration `20260608_profiles_email_lower_key` applied (verified 0 dup emails first).

### 4. Light-mode restyle — invite + setup-account pages were hardcoded dark (`bg-gray-950`) → converted to light-default + `dark:` variants (matched completed-jobs palette). Styling-only.

### 5. Login/branding/demo fixes
- **Branding flash fix:** `/login` no longer falls back to the global Patriot-defaulted context (`lib/branding-context.tsx` default `login_welcome_text` → "Welcome Back"; login page uses `tenantBranding || {}`). Each company sees only its own brand — no "pops Patriot first."
- **Demo logins:** `admin@pontifex.com` restored to `PontifexDemo2026!`; **new super-admin demo `superadmin@pontifex.com` / `PontifexDemo2026!`** (PONTIFEX → Hub).
- **Google Maps console errors** = stale `.next` (GoogleMapsProvider was already off public pages); clean restart fixed.

### 6. iOS Build 8 / v1.0.3 — Face ID — uploaded to TestFlight
- Native Face ID (`lib/biometric.ts` + login button, `@capgo/capacitor-native-biometric@8.4.5`, NSFaceIDUsageDescription) was committed last session; this session bumped to **1.0.3 / Build 8**, archived (manual signing, "Pontifex App Store Distribution" profile — NOT automatic), exported IPA, uploaded via **Transporter** (user clicked DELIVER). Now **processing in App Store Connect → TestFlight**. First login is password (silently saves to Keychain); subsequent logins show "Sign in with Face ID". ⚠️ Apple **License Agreement** needed re-accepting (founder did/should).

### ⏭️ Immediate next / open
- **Test:** resend Adam Ingalls' invite from prod (real crew onboarding test) → confirm email lands + onboarding works.
- **Founder:** install Build 8 from TestFlight → test Face ID on device; optionally delete the unused `RESEND_FROM_EMAIL` Vercel env var; optionally verify the root domain in Resend for cleaner `@pontifexindustries.com` sends.
- Other email routes (invoices/demo/PDFs) now fixed in code but **untested live** — exercise them when convenient.

---

> 🧰 **New:** `DEV_TOOLING_RECOMMENDATIONS.md` — ranked, popularity-verified plan to speed up dev & prevent recurring bugs (date lib + Sentry + Zod + TanStack Query + RHF + shadcn + tests). Phased, additive, no big-bang. Phase A (date lib + Sentry) is the highest-ROI next step.

---

## 📋 NEXT SESSION — Fine-Tuning & Productization phase (READ THESE FIRST)
We're shifting from feature-building to **fine-tuning + productizing**. The plan is split across detailed MD docs (created Jun 3) — execute in roughly this order:

1. **`PHASE_A_KICKOFF.md`** ⭐ — date lib + `lib/dates.ts` (kills the date-bug class), Sentry (prod error visibility), the global mobile CSS fixes, first Vitest test. Highest ROI, lowest risk. **Do first.**
2. **`MOBILE_RESPONSIVE_AUDIT.md`** — the "zoomed in" fix: global root cause (`-webkit-text-size-adjust` + 16px input floor + `pt-safe`/`pb-safe`) then per-page operator/admin fixes (worst: timecard table, day-complete signature scaling, `JobDetailView` max-w-6xl + dark mode, both NotificationBells). Global fixes overlap Phase A §A3.
3. **`SEO_HOMEPAGE_PLAN.md`** (+ `SEO_PLAN.md`) — rewrite homepage to the **custom-software + agentic-automations** positioning (still says "concrete cutting"); add robots/sitemap/OG/JSON-LD; server-render the homepage; build the Patriot case-study page; pricing→consultation redirect.
4. **`PRODUCTIZATION_PLAYBOOK.md`** — make the base **plug-and-play**: document feature modules (`FEATURE_CATALOG.md`), turn `tenants.features` into a per-tenant module switchboard, build a super-admin module toggle + `scripts/new-tenant.ts` onboarding. Patriot stays the proven base; new clients = config + branding + selected modules.
5. **`BACKUP_AND_CLOUD_STRATEGY.md`** — never lose data: tag releases + branch-protect `main` + monthly repo bundle; **🔴 confirm/upgrade Supabase plan for daily backups/PITR**; weekly `pg_dump` + storage-bucket sync to offsite cloud (S3/B2/Drive); do a restore drill.

**Founder action items surfaced:** Supabase backup plan (above); pick an offsite cloud target; later GBP/local-SEO setup.

> **💰 VERCEL BUDGET: ~$1 build credit remaining.** Every `git push origin main` = ~$1–2 billed build. BATCH and push ONCE per session. See `DEPLOYMENT_COST.md`.

---

## ⚡ START HERE (Jun 5, 2026 — PART 3) — Module gating ACTIVATED (sidebar, default-ON) — ⚠️ build green, guardian PASS, ONE push pending

The productization switchboard now actually DOES something — but safely (the "gentle first step": UI/sidebar gating before API gating). Builder + guardian (guardian caught a blocking tsc bug — fixed). `tsc` clean, build green, 846 tests pass. **Verified against live data: nothing hides for Patriot/Apex.** Not pushed yet.
- **`lib/require-module.ts`** (NEW) — opt-in SERVER guard for FUTURE/new routes (resolves tenant → reads `tenants.features` → `isModuleEnabled`). **Currently UNUSED** (applied to no existing route) and **fails OPEN** on any error (never locks a tenant out on a DB hiccup). Apply to NEW non-core routes only, later.
- **Client gets `tenants.features`** — `/api/admin/branding` now additively returns the caller's tenant `features` (best-effort, fail-safe `{}`); `lib/branding-context.tsx` exposes `branding.features` (5-min cached).
- **Sidebar gating** — `DashboardSidebar.tsx` nav items gained an optional `moduleKey`; an item hides only when `item.moduleKey && !isModuleEnabled(moduleKey, branding.features)` — i.e. ONLY when an admin has explicitly set that module `false` in the switchboard. AND-ed with the existing per-user `flagKey`/role checks. **17 non-core items mapped** (Schedule Board/Form→scheduling, Timecards/TimeOff→timecards, Customers→customer_crm, Invoicing→billing, Completed Jobs→completed_jobs, Facilities→facilities_badging, NFC→nfc, Form Builder→customer_portal, Equipment/Fleet→equipment_fleet, Inventory→inventory_control, Maintenance→maintenance, Site Visits→supervisor_visits, Analytics→analytics). **Core items NEVER gated** (Active Jobs, Team Profiles, Settings, Notifications, subscription Billing, PLATFORM section, My-Account).
- **Why safe:** `isModuleEnabled` default-ON (absent/unknown/core ⇒ true); Patriot/Apex have ZERO `false` values (their stored keys are all `true`, and canonical keys for unmapped modules are absent ⇒ default-on). So every item still shows until someone toggles. The switchboard writes CANONICAL keys, which the sidebar reads (canonical-first lookup), so toggles work going forward.
- **Per-page guard DONE (commit after 9df2b0c4):** `components/ModuleGuard.tsx` (`useModuleGate(moduleKey)` hook + `<ModuleGuard>` wrapper) applied to all 17 module pages — a direct URL to a disabled module now shows a friendly "not enabled for your account" card instead of loading. Default-ON + no-flash-during-load + fail-open; guardian verified hook-order safe on every page; nothing blocks for Patriot/Apex (zero false values). So nav (sidebar) AND deep-links are both gated now.
- **Still NOT done (next phase, separately reviewed):** API enforcement — apply `requireModule` to non-core API routes so a disabled module's DATA is blocked server-side too (UI/page gating is done; the API still serves data on a direct call). No migrations.

---

## ⚡ START HERE (Jun 5, 2026 — PART 2) — Pontifex Platform Console + Subsistence nights — ✅ DEPLOYED

Parallel agents (4 builders) + TWO architecture-guardians (platform-security + payroll). **`tsc` clean, build green, 846 tests pass.** Platform guardian caught a blocking bug (fixed). Plans: `PLATFORM_CONSOLE_PLAN.md`, `SUBSISTENCE_NIGHTS_PLAN.md`. Not pushed yet.

**PONTIFEX PLATFORM CONSOLE** (super-admin control plane for the platform owner, distinct from a client's admin dashboard) — activates the productization scaffold.
- New area **`/dashboard/platform/*`** (super_admin-only, slate/amber "PONTIFEX PLATFORM" shell), reachable from a new sidebar PLATFORM section. Old `/dashboard/admin/tenant-management` now redirects there.
- **Tenants list** (per-card #users + #modules + drill-in) → **Tenant detail** tabs: Overview (branding/plan/limits/status; company_code+slug READ-ONLY), **Users** (list/add-invite/role-change/deactivate per client), **Modules** (the switchboard), Billing (deep-link). **Create tenant** flow (company_code validated, modules, optional first-admin).
- New cross-tenant APIs: `GET/POST /api/admin/platform/tenants/[id]/users`, `PATCH /[userId]`. **Security invariant: every platform write takes an EXPLICIT target tenantId (path param), never the caller's tenant; user PATCH re-asserts target.tenant_id===[id].** `lib/tenant-onboarding.ts` extracted (shared by the create API + `scripts/new-tenant.ts`).
- **Guard rails (server-side):** Patriot (`ee3d8081…`) can't be suspended/cancelled (PATCH **and** DELETE — the DELETE gap was the guardian's blocking catch, now fixed); can't zero out the last active tenant; can't disable `core` modules (stripped from features PATCH); can't demote/deactivate the last admin or yourself.
- **MODULE SWITCHBOARD IS WRITE-ONLY** — toggling records intent in `tenants.features`; **nothing gates on it yet** (Patriot/Apex keep everything). Activating `requireModule()` gating on NEW routes only is the deliberate next phase (`lib/features.ts` still scaffold). **No migrations** for v1.
- Known: `grant-super-admin` route's audit insert uses wrong columns (`actor_id`/`target_id` vs real `user_id`/`resource_*`) — pre-existing, silently failing, spun off as a background task. New routes use the correct columns.

**SUBSISTENCE NIGHTS** (per-diem for out-of-town overnight stays).
- Operator self-reports at **day-complete** — a one-tap "Did you stay overnight?" shown ONLY on out-of-town jobs (`job.scheduling_flexibility->>'out_of_town'`; the answer rides the existing daily-log POST, fire-and-forget so it can't fail day-complete; server re-derives out_of_town, never trusts client).
- New table `subsistence_nights` `UNIQUE(operator_id, night_date)` (one night/operator/day; idempotent upsert; "No" deletes a prior yes). tenant_id + RLS. **OT-EXEMPT** — separate table, `calculateWeekSummary` hour/OT math untouched.
- **Configurable rate:** `timecard_settings_v2.subsistence_rate` (default 0 = count-only) on the timecard settings page; payroll auto-shows nights × rate when > 0.
- Surfaces: Team Payroll per-operator chip (count + $), operator-detail "Subsistence" tile with admin +/- override (`/api/admin/subsistence-nights` GET/POST/DELETE, requireAdmin).
- Note (guardian nit, pre-existing): `operator/[id]/page.tsx` `getWeekStart/getWeekEnd` use UTC `toISOString().split` (recurring date-bug class) — low impact, migrate to `lib/dates` in a follow-up.

**⚠️ NO App Store resubmission** — all web/server-side. Migrations applied (additive): `subsistence_nights` + `timecard_settings_v2.subsistence_rate`.

---

## ⚡ START HERE (Jun 5, 2026) — Timecard: configurable late + no-show + holidays (+ settings-persistence bug fix) — ✅ DEPLOYED

Parallel agents + architecture-guardian (the guardian caught a real blocking bug — see below). **`tsc` clean, build green, 846 tests pass, guardian VERDICT: PASS** (after the 1 fix). Not pushed yet. Plan: `TIMECARD_SETTINGS_PLAN.md`. Decisions: late = grace-minutes-after-scheduled-start; holiday pay = hourly field+shop roles, OT-exempt.

**Migrations applied to prod (additive, files in `supabase/migrations/20260605_*`):** `timecard_settings_v2.late_grace_minutes int default 15`; partial unique indexes `timecards_one_no_show_per_day` + `timecards_one_holiday_per_day`; new RLS table `company_holidays`.

**🔴 IMPORTANT infra finding — settings-persistence bug FIXED.** There are TWO settings tables: `timecard_settings` (legacy key/value, 20 rows) and **`timecard_settings_v2` (flat columns, the ACTIVE store clock-in/out read).** The dedicated settings page (`settings/timecard/page.tsx`) was saving flat fields to the key/value table → **writes silently failed → settings only lived in localStorage and never affected clock-in.** Fixed: `timecard-settings/route.ts` repointed to v2 with a page↔v2 column mapping (`require_nfc`→`require_nfc_clock_in`, `overtime_threshold`→`overtime_threshold_weekly`, `auto_clock_out`→`auto_clock_out_hours`, rest 1:1). Now the settings page actually persists. **Guardian-caught blocking bug:** clock-in selected `require_nfc` (nonexistent col) from v2 → 42703 → whole row null → late_grace never read; fixed by aliasing `require_nfc:require_nfc_clock_in` in the select (`clock-in/route.ts:117`).

**Feature 1 — configurable LATE threshold:** `late_grace_minutes` setting (default 15) on the timecard settings page ("Attendance & Punctuality" card). Clock-in flags late when `clockIn − scheduledStart ≥ grace` (scheduled start = `job_orders.shop_arrival_time`/`arrival_time`, same source as reminders). Writes existing `is_late`/`late_minutes`; management dashboard + punctuality tile already render them.

**Feature 2 — NO-SHOW button:** new `POST/DELETE /api/admin/timecards/no-show`. Writes a 0-hour timecard row (`entry_type='no_call_no_show'`, `hour_type='no_show'`) so it shows on the payroll grid + operator detail, AND idempotently upserts `operator_time_off` (no_show) so it converges with the schedule-board "Mark Out" (one row per operator/day, callout_count bumped once). Buttons: Team Payroll row action + day-cell chip (desktop + mobile card) + operator-detail empty-day quick action. Idempotent (pre-check + partial unique index).

**Feature 3 — HOLIDAY settings:** new `company_holidays` table + `/api/admin/company-holidays` (GET/POST/PATCH/DELETE) + `[id]/apply` (idempotent). New `settings/holidays` page (add/edit dates, per-day pay hours, applies_to all/field/shop, per-row "Apply"). "Apply" creates holiday-pay timecard rows (`entry_type='holiday'`, hours=pay_hours) for eligible roles only — **field=operator/apprentice, shop=shop_manager/shop_help, all=both** (role-based; `profiles.work_location` doesn't exist). **OT-exempt:** `lib/timecard-utils.calculateWeekSummary` now excludes holiday hours from the 40-hr OT base (+ a `holidayHours` bucket); holiday-only, behavior-preserving (0 holiday rows today). Settings-hub link added on `settings/page.tsx`.

**⚠️ NO App Store resubmission** — all server-side/web. Founder open items from the plan (`TIMECARD_SETTINGS_PLAN.md §5`): later consolidate the two settings tables onto v2 (the key/value one is now bypassed); optional holiday-apply cron; whether schedule-board Mark-Out should also create the timecard no-show row.

---

## ⚡ START HERE (Jun 4–5, 2026) — Smart clock reminders + productization scaffold + backup — ✅ DEPLOYED

Executive-engineer batch using parallel agents + an **architecture-guardian** review (the user's requested oversight agent). Backup taken first. **`npm run build` green, `tsc` clean, 846 Jest tests pass, guardian VERDICT: PASS (0 blocking).** Not pushed yet.

**Safety backup (founder's "make a duplicate"):** `~/Documents/Pontifex-Backups/pontifex-platform-2026-06-04.bundle` (288 MB, full history, `git bundle verify` OK, no secrets — `.env.local` is gitignored). Restore: `git clone <bundle> restored-repo`.

**SMART CLOCK-IN/OUT REMINDERS (deploys this batch).** Big finding: ~90% already existed (a `*/5` `clock-in-reminders` cron, `sendReminderOnce` dedup via `reminder_log`, tz window math in `lib/reminder-timing.ts`). We did NOT rebuild it — we closed 4 gaps. See `SMART_CLOCK_REMINDERS_PLAN.md`.
- **Start-time source:** the schedule FORM now writes `job_orders.arrival_time` (the cron already read it; the form previously buried the time in `scheduling_flexibility` JSON the cron couldn't see). New "Crew Start Time" `<input type=time>` in Step 5 of `schedule-form/page.tsx` → payload + edit PATCH → persisted in `schedule-form/route.ts`. `arrival_time` is **TEXT** (verified) — write "HH:MM", never `ALTER TYPE`.
- **Clock-IN cron smarter** (`app/api/cron/clock-in-reminders/route.ts`): added PTO/time-off skip (`operator_time_off`) + default-start-time fallback (`tenants.default_start_time`, new col, default `'07:00'`) so a job with no time still reminds. Existing pre/post (±5 min) windows for jobs WITH a time are unchanged → founder's "remind 5 min after start" works once a start time is set.
- **Clock-OUT cron NEW** (`app/api/cron/clock-out-reminders/route.ts`, `*/15` in `vercel.json`): 10h/12h/15h after clock-in. "Highest threshold crossed" + `reminder_log` dedup keyed `clock_out_<10h|12h|15h>:<clock-in date>` → never spams, survives a missed tick + midnight on night shifts. Reuses APNs/in-app via `sendReminderOnce`.
- **Migration** `supabase/migrations/20260604_clock_reminders.sql` (applied to prod via MCP): `tenants.default_start_time time default '07:00'` + partial index on `job_orders(tenant_id, scheduled_date) where arrival_time is not null`. Additive only.
- **Scope decisions (executive):** default 07:00 (tenant-configurable), helpers still get reminders, no quiet-hours v1, reuse `clock_in_reminder` pref toggle, **deferred** the night-shift form toggle (clock-out uses `timecards.is_night_shift` which already exists). 7 founder open-questions are in the plan §7.
- **Guardian nits (non-blocking, dormant):** clock-out shares the `clock_in_reminder` pref toggle; the PTO-skip's `.eq('tenant_id')` would miss a PTO row with NULL tenant_id (table is empty today); clock-out selects `timezone` but doesn't use it. None block.
- **⚠️ NO App Store resubmission needed** — this is server-side cron + existing APNs push; it ships via the WEB deploy and reaches the iOS app automatically.

**PRODUCTIZATION SCAFFOLD (additive, nothing activated — sell-to-other-companies foundation).** Chosen approach: feature-catalog + per-tenant switchboard, NO file moves. See `FEATURE_CATALOG.md` (24 modules mapped → files/tables/gating) + `PRODUCTIZATION_SWITCHBOARD_PLAN.md`.
- Key finding: 4 gating layers exist but only 2 are live (`user_feature_flags` nav gate + `lib/rbac.ts` cards). **`tenants.features` jsonb is stored/editable (`PATCH /api/admin/tenants/[id]` already allows it) but read by NO gate today** → the switchboard activates it with zero behavior change. A 2nd tenant (`APEX`) already exists.
- **`lib/features.ts`** (NEW, data-only, nothing gates on it yet): canonical 24-module registry + `ModuleKey` + `LEGACY_ALIASES` + a provided-but-unwired `isModuleEnabled()`. `defaultOn:true` everywhere + 5 `core` modules (jobs, notifications, team_management, subscription_billing, daily_reports) → Patriot keeps everything.
- **`scripts/new-tenant.ts`** (NEW, NOT wired to run): onboarding scaffold — inserts tenant + branding + first admin; hard guards refuse to touch PATRIOT (code/slug/id). Review before first use.
- **Next to ACTIVATE productization (separate session):** build the super-admin Module Switchboard UI that reads/writes `tenants.features` via the existing PATCH, then opt-in `requireModule()` on NEW non-core routes only. Default-ON rollout. See the plan's risk section.

**⚠️ Stale worktrees:** `.claude/worktrees/` still has ~95 locked trees inflating Jest (71 suites incl. dupes) — clean when convenient (don't nuke unmerged ones blindly).

---

## ⚡ START HERE (Jun 4, 2026) — Phase A foundation + mobile responsive + web Face ID/Remember-Me — ✅ DEPLOYED

Fine-tuning batch. Everything additive, behavior-preserving. **`npm run build` green (33.8s, 91 pages), `tsc --noEmit` exit 0, 12 date tests pass.** Verified the headline "zoomed in" fix in a live browser at 390px. **Not committed/pushed yet — awaiting the single Vercel push.**

**Phase A foundation (from `PHASE_A_KICKOFF.md`):**
- **`lib/dates.ts`** (NEW) — centralized date module that kills the recurring UTC/local off-by-one bug class (the "Zack: Jun 1 → Sun May 31" class). Exports `toLocalYMD`, `parseYMDLocal`, `formatDay`/`formatDayLong`/`dayName`/`dayNameShort`, `mondayOf`, `weekDatesFrom`, `weekDatesMonSun`, `formatTime`. `dayjs` (already installed) wired with utc+timezone plugins for future use. `lib/timecard-utils.ts` now **delegates** its date helpers to `lib/dates.ts` (single source of truth; all existing imports preserved).
- **`lib/dates.test.ts`** (NEW) — 12 Jest tests locking "2026-06-01 = Monday, shows 'Mon, Jun 1'" + Mon–Sun week ranges + previous-week offset. **NOTE: we use the EXISTING Jest setup (6 prior test files) — did NOT add Vitest (PHASE_A_KICKOFF.md was wrong that there were "zero tests").**
- **Sentry** — `@sentry/nextjs@^9` installed; `instrumentation.ts` (server/edge) + `instrumentation-client.ts` (client) + `withSentryConfig` wrapper in `next.config.js`. **FULLY GATED**: no DSN = complete no-op (zero behavior change); source-map upload gated on `SENTRY_AUTH_TOKEN`. Build stays green with nothing set. **🔴 FOUNDER: set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (+ optional `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`) in Vercel production to switch on prod error visibility.**

**Global mobile CSS (`app/globals.css`) — the actual fix for "looks zoomed in on smaller iPhone":**
- Added `-webkit-text-size-adjust:100%` to `html` (stops iOS auto text-inflation). **Verified live: computes to 100%.**
- iOS focus-zoom guard: base `input,textarea,select{font-size:16px}` PLUS a **mobile `@media (max-width:639px){ ... !important }`** floor. The `!important` is REQUIRED — a bare element selector loses to Tailwind `text-sm` (specificity), so the company-code input (first field everyone touches) was still 14px and still zoomed. **Verified live at 390px: now 16px on mobile, keeps `text-sm` (14px) on desktop ≥640px.**
- Added `.safe-area-pb` alias (was a dead class at daily-report:488 → zero home-indicator clearance).

**Per-page mobile fixes (4 parallel agents, disjoint files — real paths, audit doc had stale paths missing `admin/`):**
- **`app/dashboard/timecard/page.tsx`** — the 2nd wide `<table>` now `hidden sm:block` with a new `sm:hidden` card-per-entry block (no side-scroll at 390px); ~22 sub-14px text classes bumped to ≥`text-xs` (table body `text-sm`); Request-Correction button `min-h-[44px]`.
- **Operator safe-area** — `pt-safe`/`pt-safe-3` added to sticky headers on `job-schedule/[id]/day-complete`, `job-schedule/[id]/work-performed`, `my-jobs/[id]/jobsite`, `my-jobs/page`, `my-profile`, `daily-report`; bottom CTAs `pb-6`→`pb-safe`; `text-sm` textareas → `text-base sm:text-sm`.
- **`day-complete` signature canvas (functional, customer-facing)** — draw handlers now SCALE pointer coords to the 600×160 backing buffer (`scaleX=canvas.width/rect.width`, etc.) in both start + move; ink now tracks the finger 1:1 (was offset/compressed).
- **Admin dark/light + reflow** — `JobDetailView.tsx` got full `dark:` pairs (was white-only in dark) + `flex-col sm:flex-row` reflow + cut/hole tables wrapped in `overflow-x-auto`; **both** NotificationBells fixed (admin one was white-only in dark; `components/NotificationBell.tsx` was dark-only on the now-light shell → inverted to light-base + `dark:`); scope inputs `grid-cols-4`→`grid-cols-2 sm:grid-cols-4` + `text-base sm:text-lg` w/ suffix padding; `ScheduleDatePicker` width `w-[min(340px,calc(100vw-2rem))]` + dark pairs; `DashboardSidebar` drawer close button → 44px tap target.

**Auth UX — web Face ID + Remember Me (NO native build, App-Store-safe):** `app/login/page.tsx` already used react-hook-form with a real `<form>` + a remember checkbox. Hardened for **iOS Password AutoFill** (the key icon → Face ID → fills saved password): email now `autoComplete="username"` + `id`/`autoCapitalize=none`/`autoCorrect=off`/`inputMode=email`; password `id="password"` + `current-password`; "Remember me" defaults CHECKED, persisted to `localStorage['pontifex.rememberMe']`. **Supabase client config UNTOUCHED.** `company-login` needs no change. **A true native Face-ID launch-gate (Capacitor biometric plugin → new iOS build) was deliberately deferred** to a later App-Store-gated batch.

**Architecture-safety decisions made this session:** used existing Jest (not Vitest); dayjs was already installed; Sentry fully DSN-gated; agents ran in the MAIN repo (not worktrees) on disjoint files → no 81GB disk risk this session. **Pre-existing: 85 stale `locked` agent worktrees (377MB) with uncommitted changes from prior sessions remain — left untouched (don't nuke unmerged work); clean up when convenient via per-tree `git worktree unlock`+`remove` after verifying each is abandoned.**

**Password reset ("submitted email, got no reset email") — ROOT-CAUSED + FIXED (commit `<reset>`):**
- **Diagnosis (from 14 days of Vercel prod logs):** the forgot-password route NEVER reached the email-send step — `"Sending email to"` had 0 occurrences. It early-returned at the profile lookup. Root cause: `app/forgot-password/page.tsx` email input lacked `autoCapitalize="none"`, so mobile iOS auto-capitalized the first letter ("Zack@…"); the route's `.eq('email', email).single()` is **case-sensitive** (all 25 stored emails are lowercase) → no match → silent fake-success, no email. (`generateLink` also had no `redirectTo` → latent broken-link bug.)
- **Fixes:** `app/api/auth/forgot-password/route.ts` rewritten — normalize `email.trim().toLowerCase()`, match `.ilike()` + `.maybeSingle()` (no throw on 0 rows), add `redirectTo: ${APP_URL}/update-password` to `generateLink`, and **surface real failures to Sentry** (was silently swallowed — that's why this went unnoticed). Kept the generic enumeration-safe client message. `app/forgot-password/page.tsx` — added `autoCapitalize=none`/`autoCorrect=off`/`inputMode=email` to the email input.
- **VERIFIED end-to-end locally** against real Supabase: POST `"  Admin@Pontifex.com  "` → normalized → `✅ Reset link generated` → `✅ Email sent successfully via Resend! (Email ID …)`. **So Resend IS configured + working** — the prod failure was purely the email-normalization bug, NOT a missing key. Bogus email → enumeration-safe early return. `npm run build` green.
- **🔴 FOUNDER must verify (I can't from here):** (1) `RESEND_API_KEY` set in **Vercel prod** (confirmed working locally; prod env may differ); (2) Resend sending domain `pontifexindustries.com` **verified** (SPF/DKIM/DMARC) — else mail lands in spam/bounces; (3) **Supabase Auth → URL Configuration → Redirect URLs** includes `https://www.pontifexindustries.com/update-password` (or `https://www.pontifexindustries.com/**`) — otherwise Supabase ignores `redirectTo` and the reset link lands on the homepage with no session → "Invalid Reset Link." This is the next thing a user would hit after the email starts arriving.

**✅ DEPLOYED Jun 4** — commits `3bbf2704` (Phase A + mobile + auth-UX) + `5dc04f77` (password-reset fix) pushed to origin/main → Vercel `dpl_7spEQmZv…` **READY/live** (~116s build; longer than usual because Sentry's webpack plugin instruments the build). Live on prod + in the iOS app via webview.

---

## ⚡ START HERE (Jun 3, 2026) — 1.0.1 LIVE, web batch deployed, 1.0.2 submitted, disk fixed, timecard date bug

**iOS:**
- **v1.0.1 (Build 6) was APPROVED and auto-released** — the new dark purple-P icon + splash are **LIVE on the App Store** (verified via `itunes.apple.com/lookup?id=6772996692` → version 1.0.1, and the live 512px artwork is the purple-P).
- **v1.0.2 (Build 7) SUBMITTED for review** — its only purpose was to swap the **leaky App Store screenshots** (old ones showed real customer "Harper General CONTRACTORS") for 3 clean demo-tenant shots (login · schedule board · dashboard). Flow: bumped `MARKETING_VERSION 1.0.1→1.0.2` + `CURRENT_PROJECT_VERSION 6→7`, archived/exported, delivered Build 7 via Transporter, created 1.0.2 in ASC, **deleted leaky shots in Media Manager → uploaded the 3 clean 1320×2868 (6.9″ master; all other sizes inherit)**, filled What's New, attached Build 7, **Submitted**. Status: **1.0.2 Waiting for Review**.
  - **Screenshot gotcha:** the 3 shots are **1320×2868 = 6.9″ size**. They MUST go in the **iPhone 6.9″ Display** slot (Media Manager); the 6.5″ slot rejects them ("dimensions wrong" → 1242×2688/1284×2778). Once 6.9″ is set, 6.5″/6.3″ inherit automatically. **ASC `file_upload` MCP tool only accepts session-attached files** — had to drive the **native file picker** (Choose File → `osascript` Cmd+Shift+G + paste folder path + Cmd+A select-all + Open), with Chrome activated so the panel is frontmost. Clean shots live in `/tmp/appstore-0{1,2,3}-*.png`.

**Web (deployed `fecd216d` → Vercel READY, live on prod + in the app via webview — no App Store action needed):**
- **Animated launch intro** — new `components/SplashIntro.tsx` faithfully ports `splash-demo-v4.html` (self-drawing bridge-P, purple→red gradient, data pulse, wordmark), plays once per launch (sessionStorage) on `#1e1b4b`, then fades into `/company-login`. **Removed `autoFocus`** on the company-code input → no more keyboard auto-pop on launch.
- **Mobile responsiveness** — timecards/payroll page: phone view now a **card-per-operator** (7-day row fits, no horizontal scroll) + fixed light-grey dark-mode header → `#120a24`; visit-report step 1 fields fit; schedule-form Customer step (search + New Customer stack, Save & Exit not clipped, long names truncate); CalendarPicker date truncates.

**Operator timecard DATE BUG fixed (this session — ⚠️ UNCOMMITTED, needs commit+push):**
- **Symptom (reported by operator Zack):** clocked in Jun 1/2/3 but the card showed entries as the **31st = Sunday** with weekdays mismatched.
- **Root cause:** date-only strings (`'YYYY-MM-DD'`) parsed as **UTC** then rendered/compared in **local** time. In US (UTC-4/-5), `new Date('2026-06-01')` = May 31 evening local → "Sun, May 31". Plus `weekDays` mixed `toISOString()` (UTC) for entry-matching with `getDate()` (local) for display → entries shifted a day.
- **Fix:** `app/dashboard/timecard/page.tsx` — added `toLocalDateStr(d)` (local Y-M-D), used it everywhere instead of `toISOString().split('T')[0]` (lines for the week-range query, today, weekDays `dateStr`, isToday, PDF mondayStr); `formatDate` now appends `'T00:00:00'` for bare dates so they parse local. `lib/timecard-utils.ts` — `getWeekDates` + `getMondayOfWeek` now emit LOCAL Y-M-D (were UTC). tsc green. **Single-tenant US: device-local == tenant TZ, so this fully resolves it.** (Future multi-TZ robustness: thread the tenant timezone to the client — not needed yet.)
- **DONE:** committed `cefd3e85`, pushed, Vercel deploy `dpl_6LibXxqV…` **READY** → **live on prod + in the app** (webview). Zack's dates now line up.

---

## ⚡ START HERE (Jun 1, 2026 — PART 2) — iOS v1.0.1 (Build 6) SUBMITTED ✅

Apple approved the app, then Claude shipped the new-brand Build 6 **end-to-end via Mac + browser automation**: archived → exported signed IPA → delivered via Transporter → created the 1.0.1 version in App Store Connect → attached Build 6 → filled "What's New" → **Submitted for Review**. ASC status: **1.0.1 Waiting for Review**. Email will arrive when review completes (≤48h).

**Key gotcha solved:** first delivery as **1.0.0** failed with `409 Invalid Pre-Release Train — '1.0.0' is closed` (1.0.0 was already Ready for Sale, so Apple locks new builds to it). Fix = bump `MARKETING_VERSION 1.0.0 → 1.0.1` (`43ccb13c`), re-archive, deliver as 1.0.1. **Any future App Store change needs a new version number.**

**What shipped in Build 6 (v1.0.1):**
- **App icon** → dark `#120A24` tile + brightened purple→pink→rose **P**. Opaque (`hasAlpha: false`). Verified by extracting from the signed archive AND in ASC "Included Assets → App Icon".
- **Splash** → white P on `#1e1b4b`. **Launch white-flash killed** (LaunchScreen + webview + splash all `#1e1b4b`).
- **Smooth fade** → `launchShowDuration: 1200` + `launchFadeOutDuration: 600` (`launchAutoHide` stays true → no hang).
- "What's New" text: *"Refreshed app icon and a smoother, polished launch experience. Plus minor performance improvements and bug fixes."*

**How it was automated (for next time):**
- Archive/export: `xcodebuild ... archive` + `-exportArchive` with `/tmp/ExportOptions.plist` (method `app-store-connect`, manual signing, profile "Pontifex App Store Distribution"). Render assets: `assets/logo-concepts/render-native-assets.mjs`.
- Upload: **Transporter.app** (already signed in as andresafa55@icloud.com). Drove it via `osascript` (menu/AX) + **`cliclick`** for coordinate clicks (System Events `click at` is blocked by assistive-access; cliclick works). Transporter's list thumbnail shows a **cached old icon** — ignore it; the binary is correct.
- ASC submission: **Claude-in-Chrome** on the user's logged-in session (Claude can't enter the Apple ID password — user logs in, then Claude drives the rest).

**🟡 Pending:** wait for Apple review result (email). If approved, release. Local commits `11ccb96a` + `43ccb13c` are native-only and **not pushed** (no Vercel cost); push them next time web changes also go to main.

---

## ⚡ START HERE (Jun 1, 2026 session) — Brand "P" logo + helper architecture + Team Profiles → DEPLOYED to prod

Shipped a large UX/brand batch in **one push** (`3ede8fab..2755d488`, deploy `dpl_3bMcXajd…` → **READY**, ~68s build). All verified (tsc green per commit) and live on pontifexindustries.com.

**New brand identity — purple→red "P" (bridge-builder):**
- Final mark = single-stroke **bridge-P** (tower → arch span → landing), **purple→red journey gradient** `#7C3AED → #DB2777 → #EF4444`. Applied to `public/logo.svg`, `favicon.svg`, all PWA/touch PNGs (regenerated via `assets/logo-concepts/render-icons.mjs`), and `app/company-login` (white variant).
- Launch-animation spec lives in **`assets/logo-concepts/splash-demo-v4.html`** (final): aurora bg + self-drawing bridge + data-pulse across the span + circuit nodes + blueprint grid = "tech building the bridge." Watch via a static server in that folder. Plan doc: `SPLASH_AND_LOGO_REVAMP.md`.
- **Native iOS icon + splash are NOT changed** (still the old bridge) — those are native assets gated on App Store approval → ship as **Build 6** (`npx @capacitor/assets generate` from `assets/logo.png` + `splash.png`, then `npx cap sync ios`).

**Login / demo:**
- Demo-account dropdown now leads with **Admin** (`admin@pontifex.com`) + **Supervisor "David"** (`supervisor@pontifex.com`) — both `PontifexDemo2026!`. Header is password-agnostic; `DEMO_COLORS` map added. Reset David's auth password (handoff doc had it wrong) + renamed profile full_name → "David".

**Admin:**
- **Team Profiles** now visible to admin: enabled `can_manage_team = true` for admin role in `user_feature_flags` (PATRIOT). Link already existed in `DashboardSidebar` (flag-gated). New admins get it via the invite flow.

**Supervisor visit report (`app/dashboard/admin/site-visits/new`):**
- Date field now uses the shared **`CalendarPicker`** (matches Schedule Form); removed Arrival/Departure time.
- Equipment issues now unify into the **Maintenance Inbox**: `maintenance_requests` gained `request_type` (`repair`/`replace`, migration `20260531_maintenance_request_type` — applied to prod). Supervisor hook converts BOTH maintenance AND replace; operator route tags `repair`; inbox shows a "Replace" badge. So operator + supervisor issues all land in one shop-manager inbox.

**Helper (apprentice) architecture:**
- Read-only on the OPERATOR's ticket: `jobsite` + `work-performed` pages redirect helpers back to the ticket (can't proceed / advance status). Address still gated until the operator confirms equipment (helper-specific locked message added).
- Helper keeps their OWN simple **work log** (`HelperWorkLog`): "what did you help with today?" — type OR **mic dictate** (shared `useVoiceInput` hook). Clock-out still requires it. NOT the operator's work-performed ticket.
- Management sees it: new `GET /api/admin/jobs/[id]/helper-logs` + a **"Helper Work Log" panel** in the admin job detail (active AND completed jobs), beside Operator Notes.

**Operator dashboard:** "Daily Report" card + quick-action → disabled **"Reports — Coming soon"** (route kept; entry points removed). Field/Shop clock-in confirmed saving correctly (`is_shop_hours` + `work_location`; re-clock-in as Shop works). Equipment-issue card already → `/dashboard/maintenance/new` → Maintenance Inbox.

**Other:** `GoogleMapsProvider` honors `NEXT_PUBLIC_DISABLE_GOOGLE_MAPS` (kills LAN dev console spam); timecard lunch de-dupe/modernize; schedule-board toolbar labels; admin back-office dashboard.

**Apple review safety:** this was a **web-only** deploy — the in-review native binary, app icon, splash, and App Store screenshots/metadata are all untouched. (The iOS app loads `server.url` = prod, so the reviewer would only see the new login logo — harmless.)

**Pending / next:**
- 🔴 **Verify App Store review status** — couldn't read it (App Store Connect browser session expired). If approved → do **Build 6** (new "P" native icon + splash + the launch-animation/fade from `SPLASH_AND_LOGO_REVAMP.md`).
- The brand concept/animation files in `assets/logo-concepts/` are design source (committed) — not served in prod.
- Schedule-board still ~2,850 lines — extraction still on backlog.

---

## ⚡ START HERE (May 30, 2026 session) — Scaling analysis + rollout-hardening (10 agents, 3 rounds)

Patriot is about to onboard ~25 users. This session did a capacity analysis and a 3-round
parallel-agent hardening pass. **All pushed to prod in one build (`ef4b618b..c1735cdc`).**

**Scaling:** [`SCALING.md`](SCALING.md) — 25 users is trivial (DB 30 MB, 13/60 conns, all hot
tables tenant-indexed). **The one action that matters: upgrade Supabase Free → Pro ($25/mo)** for
automated backups of payroll data (Free has none), no auto-pause, dedicated compute, and it unlocks
leaked-password protection. **← user action, highest priority before rollout.**

**Hardening shipped (10 subagents, each verified — disjoint file sets, build green, diffs reviewed):**
- **Push notifications now fire across the ENTIRE notification surface** (11 API routes +
  `notify-salesperson`): job dispatch, completion approve/reject, change-requests, time-off,
  maintenance, callouts. Every call is ADDITIVE + fire-and-forget (`.catch(() => {})`) — a push
  failure can never break an API response. Also removed an undeclared `jsonwebtoken` dep risk in
  `lib/send-push.ts` (now delegates to `lib/apns.ts`) and hardened `/api/push` (userId targeting,
  self-vs-admin authz, tenant isolation, 503 on unconfigured).
- **Load-error + retry UI** on ~13 daily-traffic pages (operator: notifications, daily-report,
  in-route, jobsite, job-survey, settings/notifications; admin: timecards, completed-jobs, billing,
  time-off, team-management, team-profiles, schedule-form-history). Pattern ref: `active-jobs/page.tsx`.
  ~6 pages correctly left alone (no blocking fetch / already had it).
- **Mobile (375/414px):** maintenance/new, admin/maintenance, inventory-control, + `NewInventoryModal`
  — 44px tap targets, iOS focus-zoom fix (`text-base sm:text-sm`), overflow, safe-area padding.
- **Migrations applied to prod:** `20260427_utility_waiver_fields` + `20260427_operator_badges`.
  Caught + fixed a cross-tenant RLS leak in operator_badges before applying (was "any admin manages
  all badges" → tenant-scoped + WITH CHECK + updated_at trigger). Verified live.

**Pending / next:**
- 🔴 **Supabase Free → Pro upgrade** (user action — backups on payroll data).
- Push wiring is code-complete but **only delivers once devices register tokens** — confirm the
  iOS app registers APNs tokens into `push_tokens` (TestFlight/Build 5) before relying on push.
- Optional round 4: remaining ~45 low-traffic admin/settings/debug pages (diminishing returns).
- Schedule-board still 2,850 lines — extraction still on backlog.

---

## ⚡ START HERE (May 29, 2026 session) — App Store approval hardening DONE in code

**👉 The authoritative resubmission plan is [`APP_STORE_RESUBMISSION.md`](APP_STORE_RESUBMISSION.md)** — runbook + ready-to-paste App Review notes (demo creds: Company Code `PATRIOT` / `zack@demopontifex.com` / `Patriot2026!`).

A 4-agent Apple-guideline audit found the real (human-review) rejection risks beyond the location string, and they are now **fixed in code and live in prod**:
- **3.1.1 IAP** — all Stripe purchasing hidden in the native shell via `lib/is-native.ts` (`isNativeApp()`); web billing untouched. Killed the `SubscriptionGate` auto-redirect to checkout.
- **5.1.1(v) Account deletion** — built durable infra: migration `20260529_account_deletion_infrastructure` (`profiles.deleted_at` + `public.close_account()`), route anonymizes + 100-yr-bans the auth identity (NOT a hard delete — ~30 tables FK to auth.users; CASCADE would destroy payroll). UI: My Profile → Danger Zone → Delete My Account.

**Remaining (Apple-side, user must do):** ① confirm last build # in App Store Connect → TestFlight (use **4**); ② archive Build 4 + upload via Transporter (CLI in APP_STORE_RESUBMISSION.md §3); ③ paste App Review notes (§4) — the actual 2.1 blocker fix; ④ post-deploy e2e test of account deletion with a throwaway operator.

---

## ⚡ (Prior session notes) — iOS ITMS-90683 fix

### 1. 🍎 Apple Rejection Fix (HIGHEST PRIORITY)
Apple rejected Build 1.0.0 (3) due to **ITMS-90683** — missing `NSLocationAlwaysAndWhenInUseUsageDescription` key. Apple's automated binary scanner requires BOTH location keys whenever any linked SDK (Capacitor Geolocation plugin) references location APIs, even when "always on" is never actually requested by the app.

**The fix is already applied** — `ios/App/App/Info.plist` has `NSLocationAlwaysAndWhenInUseUsageDescription` added (it's a staged change, not yet committed). Verify with `git diff ios/App/App/Info.plist`.

**Steps to resolve:**
```bash
# Step 1 — Commit the Info.plist fix
cd "/Users/afa55/Documents/Pontifex Industres/pontifex-platform"
git add ios/App/App/Info.plist
git commit -m "fix(ios): add NSLocationAlwaysAndWhenInUseUsageDescription for Apple ITMS-90683"

# Step 2 — Push all pending commits to prod (Google Maps fix + Info.plist fix)
# Ask user first: "Can I push to main? 2 commits, ~$1-2 cost"
git push origin main

# Step 3 — Rebuild the iOS archive with updated Info.plist
cd ios/App
xcodebuild archive \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath /tmp/PontifexArchive.xcarchive

xcodebuild -exportArchive \
  -archivePath /tmp/PontifexArchive.xcarchive \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath /tmp/PontifexExport

# Step 4 — Upload new IPA via Transporter.app (free, Mac App Store)
# Drag ~/Desktop/PontifexExport/App.ipa into Transporter → Deliver
# NOTE: Increment Build number in Xcode General tab before archiving
#   Version: 1.0.0 → stays same
#   Build:   3 → 4  (must be higher than previously rejected build)

# Step 5 — In App Store Connect: go to the rejected submission,
# select the new build (4), and click "Submit for Review" again
```

**Check email first:** Apple sends a rejection email with specific reasons to pontifexindustries@gmail.com. Read it before rebuilding — there may be additional rejection reasons beyond ITMS-90683.

### 2. Push Pending Web Commits
Two commits are ready and need to be pushed to `main` together (ask user first):
- `f78a76af` — fix: silence Google Maps console errors when API key is not configured
- `ios/App/App/Info.plist` change (once committed per Step 1 above)

### 3. Set Google Maps API Key (Optional but Recommended)
Address autocomplete is currently degraded to plain text input everywhere. If you want it working:
- Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...` in Vercel → project → Settings → Environment Variables
- The code is already guarded to load Maps only when the key is present

---

## What Is This Project?

**Pontifex Industries** is a multi-tenant SaaS platform for concrete cutting and construction services companies. It manages the full operations lifecycle: scheduling jobs, dispatching operators, tracking field work, managing timecards, invoicing customers, and running shop/equipment operations.

- **Tenant #1 (trial customer):** Patriot Concrete Cutting — actively using the platform in production
- **Stack:** Next.js 15 (App Router) + React 19 + TypeScript + Supabase (PostgreSQL) + Tailwind CSS + Capacitor (iOS)
- **Repo:** `/Users/afa55/Documents/Pontifex Industres/pontifex-platform/`
- **Production URL:** https://www.pontifexindustries.com
- **Login:** https://www.pontifexindustries.com/company-login (company code + email + password)
- **iOS App:** Capacitor wrapper — app loads `https://www.pontifexindustries.com` in a native webview

---

## Current State (May 29, 2026)

| Layer | Status | Notes |
|---|---|---|
| Web app | ✅ Complete | All 23 features shipped, live at pontifexindustries.com |
| Production build | ✅ Passing | Last push: `eda221f4` — Stripe handler fix |
| **Pending push** | ⚠️ `f78a76af` | Google Maps fix — batch with Info.plist commit, push once |
| **iOS app** | 🔴 Resubmit needed | Apple rejected — ITMS-90683 (NSLocationAlwaysAndWhenInUseUsageDescription missing) |
| iOS Info.plist fix | ✅ Staged | `git diff ios/App/App/Info.plist` shows fix applied, needs commit + rebuild |
| Stripe billing | ✅ FULLY LIVE | Webhook Active (we_1TbrUh0WWq11qMKi43RmaRgC), 4 events, env vars set |
| APNs push notifications | ✅ Vars set in Vercel | Server-side send in `/api/push` not yet wired |
| Cron jobs | ✅ Active | `CRON_SECRET` set in Vercel May 22 |
| Google Maps | ⚠️ No API key | Address autocomplete degraded to plain text input; fix committed (f78a76af) silences console errors |
| Twilio SMS | ⏳ Pending | Toll-free verification required at twilio.com |
| Android | ⏳ Not started | After iOS approval: `npx cap add android`, $25 Google Play fee |
| Ruflo | ✅ Installed | `agentdb.rvf` + `.claude-flow/` present in repo root — multi-agent orchestration active |

### Recent Commits
| Commit | Status | Summary |
|---|---|---|
| `f78a76af` | ⏳ NOT PUSHED | fix: silence Google Maps console errors (GoogleMapsProvider guard) |
| `eda221f4` | ✅ Production | fix: move Stripe client init inside handlers — unblocked Vercel build |
| `a013bd58` | ✅ Production | fix(stripe): checkout is public — no auth, resolve tenant by companyCode |
| `432f5469` | ✅ Production | docs: handoff — Stripe fully live, webhook active, APNs pushed |
| `9978a42b` | ✅ Production | feat: APNs push notifications + schedule board component extraction |
| `f2fc6bb0` | ✅ Production | feat: Stripe billing — checkout, webhook, portal, paywall gate, pricing UI |
| `5e71b5c6` | ✅ Production | security: close CRIT-1, MED-2, HIGH-3 from audit |

---

## Credentials & Access

### Demo Accounts (Supabase tenant: PATRIOT)
| Role | Email | Password |
|---|---|---|
| Admin | admin@pontifex.com | PontifexDemo2026! |
| Supervisor | supervisor@pontifex.com | PontifexDemo2026! |
| Shop Manager | shopmanager@pontifex.com | Shop1234! |
| Shop Help | shophelp@pontifex.com | Help1234! |
| Operator | zack@demopontifex.com | Patriot2026! |
| Operator | aiden@demopontifex.com | Patriot2026! |
| Apprentice | lucas@demopontifex.com | Patriot2026! |
| Apprentice | javi@demopontifex.com | Patriot2026! |

**Login URL:** https://www.pontifexindustries.com/company-login  
**Company Code:** `PATRIOT`  
**Demo gate password:** `PontifexDemo2026` (unlocks demo account dropdown on login page)

### iOS / App Store
| Item | Value |
|---|---|
| Apple ID | pontifexindustries@gmail.com |
| iCloud (dev account) | andresa.t55@icloud.com |
| Team ID | MG4K845UH7 |
| Bundle ID | com.pontifexindustries.app |
| App Store App ID | 6772996692 |
| Distribution cert | Apple Distribution: ANDRES FERNANDO ALTAMIRANO (MG4K845UH7) |
| Provisioning profile | Pontifex App Store Distribution (UUID: 05e3d217-dc7b-4db5-8431-5b79743a971a) |
| Profile location | ~/Library/MobileDevice/Provisioning Profiles/ |
| TestFlight tester | AndresAFA55@icloud.com |
| APNs Key ID | M44JJFDG6G |
| APNs Key file | /Users/afa55/Documents/Software documents/AuthKey_M44JJFDG6G.p8 |
| Exported IPA (last good build) | ~/Desktop/PontifexExport/App.ipa (1.7MB) |
| Simulator Device ID | CA1B2D65-5DC0-4C85-A072-3C0BFBE85402 (iPhone 17 Pro) |

### Supabase
| Item | Value |
|---|---|
| Project ID | klatddoyncxidgqtcjnu |
| Dashboard | https://app.supabase.com/project/klatddoyncxidgqtcjnu |

### Vercel
| Item | Value |
|---|---|
| Project | pontifex-industries-software-awja |
| Dashboard | https://vercel.com/andres-altamiranos-projects/pontifex-industries-software-awja |

### Vercel Environment Variables (all set as of May 25, 2026)
| Key | Status | Notes |
|---|---|---|
| `CRON_SECRET` | ✅ Set | 64-char hex, set May 22 |
| `APNS_KEY_ID` | ✅ M44JJFDG6G | Sensitive, Production+Preview |
| `APNS_TEAM_ID` | ✅ MG4K845UH7 | Sensitive, Production+Preview |
| `APNS_BUNDLE_ID` | ✅ com.pontifexindustries.app | Sensitive, Production+Preview |
| `APNS_PRIVATE_KEY` | ✅ Full PEM set | From AuthKey_M44JJFDG6G.p8, Sensitive |
| `STRIPE_SECRET_KEY` | ✅ Set | Live mode |
| `STRIPE_WEBHOOK_SECRET` | ✅ Set | we_1TbrUh0WWq11qMKi43RmaRgC |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ Set | pk_live_... |
| `STRIPE_PRICE_ID_BIANNUAL` | ✅ Set | price_1TbV2E0WWq11qMKimnEXVElP |
| `STRIPE_PRICE_ID_ANNUAL` | ✅ Set | price_1TbV2E0WWq11qMKidsCGCrl8 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | ❌ NOT SET | Address autocomplete degraded — add if you have a Maps API key |
| `RESEND_API_KEY` | ⚠️ Verify | Email delivery — check resend.com dashboard |
| `NEXT_PUBLIC_APP_URL` | ⚠️ Verify | Should = https://www.pontifexindustries.com |
| `NEXT_PUBLIC_SITE_URL` | ⚠️ Verify | Should = https://www.pontifexindustries.com |

---

## Ruflo — AI Orchestration Layer

**Ruflo is installed.** Evidence: `agentdb.rvf`, `agentdb.rvf.lock`, `.claude-flow/` directory, `ruvector.db` all present in the repo root.

Ruflo is a multi-agent AI orchestration layer that runs on top of Claude Code. It provides:
- **AgentDB** — HNSW vector memory that persists learned patterns across sessions
- **Swarm coordination** — hierarchical/mesh/ring topologies for parallel agents
- **Self-learning routing** — routes tasks to best agent based on prior success
- **30+ Claude Code skills** — pre-built workflows for common patterns

**Reference file:** `RUFLO_REFERENCE.md` — full install guide, commands, plugin list

**How we use Ruflo in this project:**
- The AgentDB (`.claude-flow/` + `agentdb.rvf`) stores our migration patterns, RLS conventions, API response format so agents know our stack without re-explaining every session
- Background workers may auto-analyze code quality between sessions
- Use `ruflo hive status` to check swarm health

**Key Ruflo commands:**
```bash
ruflo hive status                    # Check if swarm is healthy
ruflo sparc modes                    # List available SPARC modes
ruflo orchestrate "task desc" --parallel  # Run task with parallel agents
ruflo memory status                  # Check vector memory state
```

---

## iOS Apple Rejection — Full Technical Context

### What Happened
App Build 1.0.0 (3) was submitted May 25, 2026. Apple's automated binary analysis returned **ITMS-90683** (or similar location-related rejection). The issue: Apple's scanner detects that Capacitor's Geolocation plugin references the CoreLocation framework's "always" location APIs internally, so Apple requires BOTH `NSLocationWhenInUseUsageDescription` AND `NSLocationAlwaysAndWhenInUseUsageDescription` to be present in `Info.plist`, even though the app never explicitly requests "always on" permission.

### The Fix (Already Applied)
`ios/App/App/Info.plist` now includes both keys:
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Pontifex verifies you are at the job site when you clock in. Your location is checked once per clock-in event and is not tracked in the background.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Pontifex verifies you are at the job site when you clock in. Your location is only used during the clock-in check and is never tracked in the background.</string>
```

### Resubmission Checklist
```
[ ] git add ios/App/App/Info.plist && git commit -m "fix(ios): add NSLocationAlwaysAndWhenInUseUsageDescription for ITMS-90683"
[ ] git push origin main (batch with f78a76af — ask user first, costs ~$1-2)
[ ] Open ios/App/App.xcodeproj in Xcode
[ ] Increment Build number: General tab → Build: 3 → 4
[ ] Product → Archive
[ ] Window → Organizer → Distribute App → App Store Connect → Upload
[ ] App Store Connect → select new build (4) → Submit for Review
```

**Check email first!** Apple may list more than one issue. Read the rejection email at pontifexindustries@gmail.com before resubmitting.

### Common Apple Rejection Reasons for Capacitor Apps (Watch For These)
1. **ITMS-90683** — missing privacy usage description key ← FIXED
2. **Guideline 4.0** — app is a web wrapper without native functionality (mitigation: show GPS clock-in, NFC, camera features prominently in screenshots/description)
3. **Guideline 2.1** — app crashes on launch (test with TestFlight on real device first)
4. **Missing screenshots** — must have minimum 3 screenshots at 1290×2796 (iPhone 6.7")
5. **Demo account required** — Apple reviewer needs login credentials. Include in App Review Information:
   - Company Code: PATRIOT
   - Email: admin@pontifex.com
   - Password: PontifexDemo2026!

---

## Architecture & Key Patterns

### Role Hierarchy (highest → lowest)
```
super_admin → operations_manager → admin → salesman → shop_manager → inventory_manager → operator → apprentice
```
Plus parallel roles: `supervisor` (field oversight), `shop_help` (shop assistant)

### Provider Stack (Root Layout)
```
ThemeProvider > BrandingProvider > NotificationProvider > ErrorBoundary > NetworkMonitor > GoogleMapsProvider > App
```
- `GoogleMapsProvider` — NOW guards against missing API key. Only calls `useJsApiLoader` when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set. When missing, renders children with `{ isLoaded: false }` (no errors, components degrade to plain text inputs).

### Auth Pattern
- **Server-side:** `requireAuth()`, `requireAdmin()`, `requireSuperAdmin()`, `requireScheduleBoardAccess()` from `lib/api-auth.ts`
- **Client-side:** `getCurrentUser()` from `lib/auth.ts` with role array check in `useEffect`
- **Supabase admin client** (`lib/supabase-admin.ts`): all server-side DB ops (bypasses RLS)
- **Supabase public client** (`lib/supabase.ts`): client-side only

### Multi-Tenant Architecture
- Every table has `tenant_id` (UUID, FK to `public.tenants`)
- Login uses company code → `lookup_tenant_by_code()` SECURITY DEFINER RPC (called from browser directly — no Lambda hop)
- White-label branding: `BrandingProvider` reads `tenants.logo_url`, `tenants.primary_color`, etc.
- Branding cached in localStorage (`'patriot-branding'` key, 5-minute TTL)

### RLS Pattern — CRITICAL RULES
```sql
-- ✅ CORRECT — reads from public.profiles via SECURITY DEFINER helper
USING (
  public.current_user_has_role('admin', 'super_admin', 'operations_manager')
  AND tenant_id = public.current_user_tenant_id()
)

-- ❌ NEVER DO THIS — user_metadata is client-writable via supabase.auth.updateUser()
-- Supabase linter flags this as rls_references_user_metadata (ERROR)
USING (
  auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
)
```

**SECURITY DEFINER helpers (always use these for RLS):**
- `public.is_admin()` — true for `admin` or `super_admin`
- `public.current_user_role()` — returns the caller's `profiles.role`
- `public.current_user_tenant_id()` — returns the caller's `profiles.tenant_id`
- `public.current_user_has_role(VARIADIC text[])` — membership check against a list

### API Response Format
```typescript
return NextResponse.json({ success: true, data: {...} })         // success
return NextResponse.json({ error: 'message' }, { status: 400 }) // error
```

### Audit Logging (fire-and-forget — never block main response)
```typescript
Promise.resolve(supabaseAdmin.from('audit_logs').insert({...})).then(() => {}).catch(() => {})
```

### Stripe Init Pattern (CRITICAL — never put at module level)
Stripe must be initialized inside route handlers, not at module top-level. Module-level code runs during `npm run build` when `STRIPE_SECRET_KEY` is not present in the build environment.
```typescript
// ✅ CORRECT — inside the handler
export async function POST(request: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  ...
}

// ❌ WRONG — breaks Vercel build
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
export async function POST(request: NextRequest) { ... }
```

---

## Development Workflow

### Session Pattern
1. **Start every session:** Read `CLAUDE_HANDOFF.md` (this file) + run quick sanity checks
2. **Check pending work:** `git log origin/main..HEAD --oneline`
3. **Build check:** `npm run build` (must be 0 errors before doing anything)
4. **Work through the "Start Here" section** at the top of this file
5. **After each feature:** `npm run build`, commit with descriptive message
6. **End of session:** Update this file, confirm before pushing `main`

### Quick Sanity Checks (Run at Session Start)
```bash
# 1. Confirm branch + pending commits
git log --oneline -5
git log origin/main..HEAD --oneline
git status --short

# 2. Verify build passes (must be 0 errors)
npm run build

# 3. Start dev server if doing UI work
npm run dev   # port 3000
```

### Git / Cost Discipline
```bash
# NEVER push without asking: "Can I push? ~$1-2 cost"
# Each push to main = Vercel build = $1-2
git push origin main   # only after user confirms

# Safe — never triggers a build
git commit -m "..."
```

### Parallel Agent Pattern (How to Build Fast)
Claude spawns multiple specialized agents simultaneously. Standard pattern:
1. `supabase-migration-author` → migration SQL (idempotent DDL + SECURITY DEFINER + RLS)
2. `rls-policy-auditor` → validates policies in parallel
3. `backend-dev` → API routes under `app/api/`
4. `coder` → UI pages/components (concurrently with API)
5. `mobile-responsive-auditor` → sweeps operator pages at 375px/414px before push

Use `Agent({ isolation: "worktree" })` for large multi-file features to prevent conflicts. **CRITICAL:** Worktrees do NOT inherit `.env.local` — copy it before making Supabase calls.

### iOS Build Commands
```bash
# Archive for App Store
cd ios/App
xcodebuild archive \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath /tmp/PontifexArchive.xcarchive

# Export IPA
xcodebuild -exportArchive \
  -archivePath /tmp/PontifexArchive.xcarchive \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath /tmp/PontifexExport

# Upload via Transporter.app (Mac App Store — free)
# Drag /tmp/PontifexExport/App.ipa → Deliver

# NOTE: Build number MUST increment each submission
# Version stays 1.0.0, Build: 3 → 4 → 5 etc.
```

---

## Security Audit Summary (May 25–26, 2026)

| Finding | Severity | Status |
|---|---|---|
| 10 job-orders routes: `if (tenantId)` silently skipped tenant filter | CRIT-1 | ✅ FIXED |
| `user_metadata` RLS references (audit agent false positive — not in prod) | CRIT-2 | ✅ FALSE POSITIVE |
| `clock-out/route.ts` missing `requireAuth()` | MED-2 | ✅ FIXED |
| Customer portal `.or()` string interpolation (SQL injection vector) | HIGH-3 | ✅ FIXED |
| In-memory rate limiter doesn't survive cold starts | HIGH-2 | ⏳ OPEN — fix: enable Supabase Auth rate limits in dashboard (5 min user action) |
| CSP `unsafe-inline` | MED-5 | ⏳ OPEN — nonce-based CSP (next sprint) |
| `signOut({ scope: 'global' })` instead of local | LOW | ⏳ OPEN |

---

## Stripe Billing (FULLY LIVE)

**Stripe account:** acct_1THphn0WWq11qMKi (live mode)

| Object | ID/Value |
|---|---|
| Product | prod_UagOHFDdm4Tw2N — "Pontifex Industries Platform" |
| 6-Month price | price_1TbV2E0WWq11qMKimnEXVElP — $3,747 / 6 months |
| Annual price | price_1TbV2E0WWq11qMKidsCGCrl8 — $6,997 / year |
| Webhook | we_1TbrUh0WWq11qMKi43RmaRgC → /api/stripe/webhook |
| Events | checkout.session.completed, subscription.updated/deleted, invoice.payment_failed |

Patriot is on `subscription_status = 'trialing'` — paywall gate allows full access. Tell Claude when trial ends → flip to `'active'`.

---

## Complete Feature Inventory

### 1. Multi-Tenant Architecture
- Company code login → `lookup_tenant_by_code()` SECURITY DEFINER RPC (browser calls Supabase directly — no Lambda)
- White-label branding per tenant (`BrandingProvider`, logo, colors)
- Every table has `tenant_id` + RLS via SECURITY DEFINER helpers

### 2. RBAC (10 roles)
- `ADMIN_CARDS` array in `lib/rbac.ts` drives dashboard card visibility
- `ROLE_PERMISSION_PRESETS` for sidebar filtering

### 3. Schedule Board (`app/dashboard/admin/schedule-board/` — ~2850 lines)
- Operator rows with time-off blocking, skill warnings, real-time status colors
- Inline editing: scope, operators, notes, Mark Out (rose) to block operator
- Dispatch modal with PDF ticket generation
- Smart scheduling: per-scope skill matching (good / stretch / under-skilled / busy panels)

### 4. Schedule Form (Multi-step job creation)
- Steps: Customer → Project → Scope → Equipment → Difficulty → Scheduling → Site Compliance
- Linear Ft + Cut Depth calculator (auto LF from dimensions + cross-cut spacing + overcut)
- Edit mode via `?editJobId=<uuid>&jumpTo=scope`

### 5. Operator Workflow
- `My Jobs` → `Jobsite` → `Work Performed` → `Day Complete` → Done/Complete
- Past 7-day history, "Continuing Tomorrow" amber section, green highlights
- Real-time live status panel on admin job detail (30s poll via `useVisiblePoll`)

### 6. Dispatch & Tickets
- PDF dispatch ticket (`@react-pdf/renderer`)
- Email + SMS delivery (Telnyx→Twilio via `lib/sms.ts`)
- Idempotent dispatch (skips already-dispatched operators)

### 7. Timecard System
- GPS clock-in (100ft radius, shop at 34.768775, -82.435642)
- NFC clock-in/clock-out (bypass GPS)
- 3-layer lunch deduction: admin override > per-user default > tenant default
- Admin manual entries: PTO, sick, holiday, admin_adjustment
- Auto clock-out cron, time correction request flow
- Timezone-aware using `tenants.timezone`

### 8. Time-Off & Attendance
- Request → Approve/Deny flow
- PTO balance tracking (`operator_pto_balance` table)
- Late clock-in tracking (`is_late`, `late_minutes` flags)
- Callout counts in attendance metrics

### 9. Team Profiles & Skills
- Skills taxonomy (`lib/skills-taxonomy.ts`) — cutting 0–10, equipment 0–5
- Peer ratings (`rating_forms` + `rating_submissions`)
- "Rate Your Crew" card on My Jobs

### 10. Job Execution & Progress
- Change Orders (`change_orders` table, CO-NNN auto-numbered)
- Daily progress analytics, operator notes
- Work items with quantity, LF, cut depth

### 11. Customer Portal
- Public signature page (no auth), e-sign consent, NPS survey
- Customer satisfaction flow

### 12. Billing & Invoices
- Invoice pipeline: draft → confirmed → sent → paid
- QuickBooks CSV export, PDF invoice
- 30-day overdue reminder cron

### 13. Facilities & Badging
- Facility CRUD, badge tracking, auto-expiration

### 14. Notifications
- In-app bell, email (Resend), SMS (Telnyx→Twilio)
- Auto-reminders: late clock-in, signature requests, invoice overdue

### 15. Shop Manager Module
- Equipment CRUD with smart location display
- Fleet CRUD with service history
- Inventory Control page (4 tabs: Inventory / Checkout / Check-In / History)
- Voice checkout: speak equipment name → pg_trgm fuzzy match → auto-fill
- Voice correction learning loop → alias suggestions

### 16. Maintenance Module
- Operator 3-tap mobile request wizard (`/dashboard/maintenance/new`)
- Maintenance Inbox 3-tab triage view
- Fleet service history (`vehicle_service_records`)
- Visit-wizard → maintenance auto-conversion hook

### 17. Supervisor Module
- Site visit reports with per-issue photos
- Supervisor dashboard: KPI tiles, visits, active jobs, quick actions

### 18. Legal & Compliance Pages
- `/privacy-policy`, `/terms-of-service`, `/gps-consent`, `/esign-consent`, `/sms-opt-in`

### 19. Security Hardening
- HSTS header, CSP (unsafe-eval excluded in prod)
- Rate limiting on clock-in + `/api/sms-opt-in`
- GPS suspicious jump detection
- SECURITY DEFINER RPC for public tenant lookup
- 31 redundant indexes dropped

### 20. iOS App (Capacitor)
- Same Next.js codebase in native webview — zero React Native rewrite
- App icon: 1024×1024 opaque PNG, bridge logo on `#1e1b4b`
- Entitlements: APNs (production) + NFC readersession
- Build 1.0.0 (3) submitted May 25 — rejected by Apple (ITMS-90683, fix applied)

### 21. Stripe Billing
- Checkout, webhook (4 events), billing portal
- Subscription gate in middleware (trialing/active = allowed, past_due = 7-day grace)
- Billing tab in admin settings

### 22. Marketing & Landing Pages
- `app/page.tsx` — Pontifex Industries homepage (Framer Motion animations)
- `app/patriot/page.tsx` — Patriot landing + pricing plans
- Request Demo funnel (3-step)

### 23. Admin Utilities
- Real-time live status panel (30s poll)
- Job soft-delete (trash icon + confirmation modal)
- Light/dark mode toggle (factory-reset sentinel)
- `useVisiblePoll` hook — polls only when tab visible + online

---

## Database

- **Project:** `klatddoyncxidgqtcjnu`
- **Migrations:** 70+ in `supabase/migrations/`
- **Tables:** 90+ in production
- **Rule:** Every table has `tenant_id` FK to `public.tenants` + RLS enabled
- **Migration convention:** Idempotent DDL (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)

### Key Tables
| Table | Purpose |
|---|---|
| `tenants` | Multi-tenant root — company_code, branding, plan, GPS shop coordinates, timezone, Stripe fields |
| `profiles` | User profiles — role, tenant_id, skill_levels JSONB, default_lunch_minutes |
| `job_orders` | Jobs — job_number, status, scope_details, customer, tenant_id |
| `job_daily_assignments` | Per-day operator assignments (unique partial index) |
| `timecards` | Clock-in/out — GPS, NFC, entry_type, lunch deduction, audit columns |
| `timecard_settings_v2` | Tenant timecard config (break threshold, auto-deduct, NFC bypass) |
| `equipment` | Shop equipment — status, current_custodian_id, aliases JSONB |
| `equipment_checkouts` | Equipment custody log — voice_note_url |
| `voice_recognition_corrections` | Voice checkout learning loop |
| `vehicles` | Fleet — VIN, plate, compliance dates, odometer |
| `vehicle_service_records` | Fleet maintenance history |
| `maintenance_requests` | Equipment issue tickets |
| `supervisor_visits` | Site visit reports |
| `change_orders` | Job change orders — CO-NNN auto-numbered |
| `invoices` | Billing pipeline — draft→confirmed→sent→paid |
| `rating_forms` + `rating_submissions` | Peer review system |
| `operator_pto_balance` | PTO allocation per operator per year |
| `audit_logs` | Security/admin audit trail |

### Stripe Columns (on `public.tenants`)
```sql
stripe_customer_id        text
stripe_subscription_id    text
subscription_status       text  -- 'trialing' | 'active' | 'past_due' | 'cancelled' | 'unpaid'
plan_type                 text  -- 'biannual' | 'annual'
current_period_end        timestamptz
trial_ends_at             timestamptz
```

### Applied Migrations (most recent)
| Migration | Purpose |
|---|---|
| `20260526_stripe_billing_columns` | Stripe columns on tenants |
| `20260521_public_tenant_lookup_fn` | SECURITY DEFINER RPC for anon tenant lookup |
| `20260521_drop_redundant_duplicate_indexes` | Dropped 31 redundant indexes |
| `20260517_job_assignments_no_cascade` | FK RESTRICT + soft-delete pattern |
| `20260516_timecard_uniqueness_and_timezone` | Unique index for open timecards + tenant timezone |
| `20260510_voice_checkouts_bucket` | Non-public Supabase Storage bucket for audio |

---

## Cron Jobs (Active in Production)

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/auto-clockout` | Midnight + noon daily | Auto-close open timecards from previous days |
| `/api/cron/invoice-30d-reminders` | Daily | Send overdue invoice email reminders |

---

## What's Next (Prioritized Backlog)

### 🔴 Immediate (This Session)
1. **Commit + push iOS Info.plist fix** → rebuild iOS archive → resubmit to App Store (see top of file)
2. **Push `f78a76af`** (Google Maps fix) — batch with iOS commit

### 🟡 Short-Term (User Actions Required)
3. **Supabase Auth rate limits** (HIGH-2) — Dashboard → Auth → Settings → enable rate limits (5 min, user does this)
4. **Twilio toll-free verification** — twilio.com → opt-in URL: `https://www.pontifexindustries.com/sms-opt-in`
5. **Rotate Twilio Auth Token** — was briefly visible in a screenshot (hygiene)
6. **Upload Patriot logo** → Settings → Company Branding → Icon (Square) → Save
7. **Verify email env vars** in Vercel: `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`
8. **Add Google Maps API key** in Vercel → restores address autocomplete

### 🟢 Code Backlog
9. **APNs push logic** — vars are set in Vercel; implement server-side send in `/api/push/route.ts` (client already calls `/api/push/register` on APNs token registration — server side just needs to store token + send via `lib/send-push.ts`)
10. **Android app** — after iOS approval: `npx cap add android` + $25 Google Play fee
11. **Schedule board refactor** — `schedule-board/page.tsx` is ~2850 lines; extract `OperatorRow`, `JobCard`, `EditModal`, `DispatchModal` to `_components/`
12. **CSP nonce-based** (MED-5) — replace `unsafe-inline` with nonce injection
13. **Apply pending migrations:** `20260427_utility_waiver_fields.sql`, `20260427_operator_badges.sql`

---

## Key File Map

```
pontifex-platform/
├── app/
│   ├── api/
│   │   ├── admin/
│   │   │   ├── jobs/[id]/                  # Job CRUD, progress, live-status, change-orders
│   │   │   ├── schedule-board/             # Schedule board data (operators, capacity, crew grid)
│   │   │   ├── timecards/                  # Admin timecard management + manual entry
│   │   │   ├── equipment/                  # Equipment CRUD + voice alias suggestions
│   │   │   ├── equipment-checkouts/        # Checkout/check-in + voice-parse + audio upload
│   │   │   ├── fleet/[id]/service-records/ # Fleet maintenance history
│   │   │   ├── maintenance-requests/       # Maintenance inbox triage
│   │   │   ├── supervisor-visits/          # Site visit reports
│   │   │   ├── invoices/                   # Invoice CRUD + confirm + send
│   │   │   └── peer-ratings/              # Rating forms + submissions
│   │   ├── stripe/
│   │   │   ├── create-checkout-session/   # Public endpoint — creates Stripe checkout
│   │   │   ├── webhook/route.ts           # 4 events: checkout, sub update/delete, payment_failed
│   │   │   └── create-portal-session/     # Admin only — Stripe self-service portal
│   │   ├── push/
│   │   │   └── register/route.ts          # Store APNs device token (server side NOT yet wired)
│   │   ├── timecard/
│   │   │   ├── clock-in/route.ts          # GPS + NFC (100ft geofence, rate-limited)
│   │   │   └── clock-out/route.ts         # GPS + lunch deduction
│   │   └── cron/                          # Auto-clockout + invoice reminders
│   ├── company-login/page.tsx             # Main login — calls supabase.rpc() directly (fast)
│   ├── dashboard/
│   │   ├── admin/
│   │   │   ├── active-jobs/               # Job cards with duplicate + delete
│   │   │   ├── schedule-board/            # ~2850-line board (needs extraction)
│   │   │   ├── schedule-form/             # Multi-step job creation + edit mode
│   │   │   ├── equipment/                 # Equipment list + detail
│   │   │   ├── fleet/                     # Vehicle list + service history
│   │   │   ├── inventory-control/         # 4-tab unified (voice checkout)
│   │   │   ├── maintenance/               # Maintenance inbox
│   │   │   ├── site-visits/               # Supervisor visit reports
│   │   │   ├── timecards/                 # Team payroll + operator detail
│   │   │   ├── peer-ratings/              # Rating forms + team ratings
│   │   │   ├── settings/page.tsx          # Billing tab + Company Branding
│   │   │   └── billing/                   # Invoice pipeline
│   │   ├── my-jobs/                       # Operator job list
│   │   ├── timecard/                      # Operator personal timecard
│   │   └── maintenance/new/              # Operator maintenance request wizard
│   └── page.tsx                          # Pontifex Industries homepage
├── lib/
│   ├── api-auth.ts                        # requireAuth, requireAdmin, etc.
│   ├── auth.ts                            # getCurrentUser() + useAuthUser hook
│   ├── rbac.ts                            # ADMIN_CARDS + ROLE_PERMISSION_PRESETS
│   ├── supabase-admin.ts                  # Service-role client (bypasses RLS)
│   ├── supabase.ts                        # Anon client (client-side)
│   ├── sms.ts                             # sendSMSAny() Telnyx→Twilio fallback
│   ├── geolocation.ts                     # SHOP_LOCATION + radius (single source of truth)
│   ├── send-push.ts                       # APNs push send logic (vars set, needs wiring)
│   ├── skills-taxonomy.ts                 # Operator skills definitions
│   └── hooks/
│       ├── useAuthUser.ts                 # Async-safe auth hook (Supabase session as ground truth)
│       └── useVisiblePoll.ts              # Polls only when tab visible + online
├── components/
│   ├── providers/
│   │   └── GoogleMapsProvider.tsx         # Guards against missing API key (fixed May 29)
│   ├── BrandingProvider.tsx               # White-label tenant branding (5-min localStorage cache)
│   ├── DashboardSidebar.tsx               # Role-aware navigation
│   ├── NfcClockInModal.tsx                # NFC + GPS + PIN clock-in flow
│   ├── NotificationBell.tsx              # In-app notification bell
│   └── SubscriptionGate.tsx              # Client-side Stripe paywall
├── ios/App/
│   ├── App/Info.plist                     # arm64, ITSAppUsesNonExemptEncryption=false, BOTH location keys
│   ├── App/App.entitlements               # aps-environment=production + NFC entitlement
│   ├── App/Assets.xcassets/AppIcon.appiconset/  # 1024×1024 opaque PNG
│   └── ExportOptions.plist               # App Store export config
├── supabase/migrations/                   # 70+ migration files (all idempotent)
├── CLAUDE.md                              # Project conventions + sprint backlog
├── CLAUDE_HANDOFF.md                      # ← THIS FILE
├── CLAUDE_CONTEXT.md                      # Full architecture reference (last updated March 2026)
├── CLAUDE_SESSION_CONTEXT.md             # Detailed schema + patterns + business rules
├── RUFLO_REFERENCE.md                     # Ruflo install guide, commands, plugins
├── APP_CHANGES.md                         # iOS-only changes + App Store submission guide
├── APP_STORE_PLAN.md                      # Phase-by-phase App Store publication plan
├── SHOP_MANAGER_PLAN.md                   # Shop manager module plan (all C-phases shipped)
├── DEPLOYMENT_COST.md                     # Vercel build cost discipline (READ before pushing)
└── vercel.json                            # maxDuration, cron, blocked branch deploys
```

---

## Important MD Files Reference

| File | What's In It | When to Read |
|---|---|---|
| `CLAUDE_HANDOFF.md` | **This file** — current state, pending work, credentials | Every session start |
| `CLAUDE.md` | Project conventions, sprint backlog checkboxes, parallel agent patterns | When starting new features |
| `CLAUDE_CONTEXT.md` | Full architecture reference — DB schema, API routes, views, business rules | When working on unfamiliar parts of the system |
| `CLAUDE_SESSION_CONTEXT.md` | Detailed schema + patterns + role business rules | When writing DB migrations or API routes |
| `RUFLO_REFERENCE.md` | Ruflo install, commands, plugin list, Pontifex-specific setup | When working with swarm agents or memory features |
| `APP_CHANGES.md` | iOS-only changes, Xcode setup, App Store submission steps | When doing iOS builds or App Store submission |
| `APP_STORE_PLAN.md` | Phase-by-phase iOS + Android publication plan | When starting Android work |
| `DEPLOYMENT_COST.md` | Vercel build cost breakdown — why we batch pushes | Before any `git push origin main` |
| `SHOP_MANAGER_PLAN.md` | Shop Manager C-phases — all shipped, use as reference | When extending shop/inventory features |

---

## Vercel Build Notes
- `claude/*` and `feature/*` branches are blocked from triggering builds in `vercel.json`
- Only `main` triggers a production build
- Builds take ~60-120s and cost ~$1-2 each
- Current deployment URL: https://www.pontifexindustries.com
- Deployment ID for last push: `dpl_FkNPZvhb9tRE91jEVpu2xfUxtrRL` (commit `eda221f4`)
