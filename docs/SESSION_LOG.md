# Session Log — sprint history (moved out of CLAUDE.md Jun 9, 2026)

> Historical record of completed sessions. Current priorities live in [BACKLOG.md](../BACKLOG.md);
> the latest session detail lives in [CLAUDE_HANDOFF.md](../CLAUDE_HANDOFF.md). Append new entries here
> only when pruning the handoff.

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

### Session — May 3, 2026 — Supervisor Dashboard ✅ COMPLETE
- [x] Migration `20260502_supervisor_visits` — supervisor_visits table with RLS (supervisor sees own; admin/ops/super see all-in-tenant)
- [x] SupervisorDashboard component (lazy-loaded) — clock-in/out widget with live timer, 4 KPI tiles, Recent Visits + My Active Jobs, Quick Actions
- [x] Site Visit Report form — pick operator → auto-populate active jobs → fill observations/issues/ratings/follow-up
- [x] APIs: GET/POST `/api/admin/supervisor-visits`, GET/PATCH single, GET `/api/admin/operators/[id]/active-jobs?date=YYYY-MM-DD`
- [x] New 'site_visits' RBAC card (supervisor=submit, admin/ops=read-all)
- [x] Verified end-to-end against `supervisor@pontifex.com` demo account; bugfixes for off-by-one date and Sunday week-bounds bugs

### Session — May 4–6, 2026 — Shop Manager Foundation ✅ COMPLETE
- [x] Phase 0 — visit-wizard → equipment-issues bridge to shop manager
- [x] Phase 1A — shop_manager + shop_help roles, dashboards, `work_location` taxonomy on profiles
- [x] Phase 1B — equipment + fleet CRUD for shop_manager (`/dashboard/admin/equipment`, `/dashboard/admin/fleet`, full route set under `/api/admin/equipment` and `/api/admin/fleet`)
- [x] All 7 plan questions resolved + 3 new requirements captured in `SHOP_MANAGER_PLAN.md`

### Session — May 7–8, 2026 — Timecard Refinements + GPS Clock-In Fixes ✅ COMPLETE
- [x] Admin-editable lunch deduction with override audit (`lunch_override_by/at/reason` on `timecards`)
- [x] Clock-out GPS radius widened to 50ft (mobile drift indoors) + per-user lunch default (`profiles.default_lunch_minutes`)
- [x] Shop manager sidebar restrictions
- [x] Clock-in radius widened to 100ft after on-site testing (`ALLOWED_RADIUS_METERS = 30.48m`); shop pin re-centered to user-verified coordinates `34.768775733693474, -82.43564252936702`
- [x] Admin manual time entry (PTO + sick + holiday + manual hours); migration extends `timecards_entry_type` CHECK to allow `pto|sick|manual|admin_adjustment`
- [x] Operator timecard split date/time picker + empty-day PTO/sick/holiday entry + balance card
- [x] Per-role lunch defaults (60min for shop, 30min for field)

### Session — May 9–10, 2026 — Inventory Foundation + Phase C(i)/C(ii) ✅ COMPLETE
- [x] Phase B(i) — smart equipment location resolver + unified Inventory Control page (`/dashboard/admin/inventory-control`)
- [x] C(i) — equipment storage location dropdown (`🏭 Shop` or `🚚 <truck> · <operator>`) on New Equipment + edit modal
- [x] C(ii)-a — truck-as-custodian + searchable equipment combobox on Checkout tab; mode toggle (🚚 Truck / ✋ Handheld); Check-In + History reordered to lead with truck chip
- [x] C(ii)-b foundation — voice mic + parser API + auto-fill MVP. Migration `20260510_voice_recognition_corrections` + pg_trgm + trigram indexes. 6-tier scoring (cache > alias > asset_tag > short_name+unit > partial > trigram). Returns top-3 alternatives per slot.
- [x] Shop_manager Forbidden bug fix + read-only schedule access
- [x] Turbopack dev flag to kill `.next` cache corruption

