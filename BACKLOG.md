# BACKLOG — single source of truth

> Every bug, feature, and chore lives HERE — not in CLAUDE.md, not in the handoff, not in chat.
> Priorities: **P0** = broken in prod / blocking · **P1** = this week · **P2** = soon · **P3** = someday.
> When work completes: check it off, move to "Recently shipped" (keep ~2 sessions), then delete.

## 📊 STATUS (update every session — this is the at-a-glance progress dashboard)

| | |
|---|---|
| **Phase** | 🚀 **LAUNCHING** — web live; both mobile apps in store review |
| **Prod** | ✅ LIVE — pontifexindustries.com (web `a0bf8bcb` — timecards batch + react-email white-label + start-time/late-entries + geofence/remote review) |
| **iOS** | Build 9 / v1.0.4 — **submitted, "Waiting for Review"** (v1.0.2 currently public). May be gated on Apple Developer Agreement re-acceptance. |
| **Android** | v1.0.1 / versionCode 2 — **IN REVIEW** (Play production, US). Managed publishing OFF → auto-publishes on approval. Photo-permission block fixed; uploaded via new `scripts/play-upload.mjs`. |
| **Open** | P0: ~0 (launch done) · P1: ~6 · P2: ~14 · P3: ~8 |
| **In flight** | Jarvis Phase 1 LIVE ✅ → Phase 2 (Claude brain, text) next — awaiting founder AI-Gateway greenlight |
| **Blocked on founder** | 🔴 Apple Developer Agreement re-accept (ASC) · Enable Places API (New) in Google Cloud · Approve Bryan's request · Sentry DSN |
| **Unpushed commits** | 🟢 All web LIVE. 3 native/tooling-only commits unpushed (`4c95d061` iOS bump · `1f730b02` Android manifest fix · `c5e4cd50` Play API script) — ride the next web push, no urgency. |
| **Last groomed** | Jun 22, 2026 |

## 🔴 P0 — Verify / unblock now

### ✅ LAUNCH — DONE (Jun 21–22) — both apps submitted, web live
- [x] ~~Jun-14 in-app fixes~~ — ✅ shipped & live (`2e8c4df0`/`a0bf8bcb`): notification-bell light-mode contrast, operator Manage-Profile hub, clock-in "asks Shop twice" removed, Face ID auto-prompt on launch.
- [x] ~~**Cut iOS Build 9**~~ — ✅ **SUBMITTED Jun 21** (1.0.4/9, "Waiting for Review"). Manual signing + Transporter + ASC submit done.
- [x] ~~**Google Play first release**~~ — ✅ **IN REVIEW Jun 22** (v1.0.1/vc2, production, US). Business account, package `com.pontifexindustries.platform`, all declarations + listing done. Google's pre-review check blocked vc1 for `READ_MEDIA_IMAGES` → removed it (manifest `tools:node="remove"`) → rebuilt vc2 → resubmitted, passed. Uploaded via new **`scripts/play-upload.mjs`** (Play Developer API; SA `firebase-adminsdk-fbsvc@…` granted Admin, Android Publisher API enabled on `pontifex-ind-1dc89`). Managed publishing OFF → auto-publishes on approval. Details in memory `android-play-release.md`.

