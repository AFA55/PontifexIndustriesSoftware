# BACKLOG — single source of truth

> Every bug, feature, and chore lives HERE — not in CLAUDE.md, not in the handoff, not in chat.
> Priorities: **P0** = broken in prod / blocking · **P1** = this week · **P2** = soon · **P3** = someday.
> When work completes: check it off, move to "Recently shipped" (keep ~2 sessions), then delete.

## 📊 STATUS (update every session — this is the at-a-glance progress dashboard)

| | |
|---|---|
| **Phase** | 🚀 **LAUNCHING** — web live; both mobile apps in store review |
| **Prod** | ✅ LIVE — pontifexindustries.com (deployed `ff40da25` — Jul 1 live-blocker sweep: non-compete scrub, hooks bug, CI green, storage RLS) |
| **iOS** | ✅ **LIVE — v1.0.5 / Build 10 "Ready for Distribution"** (since Jun 30 — App Store metadata scrub of non-compete vertical language). No action needed. |
| **Android** | v1.0.1 / versionCode 2 — **STILL IN REVIEW** (Submission 4, Jun 22 — 10 days as of Jul 1). Founder filed a Play support ticket Jul 1 (case ID pending, 2-business-day reply). Separately: store-listing copy fix saved but **not yet submitted** ("Submit 2 changes for review" awaiting founder go-ahead). See `android-release` skill. |
| **Open** | P0: ~2 (Twilio + Play submit, both founder-action) · P1: ~3 · P2: ~13 · P3: ~8 |
| **In flight** | Twilio toll-free resubmission (founder correcting Company Type off Sole Proprietor) · Jarvis Phase 2 (Claude brain, text) — awaiting founder AI-Gateway greenlight |
| **Dev engine** | ⚡ Jul 1: worktree-builder + implementation-fidelity-reviewer team pattern proven on 4 parallel live-blocker fixes. See `docs/plans/JULY1_LAUNCH_BLOCKERS_TEAM_PLAN.md`. Prior: parallel-burndown Workflow + Playwright MCP (Jun 27), `docs/playbooks/PARALLEL_BURNDOWN.md` + `TOOLING_EVALUATION.md` Batch 3. |
| **Blocked on founder** | 🤖 Google Play review (auto-notifies) + support ticket reply · Twilio resubmission confirm · Sentry DSN · (AI-Gateway greenlight for Jarvis) |
| **Unpushed commits** | ✅ none — pushed through `ff40da25` (Jul 1 live-blocker sweep) |
| **Last groomed** | Jul 1, 2026 |

## 🚀 PATRIOT LAUNCH EPIC (the path to first revenue — Jun 27 founder-defined "done")

> Founder's definition of "Patriot is launchable + they'll pay." Audited Jun 27 (5 parallel scouts) —
> most is built; gaps below are real. Strategy: [docs/plans/PONTIFEX_STRATEGY_AND_ROADMAP.md]. Tiers:
> T1 = launch fixes (small/safe), T2 = smart-data UIs (new builds), T3 = Artifex showcase (post-launch).

**Tier 1 — launch fixes — ✅ DONE + LIVE (`9a6bf0b2`, pushed `2f3143c3`, guardian PASS):**
- [x] ~~**Clock-in reminder frequency not wired**~~ — admin notifications Settings has `clock_in_reminder_time` but the cron (`/api/cron/clock-in-reminders`, hardcoded `*/5`) ignores it. Wire the cron to read the tenant setting (active-hours/time window) so the founder can actually "set the frequency." Also hide/implement the dead settings fields (overtime alert, approval reminder have no cron). Admin Send/Settings/History UI already exists (`app/dashboard/admin/notifications/page.tsx`).
- [x] ~~**Job completion robustness**~~ — ✅ DONE. `generate-completion-pdf` swallowed `completion-pdfs` bucket-creation failure → completion looks successful but PDF is missing. Return an error instead. (Optional) add a "signature captured" guard before marking complete. (Creation/assignment/step-through/signature→PDF→save all verified working.)
- [x] ~~**Shop cleanup**~~ — ✅ DONE (inbox count wired + dead operator route deleted). Follow-ups: drop the unused legacy `equipment_maintenance_requests` table via a reviewed migration; delete the now-orphaned `components/.../MaintenanceRequestCard.tsx`. Originally: deprecate the unused legacy `equipment_maintenance_requests` table + `/api/operator/maintenance-requests` (active system is `maintenance_requests` + admin inbox, which works end-to-end incl. notify). Wire `ShopManagerDashboard` maintenance inbox count (stubbed to 0 at line ~69) to `/api/admin/maintenance-requests?status=open`. Verify breakdown→notify fires on prod.
- [x] ~~**Schedule board multi-operator**~~ — ✅ DONE + verified working (duplicate→reassign). FIXED a real bug: duplicate was copying the operator assignment (double-assign); now lands unassigned. Button relabeled "Duplicate" + helper copy. Future option (not built): a `job_operators` junction table for true multi-op (multi-day refactor; duplicate-and-reassign ships today). Originally: the "duplicate job → assign different operator" workflow ALREADY exists (`/api/admin/job-orders/[id]/duplicate` + EditJobPanel copy button; jobs are single-operator-by-design + `parent_job_id` links copies). Confirm it's discoverable + smooth; light UX polish if needed. (Production rolls up by `parent_job_id`.)