### Session — May 10, 2026 (PT 4) — Phase C(ii)-b POLISH ✅ COMPLETE
- [x] **Pending tray** — `VoiceDraft[]` state; speak many items, edit amber alternatives inline, "Confirm All" submits batch sequentially
- [x] **Voice corrections persisted** — `POST /api/admin/equipment-checkouts` accepts `voice_corrections[]` body field → writes to `voice_recognition_corrections` (fire-and-forget, tenant-scoped, `was_corrected = top1 !== user_pick`)
- [x] **Alias-learning prompt** — new `GET /api/admin/equipment/[id]/alias-suggestions` (threshold = 3); `AliasPromptModal` PATCHes equipment with merged aliases
- [x] **Audio recording** — MediaRecorder in parallel with SpeechRecognition; multipart upload to non-public `voice-checkouts` bucket via `POST /api/admin/equipment-checkouts/voice-note-upload`; 30-day signed URL on `equipment_checkouts.voice_note_url`
- [x] Migration `20260510_voice_checkouts_bucket.sql` applied

### Session — May 11, 2026 — Production Deploy of C(ii)-b Polish ✅ COMPLETE
- [x] Merged `claude/inspiring-swanson-31ba74` into `main` via deploy branch (`-X theirs` for textual conflicts on duplicated SHAs)
- [x] **Pushed `dd28c58b` to origin/main → production live** (63s build, ~$1-2 cost)
- [x] Verified READY on https://www.pontifexindustries.com via Vercel API

### Session — May 21, 2026 — Login Outage Fix + iOS App Icon ✅ COMPLETE
- [x] iOS app icon alpha-channel bug fixed — bridge logo over `#1e1b4b` background, `hasAlpha: no`
- [x] `APP_CHANGES.md` created — tracks native app-only changes separately from web
- [x] `vercel.json` maxDuration raised 10→25s default; 30s for 4 login-critical routes
- [x] `branding/route.ts` hardened — `withTimeout(20s)`, `.maybeSingle()`, non-fatal timeout
- [x] `tenant-by-code/route.ts` hardened — AbortController covers full body read (not just headers)
- [x] **FINAL FIX**: `company-login/page.tsx` rewrites to call `supabase.rpc('lookup_tenant_by_code')` directly — no Vercel Lambda hop. Sub-second response.
- [x] Migration `20260521_public_tenant_lookup_fn` — SECURITY DEFINER RPC callable by anon, returns only `id/name/company_code`
- [x] Migration `20260521_drop_redundant_duplicate_indexes` — dropped 31 redundant indexes

### Session — May 26–27, 2026 — Stripe Billing + Security + APNs ✅ COMPLETE
- [x] Full security audit — CRIT-1, MED-2, HIGH-3 closed; CRIT-2 false positive confirmed
- [x] Stripe billing fully live — checkout, webhook (4 events), portal, paywall gate, pricing UI, migration
- [x] APNs push notifications — server-side logic (`lib/send-push.ts`), env vars set in Vercel
- [x] iOS app built + submitted to App Store — Build 1.0.0 (3), App ID 6772996692
- [x] Fix: Stripe `new Stripe()` moved inside handlers — unblocks Vercel build

### Session — May 29, 2026 — Google Maps Fix + Apple Rejection Fix ✅ COMMITTED (not yet pushed)
- [x] `GoogleMapsProvider` refactored — guards against missing API key, silences console error spam on every page
- [x] `Info.plist` — added `NSLocationAlwaysAndWhenInUseUsageDescription` (Apple ITMS-90683 fix)
- [ ] **PENDING:** Push both commits to main → rebuild iOS archive → increment Build to 4 → resubmit to App Store

### Session — Jun 1, 2026 — Brand "P" + helper architecture + Build 6 submitted ✅ COMPLETE
- [x] New brand mark (purple→red bridge-P) across web logos/favicon/PWA icons + company-login
- [x] Helper (apprentice) architecture: read-only on operator ticket, own voice-enabled work log, management visibility
- [x] Team Profiles enabled for admin; supervisor visit report → Maintenance Inbox unification
- [x] **iOS Build 6 / v1.0.1** (new native icon + splash + smooth fade) archived → Transporter → ASC → **Submitted for Review**

### Session — Jun 3, 2026 — 1.0.1 live, web batch, 1.0.2 submitted, disk, timecard date bug ✅ COMPLETE
- [x] **iOS v1.0.1 APPROVED + auto-released** — new purple-P icon LIVE on App Store (verified via iTunes lookup)
- [x] **Animated launch intro** (`components/SplashIntro.tsx`, ports splash-demo-v4) + removed company-login autoFocus (no keyboard pop)
- [x] **Mobile responsiveness**: timecard payroll → card-per-operator (fits, no scroll) + dark header; visit-report & schedule-form customer step; CalendarPicker truncate
- [x] **iOS v1.0.2 / Build 7 SUBMITTED** — swapped leaky screenshots (real "Harper General CONTRACTORS") for 3 clean demo shots in the 6.9″ Media Manager slot
- [x] **Disk crisis fixed** — `.claude/worktrees/` had grown to 81 GB (filled disk); removed 89 clean worktrees + stripped caches → ~85 GB free
- [x] **Operator timecard date bug** (Zack: Jun 1 showed as "Sun May 31") — UTC-vs-local parsing fixed in `timecard/page.tsx` + `lib/timecard-utils.ts`; pushed live (`cefd3e85`)
- [x] **`DEV_TOOLING_RECOMMENDATIONS.md`** created — phased tooling plan to speed up dev + prevent bug classes