### Jun 20 — founder weekend batch (timecards + email + remember-me) — UNPUSHED
- [x] ~~**Time-edit Approve/Modify/Deny → "Correction request not found"**~~ — ✅ FIXED `7e444909`. PATCH route embedded-selected non-existent `timecards` columns (`lunch_minutes`/`lunch_deducted`) → PostgREST 404'd the whole query. Now selects `lunch_duration_minutes`. DB-verified root cause; the LIST worked because it selects `total_hours`.
- [x] ~~**Clock-out/clock-in distance: km → miles**~~ — ✅ FIXED (unpushed). New `formatDistanceUS()` in `lib/geolocation.ts` (feet under ~0.1 mi, miles beyond) feeds both clock routes + the out-of-radius notification. 17 geolocation tests updated + green.
- [ ] **P1 — Remember-me unreliable on the iOS app** — logic is CORRECT (default-on flag, persistent-storage adapter, company-login auto-resume). Failure = WKWebView localStorage not surviving an app kill/relaunch → no session to resume. **Proper fix = Build-9 work:** persist the Supabase refresh token in the native Keychain + restore session on launch (`docs/plans/BIOMETRIC_REMEMBER_ME_PLAN.md`). Web browser remember-me already works.
- [x] ~~**Configurable start time + late-entries page**~~ (Task 3) — ✅ BUILT (`39ab354c`+`d70e98df`, unpushed). Resolution chain `lib/timecard-start.ts` (job ticket > per-day override > tenant standard) wired into clock-in — **fixes "clocked in at 8 not flagged" (late check used to skip when no job)**. New `timecard_day_overrides` table (migration applied). New `/dashboard/admin/timecards/late` page: late list + Standard Start Time/grace settings + Day Overrides manager (safety-training day 6:30 AM). Guardian-reviewed, 25 tests green. Design: `docs/plans/START_TIME_LATE_PLAN.md`. **Remaining (P3):** schedule-form "different start time" affordance (per-job already works via `job_orders.arrival_time`; this is the UI bridge to digital tickets).
- [x] ~~**Email UI redesign**~~ (Task 2) — ✅ BUILT (`b4933fb6`, unpushed). Migrated all 5 transactional emails to **react-email**: new `emails/` component system (BrandedEmail layout — forced light color-scheme to beat dark-mode inversion, white card, glossy red→navy gradient bar, bigger 72px logo on a white plate; CTAButton; 5 templates), white-label via `getTenantEmailBranding`. `lib/email.ts` generators now async/render(); 5 call sites await. Reference previews: `docs/reference/email-previews/*.html` (regen via `scripts/render-email-previews.mjs`). Verified: tsc, 13 jest link tests, build green. **Founder: eyeball the preview HTMLs.**
- [x] ~~**Geofence detail in time-edit-requests + remote clock-in surfacing**~~ (Task 4 remainder) — ✅ BUILT (`19b72561`, unpushed). Corrections GET embeds geofence/photo cols + computes clock-out distance from shop (miles/ft); each request card shows "clocked out X from shop (outside radius)" + clock times + map link. New "Remote clock-ins" tab shows pending remote clock-ins' selfie photo + GPS coords + Approve/Reject (via existing remote-verify API). Guardian PASS, 38 tests, build green.

- [x] ~~Verify invite email works on prod~~ — ✅ Jun 10: founder's resend hit `PUT /api/admin/invite`
      → **200** (was 502 before the sanitizer). Email outage CONFIRMED resolved. Adam Ingalls'
      invite went out — confirm he received it.
- [x] ~~Revert temp invite diagnostic~~ — ✅ Jun 10: EMAIL DIAG logging + raw-error response removed.
- [x] ~~**Supabase Free → Pro ($25/mo)**~~ — ✅ DONE Jun 21. Payroll data now has automated daily
      backups + PITR-eligible. (Was the top data-safety gap.)

## 🟠 P1 — This week

- [ ] **iOS Build 8 (Face ID)** — founder: install from TestFlight, test Face ID on device →
      submit v1.0.3 for App Store review (`.claude/skills/ios-release/SKILL.md`).
- [ ] **Exercise remaining email routes live** (invoices send/remind/payment, demo-request,
      silica-plan, liability PDF) — all now use the sanitized key + verified domain, but untested in prod.
- [ ] **Sentry DSN** — code is fully wired & gated; founder sets `SENTRY_DSN` +
      `NEXT_PUBLIC_SENTRY_DSN` in Vercel → instant prod error visibility. (Phase A, docs/plans/PHASE_A_KICKOFF.md)
- [ ] **Supabase Auth rate limits** — Dashboard → Auth → Settings (HIGH-2 from security audit).
- [x] ~~Clean up Vercel env vars~~ — ✅ Jun 12 via authed CLI: deleted unused `RESEND_FROM_EMAIL` +
      typo'd `EXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (same paste-error class as the RESEND key).
      Remaining cosmetic: the malformed `RESEND_API_KEY` value (code self-heals it).

## 🟠 P1 (added Jun 12 — schedule-form session)