**Tier 1.5 — caught during live testing (Jun 28):**
- [x] ~~**Job-detail page 500: office-documents**~~ — ✅ FIXED + verified live (`acc52b38`, prod 200). `GET /api/admin/jobs/[id]/office-documents` returned 500 ("Failed to fetch office documents") on the job-detail page. Root cause: PostgREST embed `uploader:uploaded_by(full_name)` with no FK to resolve. Fix: migration adds FK `uploaded_by→profiles(id)` (applied) + route hardened to not depend on the embed (plain select + separate best-effort uploader lookup). Panel now renders clean. **Still unverified-by-Claude:** schedule-board duplicate→reassign live click-through (code+guardian verified; 30-sec founder manual check).

**Tier 2 — smart-data UIs (new builds; founder wants "clean UI to input + see analysis"):**
- [ ] **Operator production-input form** — linear ft / holes per operator per job → writes the EXISTING `equipment_usage` table (linear_feet_cut, operator_id, feet_per_hour auto-calc). Add explicit "holes" modeling (currently only `num_cuts` in scope JSON). No real-time input UI exists today.
- [ ] **Cost input + Project P&L / production dashboard** — surface the EXISTING `job_pnl_summary` view (revenue/labor cost/gross profit/margin) + per-operator production from `equipment_usage`. Operator rates already in `profiles.hourly_rate`; per-job `labor_cost` auto-calcs on clock-out. Build the read dashboard + a clean rate-input screen. OPTIONAL per tenant (works without rates). This is the data foundation Artifex reads.

**Customer Portal (client-facing) — audit Jun 28: ~70% ALREADY BUILT.** Magic-link `/portal/[token]` (job history + timeline), doc signing `/sign/[token]` (completion/utility-liability waiver/custom + PDF), customer survey, portal-access + signature emails — all white-label, all working. Gaps:
- [x] ~~**Customer status notifications**~~ — ✅ DONE (`741cbeee`, guardian PASS, uncommitted-pushed-pending): en-route + job-complete emails w/ portal magic-link, hooked into status route; SMS wired but dormant (Twilio toll-free pending). Files: `emails/Customer{EnRoute,JobComplete}Email`, `lib/portal-tokens.ts`, `lib/notify-customer.ts`.
- [x] ~~**Customer comments → notify management**~~ — ✅ DONE (`9c367dee`, guardian + rls-auditor PASS): `customer_comments` table + RLS, public token-gated POST/GET (rate-limited, escaped), portal thread + admin CustomerCommentsPanel, notifies admin/ops/super_admin + job creator (bell + email).
- [x] ~~**Live "In Route" location tracker (v1)**~~ — ✅ DONE (`4d8036a5`, guardian PASS): `operator_location_pings` table + RLS, operator broadcast hook (in_route dwell screen), strict in_route-only public read, portal LiveRouteTracker ("on the way" + last-updated). **v2 TODO:** geocode jobsite → real distance/ETA + Google map (job_orders has no dest coords today).
- [ ] **Auto-trigger liability waiver on completion** (exists but manual-only today).
- [ ] **Twilio toll-free verification** (founder + Twilio task) — unblocks ALL customer/site-contact SMS (signature links, survey, en-route/complete texts). Email works now; SMS is the only blocked channel.

**Branding/Settings design pass (founder ask) — editor ~95% built:** 1-line fix = `/api/admin/branding` PATCH+upload are `requireSuperAdmin`, founder wants **admin too** → `requireAdmin`. Clean hardcoded Patriot defaults (`lib/branding-context.tsx` support_email + `patriot-branding` cache key + `/patriot#pricing` link). Then design pass: focused color-palette editor + presets + contrast check + cleaner Settings. Spec in `docs/plans/CUSTOMER_PORTAL_GAPS_PLAN.md`.

**Tier 3 — Artifex (post-launch showcase; data already exists to query):** see `docs/plans/ARTIFEX_PLAN.md`. Answers "check Zack's OT + job value", "who had most production at project X", "total cost at project X", "any bad client ratings" (surveys). Build on the Claude/Vercel-AI-Gateway path (founder greenlight + budget pending).

**Non-blocking nits found in the audit (P2/P3):** PTO balance adjust + weekend-pay-mismatch are fire-and-forget (already logged below); correction-rejection doesn't notify operator; signature-request orphan rows; lunch column duplication (`break_minutes` vs `lunch_duration_minutes`); maintenance equipment-status sync is fire-and-forget; mobile audit of maintenance wizard/inbox.

## 🔴 P0 — Verify / unblock now

