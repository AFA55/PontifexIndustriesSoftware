# CLAUDE_HANDOFF.md — Pontifex Industries Platform

**Last updated:** Aug 7, 2026 (Opus 5) | **Branch:** `fix/operator-walkthrough-p0` (4 commits, **UNPUSHED — awaiting founder go-ahead; he has spent $15 on Vercel and asked to batch pushes**) | **Prod:** ✅ LIVE on `main` through `9dcc2b88`.

> ## 📌 Aug 7 (Opus 5) — tasks #64, #66, #60. Three review rounds, every fix verified against production data or in the live app.
>
> **THE THEME, again:** the read path not matching the write path, failing silently — plus a new
> variant: **software that reports success it never checked**, and **software that shouts about a
> failure that didn't happen**. Both cost a crew member time on site.
>
> ### Task #64 — the four bugs from the founder's operator walkthrough
> - **"Add Another" → blank page.** `handleAddMore` cleared `currentItem` but left
>   `showQuantityModal` true; the detail panel, the search box, the work-type picker and the
>   bottom bar are ALL gated on `!showQuantityModal`.
> - **The work-item dropdown had no way out.** Opened on focus, ignored taps away and Escape.
>   Now pointerdown-outside + Escape + a 44px close button. Taps INSIDE still select (verified).
> - **"Send Link & Complete Job" gave no feedback.** The toast is `z-50`; every modal is also
>   `z-50` but LATER in the DOM, so it rendered *behind* the overlay. Raised to `z-[100]`, added
>   an inline error in the panel, and started checking the SMS + daily-log + completion-request
>   responses — all three were fired and ignored, so a failed text still said "Link Sent!".
> - **"Rate your crew" never went away — because it had NEVER WORKED.** The client fetched form
>   questions from `/api/admin/rating-forms/[id]`, which is `requireAdmin`; every eligible rater
>   is an operator/apprentice/supervisor, so it 403'd, the error was swallowed, and the Rate
>   button rendered nothing. `rating_submissions` had **zero rows in production**. Questions now
>   ship with the pending prompt. **First rating ever recorded during this session's testing.**
>   Separately, the tenant had TWO byte-identical active `rating_forms` (created 3 min apart in
>   May) so "already rated" keyed on `form_id` left the duplicate's prompt — now keyed on
>   (ratee, job). Duplicate form set `is_active=false` in prod.
>
> ### Task #66 — the dashboard was lying
> - **"Jobs Today" read 0/1 while the board listed 8.** `.eq('scheduled_date', today)` counts jobs
>   that *start* today; a multi-day job vanishes from the count the day after it begins. Now uses
>   the schedule board's own span predicate + its `job_daily_assignments` overlay, so the tile and
>   the board cannot disagree. Verified live: tile 8, board 8.
> - **Notifications "wouldn't stay dismissed."** Mark-all-read was never broken. The work-items
>   route inserted a fresh row per admin on EVERY save of the work-performed form. 30 of his 46
>   unread were `work_performed`, mostly literal repeats — two 27 seconds apart. Now ONE live row
>   per (admin, job, operator, tenant-day), and it **collapses existing duplicates as each job is
>   next saved**, so his backlog drains on its own.
>
> ### Task #60 — `profiles` has two phone columns
> `lib/profile-phone.ts` is now the single place that knows: `PROFILE_PHONE_SELECT`,
> `readProfilePhone()` (canonical `phone_number` first), `normalizeProfilePhone()` on write.
> Fixed two timecard routes and three cron SMS routes that read the legacy column *first*.
> ⚠️ **NOT backfilled, deliberately** — the only two rows with `phone` are both the founder's own
> accounts and the columns DISAGREE there. Logged as a founder decision in `BACKLOG.md`.
>
> ### New shared helpers (reuse these)
> - `lib/dates.ts` → **`startOfDayUTC(ymd, tz)`** — the bookend to `endOfDayUTC`. Use for any
>   "since the start of today" comparison against a `timestamptz`. `setUTCHours(0,0,0,0)` puts
>   that boundary at **8pm ET** and breaks exactly when crews are wrapping up.
> - `lib/tenant-timezone.ts` → **`tenantDayStartUTC(tenantId)`**.
> - `lib/profile-phone.ts` → the phone-column helpers above.
>
> ### Things I got wrong this session (caught by the review agents, so run them)
> - I claimed PostgREST won't AND two `.or()` params. **False** — `postgrest-js` `or()` calls
>   `searchParams.append`. My JS workaround ran *after* the row limit and could silently drop a
>   user's jobs — the same under-reporting I was fixing. Verify claims about libraries in
>   `node_modules`, not from memory.
> - I keyed the notification dedupe on UTC midnight in a tenant that runs on Eastern.
> - I made a 409 from `completion-request` an error. 409 means "already submitted", which is what
>   a *successful* first send produces — so resending a link told the operator to go find
>   dispatch about a job that was fine.
>
> ### State
> - **4 commits on `fix/operator-walkthrough-p0`, nothing pushed.** 699 tests pass (up from 686),
>   `tsc` clean. The 2 failing suites are the known pre-existing `postal-mime`/`resend` import.
> - **DEMO-2026-000002 reset to the very top of the flow** — status `scheduled`, work_items and
>   the day log cleared, and `in_route_at`/`arrived_at_jobsite_at`/`work_started_at` nulled (without
>   that last part the ticket renders as already under way).
> - **NEXT: Batch 1** of `docs/plans/OPERATOR_FLOW_REBUILD.md` — the entry-flow rebuild. Not started.