### Session — Jun 8, 2026 — Invite system, Face ID Build 8, editable emails, EMAIL SENDER FIX ✅ COMPLETE (4 pushes)
- [x] **🔴 EMAIL SENDER FIX** — verified Resend domain is `admin.pontifexindustries.com`; root `pontifexindustries.com` is NOT verified (403). `RESEND_FROM_EMAIL` (Vercel) pointed at the unverified root → ALL email (invites, resets, invoices, demo, PDFs) silently 403-failed. Fixed: `lib/email.ts` exports `VERIFIED_EMAIL_DOMAIN`/`DEFAULT_EMAIL_FROM`; all ~9 senders use it; env var no longer read. Saved to `memory/resend-verified-domain.md`.
- [x] **User INVITE system** — admin Invite Users page (email+name+role) → emailed setup link → photo+password → active. Guardian caught 3 BLOCKING (cross-tenant takeover, 2-pass profile upsert, non-unique token) — all fixed + re-verified PASS. CSPRNG tokens, rank-escalation guard. Migrations: invite_flow_columns, profile_setup_columns, invite_token_unique.
- [x] **Editable team emails** (admin/ops/super) — Team Profiles Edit Info; backend syncs `auth.users`+`profiles`, tenant-scoped, rank-guarded, global unique, revert-on-desync. Guardian PASS. Migration `profiles_email_lower_key`.
- [x] **Light-mode restyle** — invite + setup-account pages were hardcoded dark → light-default + `dark:` variants (matched completed-jobs palette)
- [x] **Branding flash fix** — `/login` no longer shows Patriot before the entered company loads (debranded default + `tenantBranding || {}`)
- [x] **Demo logins** — `admin@pontifex.com`→`PontifexDemo2026!`; new super-admin demo `superadmin@pontifex.com`/`PontifexDemo2026!` (PONTIFEX→Hub)
- [x] **iOS v1.0.3 / Build 8 (Face ID)** — bumped, archived (manual signing), exported IPA, uploaded to TestFlight via Transporter → processing
- [x] **4 prod pushes** (`818f646e`, `799f3180`, `562c3c57`, `6957f784`) — all deploys verified READY

### Ongoing / As-Needed
- [ ] **Tooling Phase A** (highest ROI) — add a date lib + `lib/dates.ts` + Sentry + first Vitest test. See `DEV_TOOLING_RECOMMENDATIONS.md`.
- [ ] **🔴 iOS resubmission** — commit Info.plist fix, push, rebuild archive (Build 4), resubmit to App Store. See CLAUDE_HANDOFF.md top section.
- [ ] **APNs push server logic** — `lib/send-push.ts` exists + Vercel vars set; wire to `/api/push/route.ts` to actually send notifications
- [ ] Android app — after iOS approval: `npx cap add android`, $25 Google Play fee
- [ ] Supabase Auth rate limits (HIGH-2 fix) — Dashboard → Auth → Settings → enable (user action, 5 min)
- [ ] Twilio toll-free verification — twilio.com with opt-in URL at `/sms-opt-in`
- [ ] Rotate Twilio Auth Token (hygiene)
- [ ] Upload Patriot logo → Settings → Company Branding → Icon (Square)
- [ ] Apply pending migrations: `20260427_utility_waiver_fields.sql`, `20260427_operator_badges.sql`
- [ ] Schedule board extraction — `schedule-board/page.tsx` ~2850 lines, extract OperatorRow/JobCard/EditModal/DispatchModal
- [ ] CSP nonce-based (replace unsafe-inline, MED-5)
- [ ] Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in Vercel → restores address autocomplete
- [ ] Mobile responsive audit: maintenance wizard, maintenance inbox, inventory new-item modal
- [ ] Patriot-specific visual assets (logos, custom colors)