- [ ] **🔴 FOUNDER: enable "Places API (New)" in Google Cloud Console** for the project behind
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (+ keep "Maps JavaScript API"; ensure the key's HTTP-referrer
      + API restrictions allow pontifexindustries.com/* and *.vercel.app/*). The address-autocomplete
      code fix (`451b124a`) migrated to Places API (New) + degrades to manual entry, but suggestions
      only work once this API is enabled. Add localhost:3000/* to referrers for local dev.
- [ ] **Remove dead dep `use-places-autocomplete`** (`npm uninstall`) — zero imports after the Maps fix.
- [ ] **GoogleAddressAutocomplete dark-mode** — component is light-only (pre-existing, not a regression
      from the rewrite); add dark: variants when convenient.
- [x] **🟠 Schedule-form EDIT MODE is lossy** ✅ Jun 16 — FIXED both sides (summary read + PATCH write):
      `/api/admin/jobs/[id]/summary` builds an explicit `job` object the edit-load reads, but it
      OMITS ~12 fields the form maps: scope_details, scheduling_flexibility, site_compliance,
      jobsite_conditions, equipment_needed/details/selections, customer_id, location_name,
      site_contact, contact_phone, estimated_cost. Editing a job silently loses these + can wipe
      them on re-save. ppe_required + additional_safety_requirements already fixed (`73bc5029`);
      reconcile the rest of the select against the edit-load mapping.
- [x] ~~Smart-fill → evolved into the **Jarvis Command Center**~~ — Phase 1 (HUD shell) shipped Jun 13
      (`88efd8d3`): arc-reactor canvas + tabs + live data rail + launch tile, read-only, 0 AI cost.
- [ ] **Jarvis Phase 2 — the brain (text):** `POST /api/command-center/assistant` (Claude via Vercel
      AI Gateway, tenant-scoped READ-ONLY tools) + text chat in the HUD answering "how's the app
      doing?". Founder: confirm AI Gateway + a monthly $ ceiling. Plan: docs/plans/JARVIS_COMMAND_CENTER_PLAN.md §3.
- [ ] **Jarvis Phase 3 — the voice:** ElevenLabs British voice (founder provisions the key) +
      reactor pulses to audio (amplitude prop already wired) + web speech-in. iOS = type for v1.
- [ ] **Jarvis Phase 4 (later):** gated write/action tools behind confirmations.

## 🟠 P1 (added Jun 10)

- [ ] **Platform Hub v2** — tenant-creation WIZARD (schedule-form-style sequence, pre-fill from a
      demo lead, branding preview, module presets, first-admin invite) + control-center overview.
      Plan: docs/plans/PLATFORM_HUB_V2_PLAN.md. Phase 1 (demo-requests inbox) shipped Jun 10.
- [ ] **Login title/tagline still swap during branding load** on `/login` — logo flash fixed Jun 10
      with a skeleton; "Welcome Back" → "Welcome to Patriot" text swap remains (minor polish).

## 🟡 P2 (guardian nits from Jun 11 onboarding/avatar review)

- [ ] **Avatar DELETE doesn't remove the onboarding-uploaded file** (`avatars/{uid}.{ext}`) and old
      timestamped self-service uploads accumulate — prune both in DELETE/POST.
- [ ] **Setup success screen shows the local photo preview even if the fire-and-forget upload failed** —
      add "photo will appear shortly" copy or check the upload response; revoke `createObjectURL`.
- [ ] **Refresh path overwrites inviter-typed name/phone/DOB with public-form values** — consider
      not overwriting non-empty existing values.
- [ ] **Schedule-board avatar map keyed by display name** (two same-name operators share an avatar) —
      pre-existing pattern; fold into the schedule-board extraction refactor.
- [ ] **Jest picks up ~70 stale `.claude/worktrees/` duplicate suites** — add `.claude/` to
      `testPathIgnorePatterns` + clean the worktrees (disk re-inflating).

## 🟡 P2 (guardian nits from Jun 11 invite/access-request review — real but non-blocking)

- [ ] **Orphaned invitation on email-send failure** during access-request approval — claim reverts
      to pending but the `user_invitations` row persists → re-approve 409s. Recovery = Resend in the
      Invitations list; cleaner: delete the orphan on revert or reuse 'refresh' semantics.
- [ ] **`listUsers({perPage:1000})` in the cross-tenant takeover guard** stops covering auth users
      past 1000 — paginate or look up by email (load-bearing guard; fine at current ~25 users).
- [ ] **`sendEmail` dev fallback logs full HTML incl. setup-token URLs** when RESEND_API_KEY unset — gate it.
- [ ] **`lib/database.ts` legacy access-request getters use `select('*')`** via the public client —
      would ship `password_hash` if an RLS read policy ever lands; replace with explicit columns or delete.
- [ ] **Public request-access confirmation email hardcodes "Patriot Concrete Cutting"** — white-label violation.
- [ ] Public request-access form collects password + DOB the new flow never uses; consent checkboxes not sent despite columns existing — simplify the form.

## 🟡 P2 (guardian nits from Jun 10 time-off review — real but non-blocking)

- [ ] **PTO balance adjustments are fire-and-forget** in the approval route — await + surface failure
      (quasi-financial record shouldn't silently drift).
- [ ] **Weekend pay mismatch**: approval inserts 8h paid timecards for ALL calendar days while the
      PTO debit counts business days only — filter weekends from the timecard inserts.
- [ ] **Time-off date picker min** should be the earliest eligible date (28 days out), not today —
      avoids a guaranteed 422. Also: timecard page still uses alert() for clock-in errors → toasts.

## 🟡 P2 — Soon

- [ ] **Module gating phase 3: API enforcement** — apply `requireModule()` to non-core API routes
      (UI + deep-link gating already live; data is still served on direct API calls).
- [ ] **Mobile audits remaining**: maintenance wizard, maintenance inbox, inventory new-item modal.
- [ ] **Schedule board extraction** — `schedule-board/page.tsx` ~2,850 lines → extract OperatorRow,
      JobCard, EditModal, DispatchModal.
- [ ] **Loading/error-state audit** on remaining low-traffic admin pages (~45 pages, round 4).
- [ ] **SEO homepage rewrite** — custom-software + agentic-automations positioning, robots/sitemap/
      OG/JSON-LD, Patriot case study (docs/plans/SEO_HOMEPAGE_PLAN.md).
- [ ] **Date-lib migration follow-ups** — `operator/[id]/page.tsx` getWeekStart/getWeekEnd still UTC.
- [ ] **Consolidate timecard settings tables** — key/value `timecard_settings` is bypassed; converge on v2.
- [ ] **`grant-super-admin` audit-log insert uses wrong columns** — silently failing (pre-existing).
- [ ] **Patriot visual assets** — founder uploads logo → Settings → Company Branding.
- [ ] **Verify address autocomplete on prod** — env audit (Jun 12) found `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` HAS been set in Production for ~25 days; the 'missing key' item was stale. Spot-check autocomplete on the schedule form; the local-dev console spam is just the key missing from `.env.local`.
- [ ] **Twilio**: toll-free verification + rotate auth token.
- [ ] **Understand-Anything pilot** — founder runs `/plugin install understand-anything` in Claude
      Code → `/understand` → commit the JSON graph → visual codebase dashboard for the team.

## 🟢 P3 — Someday / strategic

- [ ] **APNs**: wire `lib/send-push.ts` into `/api/push/route.ts` end-to-end + confirm token registration.
- [ ] **Android app** (`npx cap add android`, $25 Google Play) — after iOS settles.
- [ ] **CSP nonce-based** (replace unsafe-inline, MED-5).
- [ ] **codegraph pilot** — local MCP code index (~47% token savings for agents). Stage after
      Understand-Anything proves value; don't run two indexers at once.
- [ ] **Per-tenant subdomains** (`patriot.pontifexindustries.com`).
- [ ] **Project rating system** (memory: project_rating_system_plan.md).
- [ ] **TanStack Query / Zod / RHF adoption** — phased (docs/reference/DEV_TOOLING_RECOMMENDATIONS.md).
- [ ] **Restore drill** for backups once Supabase Pro is on.

## ✅ Recently shipped (context for current work)

- **Jun 9:** `RESEND_API_KEY` defensive sanitizer — self-heals the malformed Vercel env var that
  502'd ALL outbound email; 9 unit tests; deployed READY (`a56a2322`).
- **Jun 9:** Docs reorganization — 119 root MDs → organized `docs/` tree + ARCHITECTURE.md +
  BACKLOG.md + DEVELOPMENT_PLAYBOOK.md + project skills.
- **Jun 8:** Invite system (guardian-hardened), editable team emails, light-mode invite/setup pages,
  branding flash fix, verified-domain email fix, iOS Build 8 (Face ID) → TestFlight.