> ## 📌 Aug 5–6 (Opus 5) — bug-hunting on a live system. 12 pushes, all verified against production data.
>
> **THE THEME:** almost every bug was *software reporting success without checking*. Four audit
> writes had been silently rejected by a CHECK constraint for weeks. Customer signing links had
> been dead for EVERY token since launch (a PostgREST embed with no FK). Rejecting a PM ticket
> answered "Job order not found" for the same reason. Progress read a table nothing ever wrote.
> None of it errored anywhere. If a write matters, **await it and check it**.
>
> ### Shipped and verified live
> - **Job Scope & Progress** off 0% — progress now DERIVED from `work_items` via `lib/job-progress.ts`
>   (a vocabulary bridge: office says "Wall/Track Sawing", operators say "WALL SAW").
> - **Timecard PDF times** — rendered in the SERVER's zone; 7:07 AM printed as 11:07 AM on Vercel.
> - **Liability waiver** flow end-to-end + the SC waiver text (`lib/legal/utility-waiver.ts`,
>   researched against § 32-2-10, Title 58 Ch. 36. ⚠️ STILL NEEDS ATTORNEY REVIEW).
> - **Shop location + ETA engine** (`lib/eta.ts`) — Patriot's field-verified pin is now tenant data.
> - **Admin job pages crashed** the moment progress data became real (my own regression).
> - **David's supervisor photos** — private bucket served via `/object/public/` URLs → 403, invisible.
> - **Rejecting a PM ticket** — now works, notifies, and reopens THEIR form with everything intact.
> - **Work-item double-counting** — replace keyed on unstable `day_number`; now on `daily_log_id`.
> - **Input sweep** — invoice rate couldn't take `0.75`; Job Scope Save was dead with no reason.
> - **`equipment_selections` corruption** — my normalizer treated a JSONB object as a list. Caught
>   before any row was saved through the edit form. **Never add it to `JOB_LIST_COLUMNS`.**
>
> ### Founder decisions recorded
> - Duplicates = **linked children**; scope + progress roll up to the parent, only hours/work are per-person.
> - Office force-complete: operator goes **read-only AFTER he submits his current day**. Admin,
>   ops manager AND supervisor may do it. Reason mandatory.
> - Ratings stay **three separate tracks** — peer, customer, supervisor. Never blended.
> - Auto-clockout moved **18:00 → 19:00** (was clipping real 10-hour days).
> - On duplicate work rows: **"what's real is what the operator inputs"** — do not delete their entries.
>
> ### ⚠️ Open, and the founder knows
> - **Force-complete has NO UI.** API + `lib/office-completion.ts` are built and tested; no button,
>   no read-only banner. It does not exist for him yet.
> - **Continuation ("new scope") jobs** also set `parent_job_id`, so the family rollup shows them the
>   parent's scope and inflates the parent's %.
> - **Portal ETA never appears** — suppressed once the crew first arrives, and nothing resets that
>   on a new day, i.e. exactly the day-2-onward case it was built for.
> - **Customer creation "not authenticated"** — DIAGNOSED not fixed: `getSession()` returns null on an
>   expired token and the code treats stale as logged-out. Same pattern in 4 other files.
> - **Existing duplicate work rows** left in place per the founder's rule. Watch JOB-2026-124747
>   (Dante SLAB SAW 4× 106) before invoicing.
> - **Sentry captures nothing** — no DSN set in Vercel. Founder action.
> - **38 profiles still have no `hourly_rate`** — blocks labor cost everywhere.