### Jul 2 — full security audit + Artifex "2nd brain" upgrade + onboarding infra Phase 1
- [x] ~~**Tenant-creation wizard (Platform Hub v2 Build Item 1)**~~ — ✅ SHIPPED (`08ebf148`), unpushed. Replaces the flat "New Tenant" form with a 5-step guided sequence (Company → Branding → Modules → First Admin → Review & Launch), matching the founder's ask for scalable multi-company onboarding + a demo-request-to-tenant conversion path. Live company-code/slug uniqueness check, reactive login-page preview, 3 module presets (Starter/Field Ops/Full) over the existing switchboard, demo-request lead linking (`demo_requests.tenant_id`, column existed unused until now). Verified end-to-end live: created + inspected + cleaned up a real test tenant, 375px mobile clean, no console/network errors. Remaining Platform Hub v2 items (hub overview KPIs, brand polish) still open — see `docs/plans/PLATFORM_HUB_V2_PLAN.md`.
- [ ] **Ticket → AI draft-resolution pipeline** — not started. Founder wants a customer-ticket agent that investigates and drafts a proposed fix for approval (draft-only, never auto-applies — founder's explicit scope call). Builds on the existing `feedback_submissions` ticket system.
- [ ] **Automated health-check routines** — not started. Recurring background checks (broken data, stuck jobs, failed payments) surfaced as Platform Hub alerts.
- [ ] **Face ID diagnostic** — blocked on founder: needs him to open My Profile → Security on his device and report the diagnostic readout (available/enrolled/error code) before any more code changes — architecture reviewed and looks correct; further blind fixes would repeat what already failed.
- [x] ~~**Cross-tenant IDOR audit + fix (8 routes)**~~ — ✅ FIXED (`addd479c`, `1689d45f`), unpushed. Manual + adversarially-reverified audit of every `[id]`-keyed admin/API route found 8 CRITICAL/HIGH cross-tenant data leaks live in prod: `access-requests/[id]/update-user` (cross-tenant role escalation), `team-profiles/[id]/credentials` (PII), `timecards/operator/[id]` (bulk week approve/reject), `shop/work-orders/[id]`, `customers/[id]/contacts/[contactId]`, `job-pnl/[id]` (payroll leak), `form-templates/[id]`, `badges/[id]` + `team-profiles/[id]/badges`. All fixed + independently re-verified by a fresh adversarial audit (0 bypasses found across 24 handlers). Also patched CRITICAL `jspdf` dep vuln + HIGH `axios`/`ws`/`form-data`/`picomatch` via `npm audit fix --legacy-peer-deps` (verified jspdf call sites only use the safe API surface). tsc + build clean throughout.
- [ ] **Platform security dashboard** (Platform Hub) — not yet built. Design: platform-wide posture (advisor findings, dep vuln summary, RLS coverage) + per-tenant signals (role distribution, stale accounts, activity). Mirror `platform/tenants/[id]` tab pattern + `platform/health`'s "never fabricate a number" rule.
- [x] ~~**Artifex "2nd brain" upgrade**~~ — ✅ BUILT + verified live in browser (`5c94381d` + merges), unpushed. `NeuralBrain.tsx` replaces `ArcReactor` (radial node network, purple→pink→red gradient, idle/thinking/speaking states) — visually close to the founder's Instagram reference. Persistent conversation history (`artifex_conversations`/`artifex_messages`) + shared durable memory (`artifex_memory_notes`, `save_memory_note`/`recall_memory_notes` tools) — migration applied, RLS advisor-clean, adversarially re-audited. Sidebar lets a user resume/switch/delete past chats. **2 real bugs found only by testing live (not by tsc/build):** (1) keying the chat by conversationId caused a mid-stream remount wiping the response — fixed by separating "identity" from "remount key"; (2) `recall_memory_notes`' substring match missed a genuinely relevant note phrased differently — fixed with a recent-notes fallback + updated agent instructions. End-to-end verified: live tool-call answers match the metrics rail, save→new-chat→recall round-trip works, 375px mobile clean, zero console/network errors. Showcase target: LinkedIn demo video of the founder talking live to Artifex.

### Jul 1 — live-blocker sweep (director-audit follow-through; team plan: `docs/plans/JULY1_LAUNCH_BLOCKERS_TEAM_PLAN.md`) — 4/6 DONE
- [x] ~~**Non-compete leak on the LIVE WEBSITE**~~ — ✅ FIXED. 9 files scrubbed (`app/page.tsx`, `pricing`, `request-demo`, `offer`, `offer/success`, `patriot`, `request-access`, `login` fallback tagline, Stripe checkout description). Also caught the platform-WIDE login-page fallback tagline (`'Concrete Cutting Management System'` shown to any tenant, not just Patriot) — bigger leak than originally scoped. Left legal/operational docs (invoices, work orders, liability waivers) untouched since they describe Patriot's real business and must stay accurate.
- [x] ~~**Conditional React hooks bug, LIVE in prod**~~ — ✅ FIXED. `app/dashboard/admin/settings/page.tsx` `BillingSection`: early `return null` was gating hooks. Moved all hooks unconditional-first, role-check now inside `useEffect` body + a post-hooks return. `eslint` 0 errors (was 4), `tsc` clean, build clean.
- [x] ~~**CI red for 30+ consecutive pushes**~~ — ✅ FIXED as a side effect of the hooks fix (the 4 lint errors WERE the entire CI failure — confirmed against real GitHub Actions logs). Also fixed `.eslintrc.json` missing `"root": true"` (was cascading into ancestor configs when run from nested worktrees).
- [x] ~~**Public storage buckets allow anonymous file-listing**~~ — ✅ FIXED + applied to prod. Migrations `20260701_storage_buckets_deny_anon_listing.sql` + `20260701b_storage_buckets_drop_select_policies.sql`: removed SELECT/list policies entirely on `avatars`, `job-photos`, `jobsite-area-docs`, `scope-photos`, `site-compliance-docs` (reads still work via `getPublicUrl()`, which bypasses RLS by design; uploads/deletes unchanged). Advisor re-scan: 0/5 `public_bucket_allows_listing` findings remain. Residual (not done): object paths aren't tenant-namespaced, so true per-tenant storage isolation would need a path-restructure — flagged as future hardening, not urgent (a still-authenticated user can't enumerate, only direct-URL-access paths they already have).
- [ ] **Twilio toll-free verification REJECTED** (30530, Entity Misclassification) — root cause + exact fix in `docs/playbooks/TWILIO_TOLLFREE_RESUBMIT.md`. Founder-action only (Claude can't log into Twilio). Resubmit before **Jul 9** to keep priority queue.
- [ ] **Google Play submission #4 still "In review" 9+ days** (since Jun 22) — confirmed no policy issues, developer verification complete, nothing missing on our end. Only lever left: contact Play support for a status check (drafted, not sent).

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
- [x] ~~**🔒 SECURITY: `voice-checkouts` storage bucket cross-tenant leak**~~ — ✅ FIXED + APPLIED to prod Jun 27 (`96964571`, migration `20260627_voice_checkouts_drop_broad_policies.sql`). Dropped the 3 broad authenticated policies (`auth_upload/read/delete_voice_checkouts`); verified zero voice-checkouts policies remain. All access stays server-side via `supabaseAdmin`. rls-policy-auditor: PASS. (First proof-batch item of the new parallel-burndown engine.)
- [x] ~~Clean up Vercel env vars~~ — ✅ Jun 12 via authed CLI: deleted unused `RESEND_FROM_EMAIL` +
      typo'd `EXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (same paste-error class as the RESEND key).
      Remaining cosmetic: the malformed `RESEND_API_KEY` value (code self-heals it).

## 🟠 P1 (added Jun 28 PT2 — founder testing batch: bugs FIXED, features triaged)

**FIXED + pushed (`f7d4a536`+`8eb9a46d`):** Settings access for admins · Attendance shows ALL operators (5→14) · Face ID enroll nudge (Remember-Me resume skipped the prompt) · coherent button gradients · Payroll header button labels/spacing.

**Features to build (founder testing):**
- [x] ~~**In-app issue/feedback reporting → Pontifex dashboard**~~ ✅ DONE (`d770f961`). Settings → "Report an Issue / Request a Change" form (bug/change_request/idea + title + area + description + your-submissions list) → existing `feedback_submissions` + `/api/feedback` (already notifies admins/super_admins) → already surfaced per-company in `/dashboard/platform/feedback` with status pipeline. Dogfoods `components/ui`. **Phase 2 (Jarvis track):** agents read a tenant's reports → ask qualifying questions → auto-make the fix → show in Pontifex dashboard which agent handled it.
- [ ] **Inventory voice checkout overhaul** — split by feasibility:
  - **Buildable now (no deps):** add **truck number to operator Team Profile**; a **"checked-out equipment BY operator"** view; manual (tap) checkout-to-operator/truck; **blade checkout** = photo capture of the blade sticker + fields for serial # / blade size / spec (manual entry v1).
  - **Voice — has hard deps:** the "service-not-allowed" error = **Web Speech API doesn't work in the iOS app webview** (memory-confirmed) + needs mic permission/HTTPS on web. To do voice IN THE APP needs the **native `@capgo/capacitor-speech-recognition` plugin → a NEW iOS build**. And "must be spot on" multi-item parsing ("zack gas power pack 4, baker scaffold, chainsaw 4, 2 chains and binders, done"; "checkin all") really wants an **LLM parse (Claude via AI-Gateway — not greenlit yet)** for accuracy vs a brittle rules parser. So voice = native-build + AI-Gateway dependent; the data model + manual + blade-photo parts ship first.
  - Blade-sticker **OCR** (auto-extract serial/spec from the photo) = vision step, later; manual entry first.

## 🟡 P2/P3 (added Jun 28 — launch workflow validation nits; core flow verified ✅ + fixed)

> Full create→assign→schedule→operator→board→maintenance flow traced (4 validators) + the launch-relevant
> bugs fixed (`4b2dc2fd`: notify-race, active-jobs polling, bell badge, work_type miscategorization, helper-on-edit).
> Remaining lower-severity items:
- [ ] **Schedule board doesn't live-poll** (P2) — board reflects status on reload/drag, not real-time. Likely by-design (planning/dispatch tool; the job-detail live-status panel DOES poll 60s). Add `useVisiblePoll` only if founder wants the board itself as a live field-ops monitor.
- [ ] **`on_site` status label has no DB enum** (P3, cosmetic) — UI derives "On Site" from `arrived_at_jobsite_at` timestamp; the CHECK constraint only has `in_progress`. Works; semantically loose.
- [ ] **active-jobs progress % lazy-loads** (P3) — per-job summary fetch (concurrency 3) shows "Loading progress…" ~5-10s on mount. Consider batching into the list query.
- [x] ~~**Maintenance: no EMAIL for new requests**~~ — ✅ DONE. `app/api/maintenance-requests/route.ts` POST now calls `sendNotification()` (lib/send-reminder.ts, category `maintenance_update`) per manager instead of hand-rolling an in-app+push-only insert — managers with email enabled on that category now get email too, respecting each manager's own `notification_preferences`. Extended `sendNotification`'s `ReminderOptions` with `notificationType`/`relatedEntityType`/`relatedEntityId` overrides so the bell keeps the specific `maintenance_request` icon + `related_entity_id` link instead of collapsing to the generic category.
- [x] ~~**Maintenance Inbox nav badge not wired**~~ — ✅ DONE. `components/DashboardSidebar.tsx`: added `badgeKey: 'maintenance'` to the Maintenance Inbox nav item, extended `BadgeCounts`/`useBadgeCounts()` to fetch `/api/admin/maintenance-requests?status=open` (same shape/pattern as timecards/notifications; non-shop roles just get a 403 → badge stays 0, same graceful-degrade as the other two).
- [x] ~~**Maintenance resolve redirect**~~ — ✅ DONE. `app/api/admin/maintenance-requests/[id]/route.ts` resolve-notification now points `action_url` (and the push `route`) at `/dashboard/notifications` instead of `/dashboard/maintenance/new` (the new-request form). No submitter-facing detail route exists and the triage inbox is role-gated away from most submitters, so the notifications page — where the resolution message itself lives — is the safe universal landing spot.
- [ ] **Quick-add no customer auto-link** (P3) — CRM link only on full schedule form; fine (deferred to full-form).
- [ ] **status-route claim-error not logged** (P3 nit) — a DB error on the claim update silently suppresses the customer email rather than logging; add a console.warn for observability.

## 🟠 P1 (added Jun 28 — UNIFICATION campaign: change/edit/duplicate across companies)

> Founder: unify the software so parts can be changed/edited/duplicated into other companies. Audit verdict:
> backend already unified (api-auth/rbac/branding/dates/email/module-registry); the gap was the UI (every page
> hand-rolled buttons/cards/modals inline → brand sweep took ~170 files). Path chosen: build the component
> library now + adopt incrementally; defer the bigger reuse work to when company #2 is real.
- [x] **Core UI component library** ✅ (`be958658`-era) — `components/ui/` (Button, Card, Modal, StatusBadge, EmptyState, StatCard, Tabs, Alert, PageHeader, Spinner) + `lib/cn.ts` + barrel; brand-aware, dark-mode, 44px taps. UI_CATALOG references real components now. Proof migration: admin/fleet.
- [x] **DRY helpers** ✅ — `lib/signed-urls.ts` (5 sites) + `lib/status-colors.ts` (5 sites).
- [ ] **Incremental adoption (ongoing):** migrate hand-rolled pages to the `components/ui` primitives as they're edited/built — every new screen uses the kit. Highest-traffic first (schedule board, customers, jobs, timecards). NOT a big-bang retrofit.
- [ ] **Deferred to company #2 / post-Patriot** (the "implement into other companies" layer): activate feature-gating (`requireModule` is built but unused → enforce on non-core routes); make PDF/invoice generation branding-agnostic (currently hardcoded Patriot); extract the reusable `pontifex-starter` template; document module dependencies. Full audit in this session's history.

## 🟠 P1 (added Jun 28 — founder testing findings, admin + super_admin)

- [x] ~~Remove broken "Operator View" button~~ ✅ (`3d80ec2f`) — gone from sidebar.
- [x] ~~Settings not visible to admins~~ ✅ (`3d80ec2f`) — sidebar Settings now admin+super_admin+ops.
- [x] ~~Admins can't edit branding/colors~~ ✅ (`3d80ec2f`) — branding write routes requireSuperAdmin→requireAdmin (tenant-scoped; guardian PASS).
- [x] ~~Site Visit Reports: admins shouldn't add (supervisors/PMs do)~~ ✅ (`3d80ec2f`+`a5c86b2b`) — New-Visit button hidden for admins + server-enforced (READ_ROLES vs CREATE_ROLES; create = supervisor/ops/super_admin). No `project_manager` role exists — supervisor/ops cover it; flag if a dedicated PM role is wanted.
- [x] ~~Visit Report detail UI redesign~~ ✅ (`02a4fb6e`) — brand-token hero + design-system surfaces.
- [x] ~~Analytics looks off / "no data"~~ ✅ (`a83013c7`) — data was REAL+tenant-scoped (looked empty = sparse demo data); fixed the VISUAL (design-system cards + brand header + chart reads var(--color-primary)).
- [ ] **🎨 BIG (IN PROGRESS): full color-palette → ENTIRE-app theming.** Founder: changing colors in Settings must recolor the WHOLE app, "not just some areas," for every company code incl. Pontifex. Foundation done (brand tokens + admins can edit). Brand-sweep campaign by impact (visible screens first; debug/rare-modal long-tail last):
  - [x] Wave 0 (Jun 27): root fix + 16 high-visibility files (bell, sidebar, top modals, dashboard home, etc.)
  - [x] Wave 1 (Jun 28): **Platform Hub** → Pontifex dashboard themes to its own palette (44 conv, 11 files, `4d8036a5`-era).
  - [x] Wave 2 (Jun 28): **operator daily flow** (my-jobs, job-schedule steps, timecard) — ~158 conv, 31 files.
  - [x] **Admin area (~207 files) — ✅ DONE (Jun 28, waves A–D, exhaustive):** schedule-board+forms (A, ~144), settings/analytics/subscription/system-health/ops-hub (B, 60), jobs/customers/timecards/operator-profiles/job-pnl (C, ~158), all remaining admin dirs (D, ~280). tsc+build green each wave. Remaining hardcoded purple = INTENTIONAL leaves (role/job-type/status categorical maps, night-shift indigo, blue hero gradients, neutral slate, color-swatch previews) — NOT brand theming.
  - [ ] **Optional polish:** (a) blue hero gradients (`from-blue-500 to-indigo-600` on a few admin heroes/CTAs) — convert to brand only if founder wants those too (deliberate full-gradient rewrite, not a swap); (b) ambient page-background washes; (c) remaining shared components long-tail (~30 misc components outside dashboard dirs).
  - [ ] **Settings/branding editor polish** — Twilio-style clean layout, live preview, presets, contrast check (editor is functional; admins can now edit; this is UX polish).
  - [ ] Optional: brandize ambient page-background washes + header bands (left as neutral slate/blue chrome in waves 1-2; convert if founder wants whole-page chrome to follow the palette).
- [ ] **Face ID enroll prompt may not fire via the DEMO-account login path** — founder on v1.0.4/Build 9 (plugin present) saw no Face ID button (correct pre-enrollment) AND wants to confirm the post-password-login "Enable Face ID?" prompt appears. Investigate whether the "Demo Account Access" login bypasses the enroll prompt; confirm normal password login shows it. (Native — verify on-device; can't loop-test.)
- [ ] **Demo super_admin** — `super@pontifex.com` / `super0202!` exists (Patriot). If broken, reset via admin tools (Claude can't create accounts).

## 🟠 P1 (added Jun 27 — surfaced during dev-velocity sweep)

- [ ] **🎨 Tenant brand-token sweep — finish the long tail (~290 files).** ROOT CAUSE FIXED + 2 waves done (`90493401`/`f653b4e3`/`7c60735d`, pushed). The `tailwind.config` now has tenant-aware `brand`/`brand-dark`/`brand-secondary`/`brand-accent` tokens (driven by `--color-*-rgb` vars BrandingProvider sets; safelisted; verified live = Patriot red/navy). 16 highest-impact files converted (~213 swaps): NotificationBell, DashboardSidebar, NFC/QuickAdd/Invite/RichEdit modals, dashboard home, timecard, my-profile, request-time-off, JobHistory ×2, EquipmentUsageForm, AddBladeWizard, admin home, admin/customers. **Remaining:** ~290 files still hardcode purple/violet/indigo as brand (rest of admin pages, remaining modals, equipment/job components). Run more `parallel-burndown` waves (4 builders × 2 files, guardian-review each, convert brand-purple→`brand` tokens, LEAVE semantic status/category colors + night-shift indigo). Full per-file list was produced by the Jun 27 4-scout audit. **NIT to fold in:** several redundant `dark:text-brand` (== base) can be dropped for tidiness.
- [ ] **🔒 SECURITY: 5 PUBLIC storage buckets allow listing** — `avatars`, `job-photos`, `jobsite-area-docs`, `scope-photos`, `site-compliance-docs` have broad SELECT policies flagged `public_bucket_allows_listing` by Supabase advisor (rls-policy-auditor, Jun 27). Public buckets are world-readable by design, but *listing* lets anyone enumerate all objects. Decide per-bucket: make private + serve via signed URLs (like timecard-photos/voice-checkouts) OR remove the LIST capability. Highest concern: `site-compliance-docs`, `scope-photos` (may contain customer/jobsite detail).

## 🟡 P2 (added Jun 27)

- [ ] **`npm audit`: 59 vulns** (1 critical, 11 high, 46 moderate, 1 low) surfaced after the dep cleanup. Run `npm audit` → triage; many are likely transitive/dev. Don't blind `audit fix --force` (breaking changes) on a live app.
- [ ] **MCP/tooling trials (staged):** (a) **Claude Context** semantic-index MCP — trial only if agent token costs hurt on this repo; needs a Milvus/Zilliz store; measure vs native subagent-summaries (don't run two indexers — coordinate with the staged `codegraph`/Understand-Anything). (b) **Conductor** Mac app — optional GUI over `claude --worktree`; adopt only if managing 5+ parallel agents in terminals gets unwieldy. Verdicts in `TOOLING_EVALUATION.md` Batch 3.

## 🟢 P3 (added Jun 27)

- [ ] **`grant-super-admin` audit insert → use `logAuditEvent` helper** (guardian NIT): the inline fire-and-forget `.catch(()=>{})` doesn't inspect the resolved `{error}`, so a *future* schema drift would again be silent. Switch to `lib/audit.ts logAuditEvent(...)` for DRY + error logging (confirm it captures `tenant_id`).

## 🟠 P1 (added Jun 12 — schedule-form session)

- [x] ~~**🗺️ Maps address autocomplete — ✅ RESOLVED + verified live Jun 23** (`113cd77a`).~~ TRUE root cause was our own **CSP in `middleware.ts`**: `script-src` lacked `https://maps.googleapis.com`, so the browser blocked the Maps JS `<script>` **client-side** (`blocked:csp`, transferSize 0) before any bytes reached Google — which is why Google metrics showed zero traffic, a direct fetch returned 200, and it failed only from the app. Fix: added `maps.googleapis.com` to `script-src` + broadened `connect-src` to `*.googleapis.com` + `maps.gstatic.com`. **Verified on prod:** `window.google` loads, Places lib loads, `fetchAutocompleteSuggestions('1600 Amphitheatre Pkwy')` → **5 suggestions**. (Also done in the saga: retired the orphaned key `AIzaSyB4kg…`; created dedicated website-restricted **"Pontifex Web Maps Key"** in `quantum-conduit-482219-a1` w/ referrers incl. `www.` + Maps JS + Places New + billing — all genuinely needed too. The CSP was the final blocker.)
  <details><summary>(superseded) original "set billing" note</summary>
      The Maps key (`AIzaSyB4kg…`, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) belongs to GCP project
      **"My Maps Project" (`quantum-conduit-482219-a1`)** — NOT the Firebase project. Diagnosis via
      live console + network: Maps JavaScript API IS enabled there, but the **project has no active
      billing account** (the live `maps/api/js` request from www.pontifexindustries.com returns **503**;
      a no-referrer direct fetch returns a valid loader). This is almost certainly why maps/autocomplete
      "worked before then stopped" — **billing lapsed.** Claude began enabling **Places API (New)**
      (`places.googleapis.com`) on that project but Google requires a billing account first → the
      "Set the billing account for 'My Maps Project'" dialog was left open for the founder (financial
      action, founder-only). **DO:** pick the Maps Platform billing account → "Set account" (this also
      finishes enabling Places API New). **THEN verify:** the key's HTTP-referrer allow-list includes
      `www.pontifexindustries.com/*` (the app loads from the www subdomain), plus `pontifexindustries.com/*`,
      `*.vercel.app/*`, `localhost:3000/*`. Code fix `451b124a` already migrated to Places API (New);
      no code change needed.
  </details>
- [x] ~~**Remove dead deps**~~ — ✅ Jun 27 (`e25e8074`): removed `use-places-autocomplete`, `@react-google-maps/api`, `@simplewebauthn/browser`, `@simplewebauthn/server` (zero imports). Added `@types/google.maps` as a direct devDep (the maps lib had been providing it transitively → tsc broke without it; types-only, no dead runtime). Also deleted stale legacy `components/GoogleAddressAutocomplete.tsx`.
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
- [x] ~~**Jest picks up ~70 stale `.claude/worktrees/` duplicate suites**~~ — ✅ Jun 27 (`96964571`): added `.claude/` + `.next/` to `testPathIgnorePatterns` in `jest.config.js` (13 real tests intact, 0 from `.claude`). Worktrees dir currently empty.

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
- [x] ~~**`grant-super-admin` audit-log insert uses wrong columns**~~ — ✅ Jun 27 (`96964571`): used nonexistent `actor_id`/`target_id` + omitted NOT NULL cols → silently never wrote. Now correct schema (`user_id/user_email/user_role/action/resource_type/resource_id/tenant_id/details`). guardian-review: PASS. (NIT logged below: could switch to `logAuditEvent` helper.)
- [ ] **Patriot visual assets** — founder uploads logo → Settings → Company Branding.
- [ ] **Verify address autocomplete on prod** — env audit (Jun 12) found `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` HAS been set in Production for ~25 days; the 'missing key' item was stale. Spot-check autocomplete on the schedule form; the local-dev console spam is just the key missing from `.env.local`.
- [ ] **Twilio**: toll-free verification + rotate auth token.
- [ ] **Understand-Anything pilot** — founder runs `/plugin install understand-anything` in Claude
      Code → `/understand` → commit the JSON graph → visual codebase dashboard for the team.

## 🟢 P3 — Someday / strategic (small follow-ups from Jun 22 PT2)

- [ ] **One un-migrated email remains:** `app/api/admin/notifications/send/route.ts` still builds inline HTML with hardcoded "Patriot" — migrate to the react-email system like the other 13 (email-guardian NIT).
- [ ] **`timecard_settings_v2.late_grace_minutes` column default is 15** while code fallback is 7 — only affects brand-new tenants who never open Late settings. Consider changing the column default to 7 for consistency with the "more than 7 min" intent (Patriot is already 7).
- [ ] **Dedupe the signed-URL helper** — identical `signTimecardPhoto`/`signPath` now in `remote-verify/route.ts` + `operator/[id]/route.ts`; extract to `lib/timecard-photos.ts` to prevent drift.
- [x] ~~**Delete stale legacy `components/GoogleAddressAutocomplete.tsx`**~~ — ✅ Jun 27 (`e25e8074`): deleted (was unimported; active one is `components/ui/GoogleAddressAutocomplete.tsx`).



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

- **Jun 23 — committed, UNPUSHED (5 commits, one push deploys all; all guardian-PASS):**
  - **Time-off overhaul** (`b77ca30e` + `4d120ecd`): Log modal now lists ALL company profiles (was empty — wrong endpoint + operator-only filter); rank-based approval, never auto-approved (admin approves below-admin incl. project-manager/salesman+supervisor, super_admin approves all, self-approval blocked); **callouts/no-shows recorded immediately + notify ALL management**, planned requests pending + notify approvers; approved non-operators show in a new schedule-board **"Out Today"** card (operators keep in-slot OUT marker). No migration. Security-reviewed (no privilege escalation, no PTO double-debit).
  - **Email header fix** (`e67d39f2`): invite/email logo was a broken-image box, off-center, cramped → renders + centers (Outlook-safe table) + proper spacing + no duplicate name; white-label-safe.
  - **Remember Me default OFF** (`c736406b`): unchecked by default, user opts in; consistent across login/company-login/`lib/supabase` adapter; existing remembered users unaffected.
  - **Secure biometric Face ID** (`dca49afd`): deep-research-driven rework — stores the Supabase **refresh token** (not password) in the Keychain, **OS-enforced** (`BIOMETRY_CURRENT_SET`), decoupled from Remember Me, explicit opt-in (post-login prompt + My Profile→Security toggle), per-user binding (no cross-account restore on shared devices). **Ships via web — no new iOS build** (Build 9 already bundles plugin 8.4.5). Plan: `docs/plans/BIOMETRIC_LOGIN_ARCHITECTURE.md`.
  - **iOS v1.0.4 APPROVED** by Apple review (Ready for Distribution); founder accepted the updated Developer Program License Agreement.
- **Jun 22 (PT2) — ✅ PUSHED + LIVE (deployed `0aaf111d`):**
  - **Email white-label migration** (`b2e68357`) — migrated all 13 remaining raw-HTML transactional emails (invoices send/remind/payment, signature, completion+liability PDFs, customer survey, portal, silica, schedule, clock-in reminder, salesperson, demo) to the react-email `BrandedEmail` system; removed every hardcoded "Patriot"/`billing@patriotconcretecutting.com`/hex/phone leak (now `getTenantEmailBranding`); routed `demo-request` through `sendEmail()` (was a raw fetch w/ raw key). Guardian PASS. Previews regenerated in `docs/reference/email-previews/`.
  - **Notifications deep-link** (`a5fdc9df`) — schedule-board had a 2nd broken `NotificationBell` that never routed on click; replaced with the shared bell + deleted the dupe. Fixes "clicked the out-of-radius alert, went nowhere."
  - **Remote clock-in/out photos** (`20b1df36`) — were 100% broken (uploaded to a bucket that never existed → stored `'photo-upload-failed'`; all 14 rows lost). New PRIVATE `timecard-photos` bucket + server-side upload route + signed-URL reads on corrections + operator pages; client aborts on upload failure (no sentinel). **Security:** dropped over-broad authenticated storage policies (cross-tenant PII leak caught by rls-policy-auditor). Guardian PASS.
  - **Out-of-radius clock-out** (`20b1df36`) — already allowed+flagged+notified; now ALSO auto-creates a `timecard_correction_requests` row (`metadata.source='auto_out_of_radius'`, dedup-guarded) + the notification deep-links to /corrections.
  - **Late flag recompute on edit** (`2e4af405`) — editing a clock-in time never recomputed `is_late` (blind-cleared or ignored); now all 4 edit routes recompute via a shared `computeLate` helper using strict `>grace` ("more than 7 min", Patriot grace already 7), tenant tz, and the timecard's own date. Guardian PASS, 17/17 tests.
- **Jun 9:** `RESEND_API_KEY` defensive sanitizer — self-heals the malformed Vercel env var that
  502'd ALL outbound email; 9 unit tests; deployed READY (`a56a2322`).
- **Jun 9:** Docs reorganization — 119 root MDs → organized `docs/` tree + ARCHITECTURE.md +
  BACKLOG.md + DEVELOPMENT_PLAYBOOK.md + project skills.
- **Jun 8:** Invite system (guardian-hardened), editable team emails, light-mode invite/setup pages,
  branding flash fix, verified-domain email fix, iOS Build 8 (Face ID) → TestFlight.