**Last updated:** Aug 3, 2026 (Fable 5) | **Branch:** `main` | **Prod:** ✅ LIVE — batches 1–3 pushed; **2 commits UNPUSHED, awaiting the founder's go** (`0e5db5c5`, `40d77aa4`).

> ## 📌 Aug 3 session (Fable 5) — duplicate, helper tickets, takeoff rotation. UNPUSHED.
> Founder's 7 items, worked 1-by-1. Loop: builders → 2 adversarial guardians (**5 BLOCKING findings** caught, fixed, re-reviewed to PASS) → live walkthrough on the running app → gate (tsc 0, build clean, **569 jest**).
>
> **⚠️ NOT DEPLOYED. Production still shows "failed to duplicate".** Push = one ~$1–2 Vercel build.
>
> - **Duplicate was broken since Jul 2 and had NEVER once succeeded** — prod proof: 0 of 11 `job_orders` had `parent_job_id`. `job_orders` carries GENERATED ALWAYS `total_cost`/`gross_profit`; the route copied every column, so Postgres rejected the whole INSERT (428C9). **Fixing that alone would have been worse than the bug:** a 15-entry DENYLIST over a 206-column table meant the first working copy would inherit the live-progress timestamps the board reads for its status pill (a fresh unassigned copy renders "Working"), the customer's completion/waiver/liability SIGNATURES, the previous crew's work log and photos, `billing_status`/`invoice_number`, and the actual costs feeding the generated total. **Inverted to an explicit 67-column allowlist** (`lib/duplicate-job-order.ts`): copy what DEFINES the job, never what RECORDS it being done. A column added by a future migration is not copied until someone opts it in. Verified every allowlisted name exists and is non-generated, and dry-ran the exact INSERT column list against prod.
>   Also: the copy now lands on **the day you're viewing** (it used to take the original's start date, so a copy made to send a second crew today landed on a past day); `created_via` is stamped `'duplicate'` (it was being copied, and `/api/admin/schedule-forms` filters on `created_via='schedule_form'` — a duplicated form job would have reappeared in the schedule-forms inbox); `created_by` is whoever clicked Duplicate; both duplicate routes refuse a soft-deleted source. **Deliberate asymmetry: the copy inherits `estimated_cost` but never `job_quote`** — duplicating cost understates profit (conservative), duplicating quoted revenue would count the same money twice.
> - **Helpers had submitted ZERO work logs, ever** (`helper_work_logs` = 0 rows). Three causes, all real: the green "Submit & Finish" was `disabled={… || !operatorRating}` so it was unclickable until they rated their operator; the log was the 6th card down; and the helper's card showed a passive "Team Member" pill with no call to action. Also **crew members got no dispatch notification or SMS at all** — `lib/dispatch.ts` only ever read `assigned_to`/`helper_assigned_to` (now `lib/dispatch-recipients.ts`, slot-role-wins, no double-notify).
> - **Co-operator lockout + attribution corruption** — `/daily-log` returns EVERY operator's log, and the page matched ANY `day_completed_at`, so the moment the lead closed the day the co-operator lost the item picker AND the submit bar. The empty-draft fallback hydrated from `/work-history` (all crew), so the lead's items were pre-selected and re-inserted under the co-operator's id. Both now filter on the session user.
> - **Crew add (POST `/api/admin/jobs/[id]/crew`) — 3 guardian BLOCKING fixes.** `dispatched_at` is a permanent latch and completed jobs stay on the board, so the new late-add SMS would text a real operator a dispatch for a job that finished weeks ago (gated on status + the job's last day). "Make lead" re-posts the OUTGOING lead here to keep them on the crew, which was texting the demoted operator a fresh dispatch (`reason:'lead_change'` → no SMS, honest wording). And "did this actually change anything?" is now ATOMIC (`ON CONFLICT DO NOTHING` + a role UPDATE guarded by `.neq`) so a retried POST can't send a second billed SMS.
> - **Takeoff sheet rotation** — `takeoff_pages.view_rotation` (migration **APPLIED**), applied at render time only. `rotation` already holds the PDF's INTRINSIC /Rotate which pdf.js has baked into the stored dimensions — overloading it would silently redefine the coordinate space every measurement lives in (prod page 36 has `rotation=270` + 14 live measurements). Stored geometry is never rewritten, so nothing can be corrupted.
> - **New `lib/tenant-timezone.ts`** — Vercel runs UTC, so a helper submitting at 6pm ET was filing work under TOMORROW. Server-side calendar dates now use the tenant's clock.
>
> **Live walkthrough (super@pontifex.com on the running app, prod DB):** duplicate succeeded for the first time and came back unassigned, undispatched, no progress stamps, no signature, no work log, `billing_status='unbilled'`, `labor_cost=0`. Adding a crew member returned `notified:true`; the identical POST again returned `notified:false` and wrote no second notification. The board API returns each extra crew member's NAME + role. All test artifacts removed — prod is back to 0 duplicate rows.
>
> **Still open for the founder:** (a) enter operator wages in Operator Profiles; (b) the change-order form he'll send; (c) verify the printed ticket's 10 numbered questions + WHITE/YELLOW/PINK footer word-for-word against a real pad. **Not yet done:** signed-document visibility (see if/when site contacts signed, saved PDFs outside the job ticket, remind unsigned), and a field-side walkthrough — that needs a **test operator + test helper account**, since logging in as a real employee isn't something I'll do.
> **Backlogged, worth knowing:** takeoff AREA measurements keep a stale quantity after recalibration (SF scales as fpp², so the error is large) — 0 area measurements exist today, but don't lean on area takeoffs for a live bid until it's closed.

> ## 📌 Aug 2 session (Fable 5) — BATCH 2: schedule-board + field-ops + payroll accuracy (4 features, all guardian-clean)
> Loop: 4 builders → 4 guardians (**12 BLOCKING findings** caught + fixed + re-reviewed) → gate (clean build, tsc 0, 308 jest). 4 migrations applied to prod. Commits `27e7563a` `303e43c7` `8931c8d0` `b1405e8c`.
> - **Work-performed visibility (`27e7563a`)** — admin saw only "Core Drilling ×1"; the DETAIL already existed in `work_items.details_json` (hole sizes/depths/steel, cuts LF/depth/wet-dry/areas/blades) but no screen read it, the typed day-note was DROPPED by the API, day-complete STRIPPED details minutes after submission, and work_items had NULL tenant_id (no trigger) so tenant-scoped admin reads hid real work (**prod backfilled**). New `lib/work-items-format` + `components/WorkItemsSummary` = one renderer; Original Scope side-by-side with Work Performed by day; difficulty picker wired. **PHOTOS: the job-photos bucket went private Jul 23 but admin still rendered raw public URLs (every photo 400'd) and the completed ticket NEVER returned photos at all** — both now signed server-side. Photos mandatory unless `site_compliance.photos_prohibited` (new schedule-form toggle + skip ack). Midday reminder (default 11:55 tenant-local, configurable in Notifications → Auto Settings). Active Jobs: per-day Daily Work expander + today's-operator chip; dashboard work_items_count bug (queried nonexistent `job_id`) fixed.
> - **Reassignment + sequencing (`303e43c7`)** — the board had FOUR reassign paths writing THREE places: the row dropdown wrote NOTHING (local state), EditJobPanel + dnd wrote job_orders but the JDA overlay masked it, and the only ledger writer never updated `assigned_to` on multi-day jobs (**day-2 operators were locked out: invisible in my-jobs, 403 on status/logs/photos/submit**). Now ONE path (`lib/reassign.ts`), status never rewinds, both operators notified (+SMS to the incoming op on dispatched jobs — they used to get nothing), outgoing op keeps access via job_crew, morning dispatch syncs the day's ledger lead. **TWO JOBS PER DAY** (founder call): old unique index dropped, `day_sequence` added, assign confirm offers "add as next job"/"make #1", operator-side gate blocks job #2 until job #1 is done (on_hold/cancelled/out-of-window never block). Completion PDF now credits who actually worked each day. Fixed in passing: `/reorder` had NO tenant filter (cross-tenant write hole).
> - **Labor accuracy (`8931c8d0`)** — the "57-hour job" reconstructed: an unbounded wall-clock fallback with a `work_started_at` surviving from TWO DAYS earlier stored **52.59h in one log** (repaired in prod → 7.87h). `lib/labor-cost` bounds every card to the job window (shop cards → 0, capped at paid hours + 16h). The "$596" was `hours × a hardcoded $75`; three screens used three invented rates while `hourly_rate` was NULL on all 32 profiles. Now: `tenants.labor_burden_pct` (default 25) in Settings → Job Cost Standards, per-line breakdown API, **clickable labor cost → LaborCostBreakdown modal** showing the math, and "rates not set" instead of fake numbers. **GUARDIAN CATCH: the wages-set invoice path would have billed customers at internal burdened COST (~60% invoice drop the day wages are entered)** — T&M now always bills at the billing rate; cost ≠ price documented in-code.
> - **Multi-person tickets (`b1405e8c`)** — `job_crew` role 'operator' (migration), "+" on board cards, roles + Make-lead in the crew panel, co-operators do the FULL work input (own rows; a resubmit no longer wipes crewmates'), helpers keep the light form, admin "Crew & Clock-Ins" card with per-member per-day clock-in/out + in-route stamps. **GUARDIAN CATCH: a co-op could reach lead-only day-complete** (their day-note created a log row that unlocked an authz fallback; day-complete can set `completed`) — now 403'd server-side (`lib/day-complete-auth.ts`) + client gate.
>
> **⚠️ FOUNDER ACTION:** enter each operator's wage in Operator Profiles — labor cost honestly reads "rates not set" until then.

> ## 📌 Aug 1–2 session (Fable 5) — founder batch #1: PDF branding · smart clock-out · operator inbox — BUILT, guardian-clean, UNPUSHED
> Loop ran fully: 3 builders → 3 guardians (2 real BLOCKING sets caught + fixed + re-reviewed) → design-consistency review → rls-policy-auditor → live browser verify vs prod data → gate (clean build + tsc + 215 jest). Detail per feature in BACKLOG "Aug 1–2" block. Key facts a next session needs:
> - **Timecard PDFs (`9c709ab7`)**: root cause was 4 routes fetching `tenant_branding` UNSCOPED (arbitrary tenant's brand — why founder saw "Pontifex Industries"). ALL PDF branding now goes through `lib/pdf-branding.ts` (tenant-scoped, logo-safe). TimecardPDF exports reusable `TimecardPage`; batch export composes it. Web PDF download buttons were dead (bare window.open → 401) — now fetch+blob. Verified live: real Patriot logo/red/navy + correct OT math.
> - **Smart clock-out (`8770a37b`)**: new completion-aware trigger in `/api/cron/clock-out-reminders` (pure logic in `lib/clock-out-reminder.ts`, 32 tests): all-jobs-done → delay clamp(max(30, drive+10),30,120) → push/bell/SMS + admin escalation +60min. Slot-aware status lists (helper excludes `on_hold` — guardian catch). Near-shop trigger stays Phase C (founder-gated). Founder flag: post-job SHOP work still gets the nudge+escalation once per shift.
> - **Notifications (`2bce062b`)**: `/api/notifications` merges BOTH tables (schedule_notifications was rendered by NOTHING — 118 invisible rows incl. every auto-clockout notice ever). Inbox = full-message expandable cards + `?focus=` from bell. RLS migration `20260801_notifications_rls_hardening` APPLIED to prod (dropped public forge-INSERT hole). One-time sweep marked 14d+ backlog read — **RE-RUN the same idempotent sweep right before/after the deploy push** (`UPDATE schedule_notifications SET read=true, read_at=now() WHERE read=false AND created_at < now() - interval '14 days'`). "Message Management" = feedback type `message`, full text in the notification.
> - **New backlog**: P2 = 6 more `WITH CHECK(true)` INSERT policies (audit tables, login_attempts, job_orders_history, equipment_checkout_sessions — check client write paths first); P3 nits batch. BACKLOG's stale APNs item closed (push is fully wired; only env-var presence in Vercel unverified).

> ### 🧭 NEW SESSION START HERE
> 1. **[docs/reference/OPERATING_MANUAL.md](docs/reference/OPERATING_MANUAL.md)** — the one-page orientation:
>    what Pontifex is, the **tools** at your disposal (skills, MCP, the build loop), and your **team**
>    (the agent types). Read it first if you're new to this project.
> 2. **This file** (below) — what's in flight + how we work.
> 3. **[BACKLOG.md](BACKLOG.md)** — the prioritized to-do list; work top-down.
>
> The founder (Andres, non-technical, typo-heavy, live-tests prod on 3 real Patriot operators) directs;
> you architect, build, verify, ship. Truth > reassurance. **The loop:** build → guardian-review →
> LIVE-verify (login `super@pontifex.com` / `super0202!` / code `PATRIOT`) → gate
> (`rm -rf .next && npm run build` + `tsc --noEmit` + `jest`; 163 pass, 2 email-ESM `TextEncoder`
> failures are pre-existing noise) → confirm spend → `git push origin main` (~$1–2, ONCE per batch) →
> watch deploy READY. Every `supabaseAdmin` query needs `.eq('tenant_id', …)` (it bypasses RLS).

> ## 📌 Jul 30–31 session (Opus 4.8) — field-ops + timecard sprint + native GPS foundation, all shipped
> Every feature guardian-reviewed; several real BLOCKING bugs caught + fixed before push. All LIVE.
> - **Multi-operator crew (`8f7e29dc`)** — `job_crew` table; LEAD (assigned_to) does full completion, additional operators are crew (light helper ticket + clock-in), crew notes on the completed ticket; duplicated jobs stay independent. **Guardian caught a pre-existing BLOCKER: the helper work-log was mounted inside the operator-only fragment → unreachable since ~Jul 14** (apprentice helpers couldn't log field work AND the Batch-3 helper→operator reviews never rendered) — fixed by moving it into the helper view.
> - **Printable completed ticket (`4e4911fe`)** — `app/dashboard/admin/jobs/[id]/completed-print/page.tsx` mirrors Patriot's paper ticket (logo + red job# top-right, times, work performed, footage, subsistence, signature, crew notes) for the paper billing hand-off.
> - **Schedule-board Edit actually saves (`35b52036`)** — inline job Edit silently 500'd (single-day jobs sent `end_date:''` → PG rejects) + never refreshed the board. Now saves + refreshes + surfaces errors + syncs scheduled_end_date.
> - **Timecard Phase A (`3ce910e0`)** — notifications scroll fix · configurable auto-clockout (time picker default 6pm; cron reworked hourly, tenant-local, night shifts keep noon) · out-of-town subsistence prompt at clock-out (idempotent; annual report reads `subsistence_nights` as source of truth). Guardian fixed a midnight-crossing subsistence double-count.
> - **Timecard Phase B (`dafb852c`)** — double-time tag (hours × 2, OT-exempt via single-classification in calculateWeekSummary + team-summary; override populates double_time_hours; bulk apply-double-time endpoint) · 60-day tenure gate on holiday pay (grandfather null hire_date) + eligibility view · holidays on the schedule board (badge + "Mark Paid Holiday"). **Guardian caught a BLOCKING double-subtract (negative payroll hours)** — fixed.
> - **Phase C native GPS — FOUNDATION SHIPPED + LIVE (`f5541609`→`4a6d0a56`), gated for a native build.**
>   Background geofencing for auto-arrival + app-closed clock-out reminder. What's live in code (web build
>   verified safe — all native code is `isNativeApp`-gated + `registerPlugin`, so nothing native bundles
>   into the web/SSR build): jobsite lat/lng persistence (Google Places coords on create + Nominatim
>   backfill cron) · `@capacitor-community/background-geolocation` watcher (`lib/native/geofence-service.ts`,
>   0.5-mi auto-arrival + back-at-shop reminder) · consent-before-OS-prompt modal + per-user consent gate ·
>   privacy-policy v1.3 + gps-consent v2.0 rewritten to disclose on-the-clock background location ·
>   `stopGeofencing()` wired into BOTH clock-out paths (compliance: "stops when you clock out" is literally
>   true) · iOS `Info.plist` + `PrivacyInfo.xcprivacy` + Android manifest permissions. Guardian + a
>   compliance-pro review both ran; every compliance-critical code item is done.
>   **⚠️ Phase C is NOT in users' hands yet — it needs FOUNDER + native work (see the checklist below).**
>   Full plan + status + the founder checklist: `docs/plans/PHASE_C_NATIVE_GPS.md`.
> - **Docs cleanup (this session):** added `docs/reference/OPERATING_MANUAL.md` (exec summary + tools +
>   team); refreshed this handoff top; pruned dead one-off files from `docs/archive/`.
>
> ### 🚧 Phase C — remaining before it reaches operators (FOUNDER-gated; do NOT ship autonomously)
> 1. **Native builds** — bump version → `npx cap sync ios/android` → archive/build → TestFlight/internal.
>    The plugin + permissions only take effect in a fresh binary. Use `ios-release` / `android-release`.
> 2. **On-device testing/tuning** — the "Always" permission flow, `distanceFilter`, the 0.5-mi radius,
>    hysteresis, battery. The geofence logic is v1 and can't be validated without a device.
> 3. **Google Play (highest rejection risk)** — background-location Declaration Form + ≤30s demo video +
>    core-functionality justification. **Apple** — App Privacy label (Precise Location → App Functionality)
>    + "Always" justification in review notes. **Signed employee consent** in onboarding. **SC counsel**
>    sign-off on employee location monitoring. (All founder tasks — detailed in the Phase C plan.)

---

## 📦 Current platform status (Jul 31, 2026)

| Surface | Status |
|---|---|
| **Web** | ✅ LIVE — `pontifexindustries.com` (`main` auto-deploys via Vercel). This IS the product; the apps are thin webviews around it. |
| **iOS** | ✅ LIVE on the App Store. New build only for NATIVE changes (Phase C GPS is the next one). |
| **Android** | ✅ LIVE in Google Play (see memory `android-play-release`). Ship future Android via `scripts/play-upload.mjs` (one command). |

**Live now:** 3 real Patriot operators clock in daily. Twilio toll-free SMS (+18336954288) approved + live.
Contracts + e-signature, customer portal, hiring/job-board module, takeoffs, Artifex AI assistant, the full
timecard/payroll + field-ops workflow — all shipped.

**Older session history** (Jun–Jul 2026, per-commit) lives in **[docs/SESSION_LOG.md](docs/SESSION_LOG.md)**
and `git log`. Only the current sprint stays in this file; prune older blocks into the log at session end.

**Founder-side open items** (only the founder can do): the Phase C store/legal checklist above · real
paper-ticket scan tests · Meta business verification (unblocks job-ad Phase 4) · exercising the $5/mo
subscription test. Feature backlog → **[BACKLOG.md](BACKLOG.md)**.

---

## 🧭 HOW WE WORK (the operating model)

1. **Claude is the executive engineer**, not an order-taker. Analyze → architect → decide → implement → verify. Don't ask permission for routine edits/refactors/migrations (autonomous mode). DO confirm before irreversible/outward-facing actions and before spending money.
2. **💰 Push discipline is the #1 cost rule.** Every `git push origin main` triggers a billed Vercel build (~$1–2); builds were ~86% of the bill. **Commits are free — batch them and push ONCE per session, only after verification, and confirm with the founder unless told "push it."** See [DEPLOYMENT_COST.md](DEPLOYMENT_COST.md). `claude/*` branches don't auto-deploy.
3. **Verification gate before every push:** `npm run build` green + `tsc` 0 errors + relevant tests + eyeball the change (preview tools where it's web-observable). Run the `prod-deploy` skill for the full gate.
4. **Batch by layer** when doing parallel work (all backend, then all UI, then migrations), use worktree-isolated subagents for independent features, and **merge worktree branches back to `main` before the session ends** (localhost runs from the main repo, not worktrees). Clean up `.claude/worktrees/` after (it has filled the disk before).
5. **End every session:** update this handoff + BACKLOG status, then push if authorized.
6. **DB changes:** additive + idempotent migrations applied via Supabase MCP; tenant_id + tenant-scoped RLS via the SECURITY DEFINER helpers — **never** `auth.jwt() -> user_metadata`. Risky migrations go through a Supabase branch first.

## 🧠 HOW TO THINK (decisions)

**Before any significant technical/product decision, invoke the `dev-decisions` skill.** Its core procedure: gather facts → enumerate ALL real options with timelines + cost + reversibility → pick the **cheapest reversible step that actually works** → verify end-to-end. Hard rule: never answer a "fastest/best way" question with a single route — give the honest options table (we used this today choosing drag-drop vs. the Play API). Bias toward facts over guesses; verify file/flag/table names against current code before asserting.

## 👥 THE TEAM (skills + subagents — don't re-derive, invoke)

**Project skills** (in `.claude/skills/` — our playbooks, encoded):
- `dev-decisions` — first-principles decision framework (read before deciding).
- `prod-deploy` — the verification gate + cost confirm + push + deploy-watch.
- `guardian-review` — architecture-guardian PASS/BLOCKING checklist. **Run after every builder/subagent**, before committing significant changes.
- `ios-release` — full App Store/TestFlight ship procedure (manual signing, Transporter, screenshot gotchas).
- `android-release` — full Google Play ship procedure (version bump, `cap sync`, signed AAB, `scripts/play-upload.mjs` API upload, declarations checklist) + how to read Play review status. Org account = no closed testing required.
- `design-taste` / `frontend-design` / `pontifex-brand` — anti-generic UI + brand application (bridge-P mark, purple→red gradient).

**Specialist subagents** (spawn via the Agent tool for the right job):
- `Explore` — broad read-only codebase search (fan-out, returns conclusions not file dumps).
- `Plan` — implementation planning / architecture trade-offs.
- `rls-policy-auditor` — **run before merging any RLS migration** (catches `user_metadata` + missing `tenant_id`).
- `supabase-migration-author` — writes correct idempotent migrations (RLS helpers, tenant_id, triggers).
- `mobile-responsive-auditor` — sweeps operator pages at 375/414px (tap targets ≥44px, overflow, contrast).
- `production-validator` — confirms a feature is wired end-to-end before shipping.
- `backend-dev` / `general-purpose` — API routes / multi-step research & build.

Operators are on phones in the field (sometimes gloved) → mobile-first is non-negotiable. Every new feature must work for **any** tenant (white-label; no hardcoded Patriot branding). Full model: [docs/DEVELOPMENT_PLAYBOOK.md](docs/DEVELOPMENT_PLAYBOOK.md).

## ▶️ HOW TO PROCEED

1. Read [BACKLOG.md](BACKLOG.md) — single source of truth (P0→P3). Work top-down unless the founder reprioritizes.
2. Pick the top unchecked item; if it's a feature, plan → build → `guardian-review` → verify → check it off.
3. Batch commits; **confirm before pushing** (or push when told "push it").
4. Update this handoff + BACKLOG STATUS at session end.

**Likely next priorities** (confirm with founder): monitor both store reviews; expand Play to more countries if desired; exercise remaining email routes live; Jarvis Phase 2 (Claude brain) pending AI-Gateway greenlight; P1/P2 polish in BACKLOG.

## 📁 WHERE THINGS LIVE (doc map)
- **[CLAUDE.md](CLAUDE.md)** — hard conventions (RLS helpers, date handling, auth/bearer pattern, email via `lib/email.ts`, Google Maps loader, push, roles). Read for any code work.
- **[BACKLOG.md](BACKLOG.md)** — all bugs/features/priorities + the STATUS dashboard.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — system design + Mermaid diagrams.
- **[DEPLOYMENT_COST.md](DEPLOYMENT_COST.md)** — why pushes cost money + the rules.
- **[APP_CHANGES.md](APP_CHANGES.md)** — native iOS/Android-only change log.
- **docs/** — `plans/` (future work) · `playbooks/` (how-tos) · `reference/` (deep context: CLAUDE_CONTEXT, FEATURE_CATALOG, **UI_CATALOG** = reusable Tailwind patterns, SCALING) · `archive/` (history, don't update) · `SESSION_LOG.md` (sprint history) · `DEVELOPMENT_PLAYBOOK.md` · `TOOLING_EVALUATION.md` (check before installing anything).
- **Auto-memory** (`~/.claude/.../memory/`) — loads into every session; `MEMORY.md` is the index. Key files: `android-play-release.md`, `supabase-pro-active.md`, `superadmin-demo-and-role-labels.md`, `resend-verified-domain.md`.

## 🔑 Key facts a new session needs
- **Stack:** Next.js 15 (App Router) + React 19 + TS + Supabase (Postgres, RLS) + Tailwind; Capacitor remote-webview for iOS/Android.
- **Supabase project:** `klatddoyncxidgqtcjnu` (Pro plan → automated backups + PITR).
- **Multi-tenant SaaS:** company-code + email + password login; everything scoped by `tenant_id`. Pontifex (code `PONTIFEX`) is the parent org → super_admin lands on the Platform Hub; Patriot (code `PATRIOT`) is tenant #1.
- **Demo logins:** `admin@pontifex.com` / `superadmin@pontifex.com` (both `PontifexDemo2026!`); super_admin `super@pontifex.com` / `super0202!`. Play reviewer login = `admin@pontifex.com` / `PontifexDemo2026!` / company code `PATRIOT`.
- **Roles (priority):** super_admin > operations_manager > admin > salesman > shop_manager > inventory_manager > operator > apprentice.
- **Three envs:** Production (`main` → prod Supabase), Vercel preview (any branch), local (`localhost:3000`, touches prod DB via `.env.local`).

---

<details><summary>📜 Older session detail (pre–Jun 20) — full sprint history in docs/SESSION_LOG.md</summary>

Highlights (also in auto-memory + git history): BofA-style web Touch ID (built then **removed** Jun 14 — the browser password manager already handles it; iOS native Face ID kept), the "Save password" full-navigation fix, the request-access account-creation fix (listUsers-pagination bug), tenant-branded emails, the time-off system rebuild, GPS-only clock-in, Jarvis Command Center Phase 1, and the Jun 9 docs reorg. Per-commit detail is in `git log`.

</details>
