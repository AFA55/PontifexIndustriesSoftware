# BACKLOG — single source of truth

> Every bug, feature, and chore lives HERE — not in CLAUDE.md, not in the handoff, not in chat.
> Priorities: **P0** = broken in prod / blocking · **P1** = this week · **P2** = soon · **P3** = someday.
> When work completes: check it off, move to "Recently shipped" (keep ~2 sessions), then delete.

## 🆕 AUG 14 — founder batch (demo day)

### ✅ Shipped this session
- [x] **A day number was a tap count, not a calendar position.** Dante was at AM King Wed 8/12 and Thu 8/13; the ticket showed one day, labelled Day 1, dated Thursday. `set_daily_log_day_number()` computed `MAX(day_number)+1`, so it counted how many times somebody had pressed "day complete" on that job — Dante didn't press it Wednesday night, so Wednesday produced no row and Thursday's press became Day 1. Same root cause as Aiden's missing Aug 4 on Parkk (9.89 h on the clock, no ticket). Now the ordinal of the date among days the job can PROVE a crew was on it: a filed log, **or** the office placed a named crew **and** that person clocked in. The clock is what separates a fact from a guess — Aiden is on the board for Sat 8/8 and Sun 8/9 with no timecard for either; counting the placement alone would have moved his Monday from Day 4 to Day 7 and printed two weekend days he never worked onto a customer's ticket.
- [x] **Wednesday's ten hours were thrown away by the attribution rule.** The card had no job link, and that morning Dante had also closed out the *previous* job from the truck — five minutes of Southern Basements paperwork outvoted a ten-hour day at AM King. The office's own placement for a date now outranks whatever paperwork got filed that morning. The date universe was wrong too: both callers passed only dates that HAVE logs, so a day worked and never filed could not be found however the rule read.
- [x] **Three places wrote `total_days_worked` behind the trigger's back**, including a blind `+1` on a stale read (how AM King reached 2 off one log row). The status route recomputed it from filed logs only, which would have quietly erased Wednesday again on the next status change.
- [x] **A duplicate now lands on one day.** Duplicating carried the original's `end_date`; the Parkk job at 520 Logistics Dr runs Aug 3 → Sep 3, and an unstaffed multi-day job shows in Unassigned on every day it spans — three copies became three Parkk rows every day until September.
- [x] **"Mark complete (office)" exists at last.** The API and its unit-tested rules have been there since early August with **nothing in the app calling them** — a finished feature with no button.
- [x] **Missing-ticket chase** — new cron, ~7:15 tenant-local. The first live sweep found **seven** unsubmitted tickets in one week across Keontre, Zack, Micah and Dante.
- [x] **7:05 clock-in** (settings: anchor 07:30 → 07:00) and **6:30pm clock-out for David** (new per-person `profiles.clock_out_reminder_time`, not hardcoded to a name or role).
- [x] **Reminder texts were never billed.** `meterSms` returns early without a `tenantId` and `sendNotification` passed only `{to, message}` — so every reminder SMS this platform has sent was invisible to messaging-margin billing.

### 🔴 P0 — next, before anything else
- [ ] **Work items are written TWICE on a multi-day job, doubling billed quantities.** Two write paths disagree on the day number. Billing integrity; found by the operator QA pass, still open.

### 🟠 P1 — from today's batch, not yet built
- [ ] **A daily log is stamped with the day it was SUBMITTED, not the day worked.** Dante's Southern Basements closeout carries `log_date` 8/12 with `route_started_at`/`work_started_at` from 8/10 and `hours_worked` 0.09 — a five-minute paperwork tap filed as a work day on the wrong date. The late-completion backfill (`work_date`) exists but only engages when the job has no prior logs. The honest fix is to date a log from its own `work_started_at` when one is present.
- [ ] **Helper reviews: aggregate only, and suppress the average below n = 3** *(founder approved Aug 14)*. Detailed reviews stay supervisor-only. Nobody gets scored off a single bad day.
- [ ] **Outbound message log** (existing P1, now sharper): `meterSms` still discards `jobId` and stores no recipient or body, so "what exactly did we text that customer?" remains unanswerable even with today's metering fix.
- [ ] **Crew Grid reports busy operators as free** — multi-day jobs bucketed only on their start date (`crew-grid/route.ts:64,66-67,95`); also not dark-mode aware (293 elements).
- [ ] **David sees ZERO rows in twelve tables** — `supervisor` is missing from every office-read RLS policy.
- [ ] **Schedule-board reorder and notify are `requireSuperAdmin`** — they refuse Amanda and any operations manager.
- [ ] **One job shows three different hour totals across three screens.**
- [ ] Two email test suites fail to RUN under jsdom (`TextEncoder is not defined`) — pre-existing, hides real coverage.

## 🗺️ AUG 5 PLAN — ticket system to "solid enough to run 8 jobs/day"

Sequenced by **risk removed per hour**, not by request order. Money and records
outrank polish; anything an operator hits on a live jobsite outranks the office.

### 🚧 BLOCKED ON FOUNDER (2 minutes each, but they gate real features)
| # | What | Why it blocks |
|---|---|---|
| ~~B1~~ | ~~**Set the shop location**~~ ✅ DONE Aug 5 — founder gave 269 S Old Piedmont Hwy; the field-verified clock-in pin is now stored on the tenant. | EVERY ETA calculation measures from the shop. Without it the whole "estimated arrival" feature has no origin point. Clock-in currently leans on a default fallback, which is why nobody noticed. |
| B2 | **Enter operator wages** (`profiles.hourly_rate` — 0 of 35 set) | Labor cost honestly reads "rates not set" everywhere until then. |
| B3 | Change-order paperwork / the ticket's 10 numbered questions vs a real pad | Needed to finish the printed ticket. |

### P0 — the ticket must be trustworthy
- [x] ~~**Job Scope & Progress reads 0%**~~ FIXED Aug 5 (`da770dcc`) — two stacked faults: nothing ever wrote `job_progress_entries`, AND the office/operator vocabularies never matched. Progress now DERIVED from `work_items` via `lib/job-progress.ts`. Founder's job: 0% → 132/3280 wall saw + 7/80 cores.
- [x] ~~**Timecard PDF is missing the times.**~~ FIXED Aug 5 (`685a7d13`) — the times were there but rendered in the SERVER's zone. On Vercel (UTC) a 7:07 AM clock-in printed as 11:07 AM. Fixed in the operator PDF, admin PDF and the payroll CSV.
- [x] ~~**Liability waiver flow**~~ BUILT Aug 5 (`b3549ff2`) — auto-sends on first In Route, reminder cron, operator banner with resend. **Also fixed: every customer signing link was dead** (missing FK → PGRST200 → "Invalid or expired link" for every token ever issued). ⚠️ FOUNDER: the waiver body is still placeholder text — send me the legal wording.

- [ ] **P0 — "arrived on site" is wrong on EVERY job, and it reaches customers.** *(found Aug 10 auditing a customer complaint)* `arrived_at_jobsite_at` is stamped **1–3 seconds after** `in_route_at` on all 15 jobs checked, back to July — the arrival time is really "left the shop". Southern Basements: In Route 07:43:54, "arrived" 07:43:56. The en-route SMS is correctly timed and honestly worded, but it hands the contact a portal link while the system already shows the crew arrived and working, which is the likely reason Jay Harn texted asking if we were on site. Same field as operator batch 2c, now more urgent because the bad value is customer-facing, and it poisons any "time on site" figure. Verify what the portal renders, then fix the stamp (or derive arrival from GPS as 2c proposes).
- [ ] **P1 — we cannot say what we told a customer.** `sendSMSAny` is handed `jobId` and discards it; `meterSms()` stores only tenant/channel/provider/segments/cost/source — no job, no recipient, no body. So there is no record of what any customer was sent. Needs an outbound-message log before M7a can surface anything.

### P1 — the crew's day
- [ ] **Work-performed redesign** — pick the work type first, then enter every measurement + notes below in one pass, instead of one modal at a time. Founder's biggest UX ask.
- [ ] **P1 — the schedule board is keyed on NAME, and one name is now ambiguous.** *(Aug 9)* Two profiles are called **exactly** `Andres Altamirano`: the live `operations_manager` (`c7e4a590…`, active) and a deactivated old `operator` account (`e7a57d4e…`, inactive) that is still `assigned_to` on **JOB-2026-880425**. The board renders that row's name from the job but resolves every mutation back through `operatorIdMap[name]`, which now points at the active account — so dispatching on that row silently lands on a *different account of the same person*. Not a stranger, but not the account the job is on either. **Fix the data** (deactivate/rename the ghost row, or move the job to the live account); the real fix is keying the board on profile id instead of name.
  Softer duplicates from the same pass, clutter rather than misroute because the strings differ: **"David" / "David schadt"** (both active supervisors) and **"Andres Altamirano" / "Andres Altamirano P"** (both active ops managers). (Ties to batch 4a.)
- [ ] **Pre-existing, unrelated to Aug 9 but found during its review:** several job routes have NO crew-slot check and are reachable by any authenticated tenant member — `jobs/[id]/completion-request`, `job-orders/[id]/request-signature`, `work-history`, `customer-survey`, `generate-completion-pdf`. Worse, `job-orders/[id]/notes` POST has no slot check **and no tenant filter** (cross-tenant write). `lib/.../waiver.ts` already has the reusable `canAccessJob` shape to copy.
- [ ] **FOUNDER DECISION — two conflicting phone numbers on your accounts.** Task #60 made `phone_number` canonical everywhere (17 people have it; the old `phone` column is empty for all but two rows). Both exceptions are Andres's own profiles, and the two columns *disagree*: `andres@patriotconcretecutting.com` has `phone` = 470-658-6313 vs `phone_number` = (864) 940-7161, and "Andres Altamirano P" has `phone` = 470-658-6313 vs `phone_number` = +4706586313. Nothing was copied between columns — which number is current is a call only he can make. Once he says, set `phone_number` and drop the `phone` value. (Also ties to batch 4a: that second "Andres Altamirano P" row is the duplicate account.)
- [ ] **Peer ratings: collapse duplicate FORMS, not all forms.** `/api/ratings/pending` now emits at most one prompt per (ratee, job) and keys "already rated" on `(ratee_id, job_order_id)` — correct today, because this tenant's only two `rating_forms` rows were byte-identical duplicates (one is now `is_active=false`). But the day a tenant adds a genuine second form (e.g. "Safety Review" alongside "Field Performance Review", both targeting `operator`), answering one will silently suppress the other. Proper fix: keep `form_id` in the key and dedupe on a title/questions fingerprint. (Aug 7, guardian MEDIUM.)
- [x] ~~**ETA instead of In Route after day 1.**~~ BUILT Aug 5 (`d1f4f07f`, `ca030af5`) — `lib/eta.ts` + shop location now stored on the tenant. Live on the customer portal. Still to do: show it on the OPERATOR ticket too.
- [ ] **Quick Add: address autofill + drive time** — still not integrated; feeds the ETA above.
- [ ] **Helper history view** — DSM-style day toggle: who they worked with, what they did, hours. Stored so both the helper and the office can look back.
- [ ] Equipment checklist can lock at 0/3 while reading "Ready", and records gear the operator never confirmed.

### P2 — the customer's view
- [ ] **Portal branding + light/dark toggle** — the customer's landing page doesn't reflect the tenant's colours.
- [ ] **Replace the portal's job timeline** with start date + projected end date.
- [ ] **Customer messages visible** — the office must see what a customer typed.
- [ ] **Change-order request from the portal** — customer describes the extra work + photos → the job's project manager is notified → job ticket updates → PM sends a cost → customer accepts/declines → routed to the site contact or another named person for signature **before the work is done**, so it gets paid.

### P2 — the office
- [ ] **Team Profiles**: surface the date of birth + emergency contact ALREADY BEING CAPTURED (5 and 3 people have them; the screen just never shows them), add wage entry, project-manager job-visibility toggles, and make peer ratings work.
- [ ] ~60 remaining dates that render one day early (catalogued; none invent 1995).
- [ ] Invoicing: recording a payment fails 100%; a fixed-price job invoices at $0.00 and discards the logged footage.

### Practices (would have caught most of this week's bugs before an operator did)
- [ ] **Schema/code drift check in CI** — three bugs this week were code naming a column the database doesn't have (`scope_of_work`, `completed_at`, `salesman_id`, `notes`, `directions`). A generated types file + a CI diff makes that a build failure instead of a customer dead end.
- [ ] **Write-verification smoke test** — after each deploy, write a record and READ IT BACK. Would have caught the signature, standby, helper-log and work-performed failures.
- [ ] **Sentry → Pontifex Hub** — errors as cards (company · screen · users hit · since when), with a "Send to Claude" button that packages the trace for diagnosis. *Founder's idea, Aug 5. Deliberately NOT auto-fixing: this week's bugs were 3-deep and an auto-fixer would have patched symptoms on a system carrying payroll and signed records.*

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
| **Unpushed commits** | ✅ none — batch 1 + batch 2 pushed Aug 2 (8 commits; gate green, 308 jest). |
| **Last groomed** | Aug 2, 2026 |

## 🆕 Aug 1–2 — founder batch (timecard PDF branding · smart clock-out · operator inbox) — ✅ BUILT, guardian-clean, unpushed

- [x] ~~**Timecard PDF says "Pontifex Industries" / generic design**~~ — ✅ FIXED (`9c709ab7`). ROOT CAUSE: 4 PDF routes fetched `tenant_branding` with NO tenant_id filter (arbitrary tenant's row). New `lib/pdf-branding.ts` (tenant-scoped + logo fetch w/ https/2MB/5s guards); TimecardPDF redesigned formal (logo, red WEEKLY TIMECARD, accent table, DT box, subset footnote, signatures); batch export composes shared `TimecardPage` (170-line duplicate deleted); web download buttons were DEAD (window.open w/o bearer → 401) → fetch+blob w/ error alert; annual report print header + dark-mode print fix. Live-verified against prod data (real Patriot logo/red/navy, OT math correct). Guardian PASS.
- [x] ~~**Smart clock-out reminder (operators forget to clock out)**~~ — ✅ BUILT (`8770a37b`). 4th trigger in the 15-min cron: all jobs done → drive-aware delay (max(30, drive+10), cap 120) → push (closed-app) + bell + SMS-per-prefs; admin escalation +60 min; helpers/crew covered (guardian caught + fixed helper `on_hold` silence bug); 32 unit tests. Near-shop geofence trigger = Phase C (already built, founder-gated native build). Founder heads-up: an operator legitimately doing shop work after their last field job still gets the nudge + escalation once — flag if it annoys.
- [x] ~~**Operators can't see full notifications / "view more" → timecard page**~~ — ✅ BUILT (`2bce062b`). Unified feed (notifications + schedule_notifications — 118 previously-INVISIBLE rows incl. all auto-clockout/late-arrival notices now render), inbox redesign (full-message expandable cards, focus deep-link from bell, pagination, brand tokens), banner dismiss no-op fixed, sidebar shop-role trap fixed, "Message Management" channel (full text, push/email prefs). RLS: dropped forged-insert hole on schedule_notifications (migration `20260801` APPLIED, auditor PASS); one-time prod sweep marked 14d+ backlog read (re-run at deploy).
- [ ] **P2 — RLS sweep: 6 more `WITH CHECK (true)` INSERT policies open to public/authenticated** (found during the notifications RLS audit): `audit_log`, `audit_logs` (forgeable audit trails), `login_attempts`, `error_logs` (×2 duplicate), `job_orders_history` (any user can fabricate history), `equipment_checkout_sessions`. Same drop-and-let-supabaseAdmin-write fix as `20260801`, but EACH needs a client-write-path check first (access_requests/consent_records/customer_surveys are intentionally public — leave). rls-policy-auditor behind it.
- [ ] **P3 — batch nits from the Aug 1–2 guardians/design review**: compound `(created_at,id)` cursor for the feed (zero ties in prod today); mark-read/DELETE 100-id cap vs success message; bell rows `role="button"`+keyboard; jest `TextEncoder` polyfill (2 email suites have failed silently for weeks); batch-export "Unknown" page for missing profile → skip/flag on payroll doc; holiday/subsistence boxes on TimecardPDF breakdown; migrate liability-release / work-order-agreement / generate-completion-pdf branding fetches to `lib/pdf-branding` (they re-declare PDFBranding); night-shift post-midnight "Done for Today" invisible to reminder (same log_date quirk as clock-out gate — fold into shop-tickets work); backfill `tenant_id` on both notification tables then drop the `tenant_id IS NULL` escape in tenant_isolation policies.
- [x] ~~BACKLOG stale item: "APNs: wire lib/send-push.ts into /api/push/route.ts"~~ — audit confirmed ALREADY DONE (route imports + calls sendPushToUser; APNs/FCM wired end-to-end). Removed from P3 list below.

## 🆕 Aug 2 — BATCH 3 (founder-directed; answers locked, build next session)

**Founder answers locked Aug 2:** blades → NOT important, make optional; what matters is LF/L×W numbers **plus a "Quick Notes" field after the numbers** so operators describe the whole job (set poly, bad access, waited on the contractor, prep steps) — "not just 'this is all I cut'". Quick-add equipment → keep it EASY: free-type **or** pick from the common ones (wall saw, chainsaw, hand saw…) with abbreviations; Claude picks the implementation but must not break dispatch/digital-ticket workflows. Operators **SHOULD** see their supervisor grade (so they know where they fell short and can improve). Salespeople **CAN** read reviews + want a "Previous Reviews" section per employee. **NEW smart ask:** grades must roll into the operator's overall review/rating **automatically**.
**⏰ REMIND THE FOUNDER: he is bringing his real change-order paperwork "tomorrow" (Aug 3) to model the template off — do NOT guess the template fields before that.**

- [ ] **Simplified work entry + Quick Notes.** The L×W input ALREADY EXISTS but is gated to Hand Saw only (`work-performed/page.tsx:2744`) — un-gate for all saw types. Logging "120 LF @ 6in" takes ~9 taps across 3 nested modals; blades are a non-obvious MANDATORY gate (`addCut` :804,:835 — make soft). Collapse the double commit (`handleAddItem` :1247 should flush a valid in-progress cut/hole). Add per-item **Quick Notes** (prep/access/delays) → `details_json` + rendered by `WorkItemsSummary`. Quick paths must emit the SAME `details_json` shape (`{cuts:[{inputMode:'linear'|'area',…}]}`) so nothing downstream changes.
- [ ] **Clock-out ticket reminder.** The "Clock out anyway" flow ALREADY EXISTS on `app/dashboard/page.tsx:657-733` but `app/dashboard/timecard/page.tsx:265-275` turns the same soft 409 into a dead-end `alert()`. AND the gate is largely ineffective: it counts ANY `daily_job_logs` row as "ticket done", and draft-autosave/day-note create one — so an operator who merely OPENS work-performed is never warned. Fix: filter on `day_completed_at IS NOT NULL` (clock-out route :131-137) + lift the modal into a shared component.
- [ ] **Quoted price vs project cost.** ROOT CAUSE = split-brain: intake writes `estimated_cost` (schedule form :3476, quick-add :70, RelatedJobs, JobDetailView, EditJobPanel) but every "Quote" reader uses `job_quote` (job-pnl ×2, analytics, office-documents) — which only the Office Documents pencil writes → **quoted revenue reads $0 across P&L + analytics**. Make `estimated_cost` canonical, repoint the readers, then ~16 label fixes (Project cost → Quoted price, + Approved change orders → Add-ons, Total project cost → Contract total). Add-ons math already exists (`office-documents/route.ts:87-99`).
- [ ] **Change orders in-app + digital signature — ~80% ALREADY BUILT, unwired.** `change_orders` table + auto CO-numbering + full CRUD API + RLS all live (0 rows). **`components/jobs/ChangeOrdersSection.tsx` (637 lines, complete form + approve/reject) has ZERO imports** — mount it on the job page (~:1878). The `contracts` e-signature stack is production-proven (doc_type already includes 'change_order'; token → branded email → canvas sign → PDF → private bucket → signed-copy email, CAS double-sign guard) — reuse verbatim: add `change_orders.contract_id`, a "Send for signature" button, and a status-sync hook on sign. **`app/dashboard/admin/contracts/page.tsx` has NO nav entry** (URL-only) — add to the sidebar. FIX: `app/api/public/portal/[token]/job/[jobId]/route.ts:113-121` selects nonexistent `amount`/`requested_at` → portal change orders silently ALWAYS empty (+ no tenant filter); `my-jobs/[id]/page.tsx:164-189` reads `version`/`scope_description` that aren't in the payload. Templates = the only from-scratch piece (nothing exists; `form_templates` 0 rows) — **blocked on the founder's real paperwork**.
- [ ] **Site visit reports visible + auto-rollup into grades.** System is fully built (`supervisor_visits`: performance/safety/cleanliness 1-5 + observations + issues + photos + equipment issues → auto maintenance requests) but **1 row in prod, unrated, unattached to a job** = pure visibility problem. NOT surfaced on the job page at all; API has no `job_order_id` filter (column + index exist — one line). Add a "Site Visit Reports" card on the job page (between Crew & Clock-Ins ~:2236 and Change Requests ~:2335) + Active Jobs badge + **operator-visible view of their own grade** (RLS already permits) + **"Previous Reviews" for sales** + fold `supervisor_visits` into `app/api/admin/operator-report/[id]/route.ts:35` (the operator report card reads customer surveys + helper reviews but NOT supervisor grades). Grading lives in FOUR systems (supervisor_visits, customer_surveys, job_helper_reviews, rating_forms) with `cleanliness_rating` duplicated — the auto-rollup must define ONE composite. Tighten the visit wizard so a visit attaches to a job.
- [ ] **Quick Add parity.** Plain-text address → **3 of 5 QA- jobs have NULL coords** (Nominatim backfill failed on hand-typed addresses; full-form jobs are 100% geocoded) — swap in `GoogleAddressAutocomplete` (self-degrades if Maps is down) + send lat/lng through `quick-add/route.ts:54-76`. NO equipment at all → quick-add jobs contribute ZERO lines to the shop's Daily Equipment Needs, dispatch PDF, and operator checklist; founder wants free-type OR pick-from-common. Quick Add's `JOB_TYPES` vocabulary is DISJOINT from the full form's `SERVICE_TYPES` codes → shop board renders raw `core_drilling` instead of "Electric Core Drilling". Also drop `'equipment_needed'` from the hardcoded `missing_info_items` when equipment is supplied.

## 🆕 Aug 2 — batch-2 guardian NITs (all non-blocking, logged not fixed)
- [ ] **P2 — clock-out gate one-liner**: `.not('day_completed_at','is',null)` on the `daily_job_logs` check (`app/api/timecard/clock-out/route.ts:131-136`) — folded into the Batch-3 clock-out item above.
- [ ] **P2 — RLS sweep: 6 more `WITH CHECK (true)` INSERT policies** open to public/authenticated: `audit_log`, `audit_logs`, `login_attempts`, `error_logs` (dup pair), `job_orders_history` (any user can fabricate job history), `equipment_checkout_sessions`. Same fix as `20260801` but each needs a client-write-path check first (access_requests/consent_records/customer_surveys are intentionally public — leave).
- [ ] **P3 — batch-2 leftovers**: compound `(created_at,id)` notification cursor · mark-read 100-id cap message · bell rows `role="button"` · jest `TextEncoder` polyfill (2 email suites have failed to LOAD for weeks) · `timecards_with_users` view lacks `work_location`/`is_shop_time` (P&L vs daily-log can disagree on shop cards) · partial-wages profit overstatement · DB CHECK on `labor_burden_pct` · double-nudge (4h lunch + 11:55 midday, 25 min apart) · edit-panel helper-seat clear + future-day 'day'-scope lead promotion (F1/F2) · photos GET admin tenant check · crew POST role-pool validation · schedule-form edit-mode omits `site_compliance` (photos_prohibited is create-path only) · tenant `labor_billing_rate` + bounded-hours-as-billed-quantity (founder decisions).

## 🆕 Jul 30 — founder field requests (from live paper-ticket workflow)

- [x] ~~**P1 — Print a COMPLETED ticket (paper billing hand-off).**~~ ✅ BUILT + LIVE (`4e4911fe`). `app/dashboard/admin/jobs/[id]/completed-print/page.tsx` (portrait, tenant logo + red job # top-right, work times, description + work_items, footage, subsistence, signature, Crew Notes). "Print Ticket" button on the completed-job-ticket view. Disposal/slurry/standby are write-in lines (no structured source). Guardian-fixed the wrong timecard columns (clock_in_time/clock_out_time/date/net_hours).
- [x] ~~**P1/P2 — Lead operator vs "helper tickets" on multi-operator jobs.**~~ ✅ BUILT (awaiting push). `job_crew` table (migration `20260730`); lead = existing `assigned_to` (full completion), added operators = crew helpers (light HelperWorkLog + clock-in). Add/remove via the schedule-board job panel (`components/JobCrewPanel.tsx`); crew see the job + get the light view (`viewer_is_helper` from `/api/job-orders`); their notes appear on the completed ticket ("Crew Notes"). Duplicated jobs don't copy crew. **Guardian caught a pre-existing BLOCKING bug**: `HelperWorkLog` was mounted inside the `!jobIsHelper` operator fragment → unreachable since ~Jul 14, so apprentice helpers couldn't log field work AND the Batch-3 helper→operator review step never rendered. Moved it into the helper view — fixes all three. RLS PASS, guardian PASS after fixes, E2E DB test passed.
- [ ] **P2 — Reminder for crew helper on clock-out.** The apprentice clock-out light-log gate is role-gated (`userRole==='apprentice'`); an OPERATOR crewed as a helper won't get the "submit your ticket" reminder (they can still log, just no nudge). Make that gate slot-based (job_crew helper OR helper_assigned_to). Follow-up, non-blocking.

## 🕒 Jul 30 — Timecard finishing batch (plan: docs/plans/TIMECARD_FINISHING_BATCH.md)

Founder's payroll "final touches." Phased (payroll = highest scrutiny). Decisions locked: GPS→native,
60-day→grandfather null hire_date, double-time→hours×2 rate, subsistence→`subsistence_nights` is source of truth.
- [x] ~~Notifications can't scroll~~ — ✅ FIXED (`NotificationBell` capturing scroll listener closed the panel on inner-list scroll).
- [x] ~~Configurable auto-clockout time (default 6pm)~~ — ✅ BUILT. `timecard_settings_v2.auto_clockout_time`/`_enabled`; cron reworked to run hourly + close day/shop cards at the tenant-local configured time (night shifts keep noon); admin time-picker + toggle replaces the dead "hours" field.
- [x] ~~Out-of-town subsistence prompt at clock-out~~ — ✅ BUILT. Clock-out asks "stayed overnight?" on out-of-town shifts → idempotent `subsistence_nights` upsert; annual report now counts the table (not `timecards.out_of_town`).
- [x] ~~**Double-time tag (hours × 2 rate)**~~ — ✅ BUILT (Phase B). DT now flows through payroll: `calculateWeekSummary` + team-summary carve DT out of the 40-hr OT base (OT-exempt, single-classification per card — guardian caught + fixed a double-subtract → negative-hours bug); the single-entry override now populates `double_time_hours`; new bulk `/api/admin/timecards/apply-double-time` tags people for a day (skips holiday stubs, clears mandatory-OT so no double-bucket overpay).
- [x] ~~**Holidays on the schedule board**~~ — ✅ BUILT (Phase B). Amber "★ Paid Holiday" badge in the week view + a "Mark Paid Holiday" day action (prompt hours → create + apply pay via the existing endpoints, carries `applies_to`, toasts applied/skipped/tenure_skipped).
- [x] ~~**60-day tenure eligibility**~~ — ✅ BUILT (Phase B). Holiday apply gates on `holiday_date − hire_date ≥ 60` (null hire_date grandfathered); read-only eligibility list on the Holidays settings page + `/api/admin/tenure-eligibility`.
- [ ] **P3 — `update/route.ts` fetchSettings reads `weekly_ot_threshold_hours` (nonexistent col; actual = `overtime_threshold_weekly`)** — pre-existing; the bad select nulls out → falls back to correct defaults (40/1.5/2.0), so a tenant that configured a non-40 weekly OT threshold is ignored on admin timecard edits. Low impact (Patriot uses 40). Fix the column name when touching that route.
- [~] **Continuous GPS + geofence auto-arrival + app-closed shop reminder** — Phase C (plan: docs/plans/PHASE_C_NATIVE_GPS.md).
  - [x] ~~C0 groundwork~~ ✅ LIVE — jobsite coords persisted (Google Places on create + Nominatim backfill cron); interim time-based clock-out reminder live.
  - [x] ~~C1 native foundation~~ ✅ BUILT + guardian-clean, STAGED (pushed `a9d71b64`) — `@capacitor-community/background-geolocation` + geofence service (auto-arrival + back-at-shop reminder) + provider + iOS/Android permission config. Inert until a native build; live web verified unaffected.
  - [ ] **C1 finish (needs founder + device):** cut a native build (`ios-release`/`android-release` skills: version bump → `cap sync` → archive → TestFlight/Play internal) → ON-DEVICE test + tune (permission flow, 0.5-mi radius, battery). Geofence logic is v1, un-tested on a device.
  - [ ] **C2 privacy (founder approval):** apply the drafted background-location wording to `privacy-policy.ts` + `gps-consent.ts` + a one-time re-consent prompt BEFORE the background build reaches users; Apple "Always"-location review.

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
- [x] ~~**🆕 Hireline-style hiring module Phase 1 (founder-directed Jul 2)**~~ — ✅ **BUILT Jul 3**
  (4 worktree builders + 5 guardian reviews, all BLOCKING findings fixed + re-verified; merged,
  build+tsc+jest green, full loop verified live: create job → Claude generates FB/IG/TikTok ad
  kit + 6 ADEA-safe screeners → activate → mobile apply → candidate in pipeline → shortlist).
  Shipped: /dashboard/hiring workspace (jobs, 2-field wizard, Ad Kit w/ FB/IG/TikTok previews +
  per-channel copy, translate + duplicate, screener editor w/ auto-reject + ADEA blocklist,
  candidate slide-over, CSV export), /apply/[slug] (mobile-first, ES support, resume upload),
  /jobs front door + self-serve signup (creates hiring-only tenant, HIRE code reserved),
  billing rails (Stripe card-on-file, threshold model, race-hardened charge, margin never
  exposed to customers). Plan: `docs/plans/HIRELINE_MODULE_PLAN.md`. **NOT yet pushed.**
- [ ] **Hiring module follow-ups (from guardian reviews, non-blocking):** billing crons
  (monthly charge on the 1st + charge-on-all-jobs-paused + dunning retry — wire in vercel.json
  w/ CRON_SECRET); durable rate limiting for public signup/apply/resume (in-memory Map resets
  per instance — fine at launch scale); resume MIME magic-byte sniffing if ever rendered inline;
  Spanish ADEA regex patterns; features.hiring gate on PUBLIC job pages (disabled tenant still
  serves active jobs); grouped candidate counts on jobs list (N+1 at scale); Stripe publishable
  key in Vercel env for live card entry (billing page shows placeholder without it).
- [ ] **Hiring Phase 2 — ad platform APIs** (playbook in plan §6): FOUNDER critical path = create
  FB page "Pontifex Industries Job Board" + start Meta business verification NOW (weeks of wait);
  then dev app + App Review (Claude drafts) → System User token → lib/ads/meta.ts publish/sync
  (special_ad_categories=EMPLOYMENT enforced). TikTok after: Business Center + Marketing API app
  → lib/ads/tiktok.ts (video-first caveat, $20/day ad-group minimums — Meta is the default).
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

### Jul 14 — crew workflow (founder-directed; plan: `docs/plans/SHOP_TICKETS_AND_CREW_PLAN.md`)
- [ ] **P0 BUG: helper couldn't see assigned ticket** (real crew, job QA-2026-105647 Jul 14).
      Diagnostic state + suspects in the plan doc §"Live-bug". Also fix the adjacent
      role-vs-slot bug (my-jobs keys helper visibility on role==='apprentice').
- [ ] **Helper staged view**: helpers always see scope/crew/equipment; ADDRESS reveals only
      once the operator taps In Route (gate on in_route_at, client + server).
- [ ] **Multi-helper crews**: `job_crew` junction (spec in plan doc) + assign UI "+ Add
      helper" + dispatch notifies all crew + 5 read-path updates listed in the doc.
- [ ] **Shop tickets**: ticket_kind='shop' on job_orders; assign crew; end-of-day "what I did
      at the shop" log; ADMIN signature sign-off; skips GPS/customer-SMS/survey. Board lane +
      Quick Add toggle.

### Jul 2 — full security audit + Artifex "2nd brain" upgrade + onboarding infra Phase 1
- [x] ~~**Tenant-creation wizard (Platform Hub v2 Build Item 1)**~~ — ✅ SHIPPED (`08ebf148`), unpushed. Replaces the flat "New Tenant" form with a 5-step guided sequence (Company → Branding → Modules → First Admin → Review & Launch), matching the founder's ask for scalable multi-company onboarding + a demo-request-to-tenant conversion path. Live company-code/slug uniqueness check, reactive login-page preview, 3 module presets (Starter/Field Ops/Full) over the existing switchboard, demo-request lead linking (`demo_requests.tenant_id`, column existed unused until now). Verified end-to-end live: created + inspected + cleaned up a real test tenant, 375px mobile clean, no console/network errors. Remaining Platform Hub v2 items (hub overview KPIs, brand polish) still open — see `docs/plans/PLATFORM_HUB_V2_PLAN.md`.
- [x] ~~**Ticket → AI draft-resolution pipeline**~~ — ✅ SHIPPED. `lib/tools/ticket-analysis-tools.ts` + `lib/agents/ticket-analysis-agent.ts` (Sonnet 5, tenant-scoped read-only investigation) + `POST /api/admin/feedback/[id]/analyze` (`requireSuperAdmin`) + an "Analyze with AI" button/panel on the feedback triage page. Draft-only per the founder's explicit scope call — verified by 2 independent reviewers that no write path exists beyond `ai_analysis`/`ai_analyzed_at` on the ticket itself. **Live-tested with a real ticket against real Patriot data**: the agent found actual flagged/pending timecard rows for specific operators and produced a grounded diagnosis tied to real user IDs and dates, not a generic guess.
- [x] ~~**Automated health-check routines**~~ — ✅ SHIPPED. `lib/platform-health-checks.ts` (stuck jobs, overdue invoices, inactive tenants) + `GET /api/cron/data-health-checks` (daily cron, deliberately renamed from `health-checks` to avoid confusion with the pre-existing `health-check` infra-monitoring cron) + `GET /api/admin/platform/health-alerts` + a new KPI tile + alerts section on the Platform Hub overview. Alerts auto-resolve when the underlying issue clears (no duplicate spam on re-run). Read-only against all tenant data — writes only to the new `platform_health_alerts` table.
- **Process note on this pair**: built via 2 parallel worktree builders, then 2 independent adversarial reviewers (security/tenant-isolation + regression/interference) per the founder's explicit ask for "multiple people checking." Both passed, but the reviewers caught 2 real process gaps I'd otherwise have missed: migration files applied to prod but never committed to `supabase/migrations/` (now fixed), and an in-progress file rename left uncommitted. Neither was a live bug, but both were "silently drifts from the repo" risks.
- [ ] **Face ID diagnostic** — blocked on founder: needs him to open My Profile → Security on his device and report the diagnostic readout (available/enrolled/error code) before any more code changes — architecture reviewed and looks correct; further blind fixes would repeat what already failed.
- [x] ~~**Cross-tenant IDOR audit + fix (8 routes)**~~ — ✅ FIXED (`addd479c`, `1689d45f`), unpushed. Manual + adversarially-reverified audit of every `[id]`-keyed admin/API route found 8 CRITICAL/HIGH cross-tenant data leaks live in prod: `access-requests/[id]/update-user` (cross-tenant role escalation), `team-profiles/[id]/credentials` (PII), `timecards/operator/[id]` (bulk week approve/reject), `shop/work-orders/[id]`, `customers/[id]/contacts/[contactId]`, `job-pnl/[id]` (payroll leak), `form-templates/[id]`, `badges/[id]` + `team-profiles/[id]/badges`. All fixed + independently re-verified by a fresh adversarial audit (0 bypasses found across 24 handlers). Also patched CRITICAL `jspdf` dep vuln + HIGH `axios`/`ws`/`form-data`/`picomatch` via `npm audit fix --legacy-peer-deps` (verified jspdf call sites only use the safe API surface). tsc + build clean throughout.
- [x] ~~**Platform security dashboard**~~ — ✅ SHIPPED. `/dashboard/platform/security` — platform-wide posture (RLS coverage 147/147, dependency audit, IDOR sweep results) shown as an honestly-labeled static "as of Jul 2, 2026" summary (not live-computed — a request handler can't safely re-run these checks on every page load), plus genuinely LIVE per-tenant signals (role distribution, over-provisioning flag, stale accounts, audit-log activity), verified live for both real tenants (Patriot: 20 users/10% admin-tier/5 stale; Apex: 8 users/13%/8 stale).
- [x] ~~**Job cost tracking / revenue tracker**~~ — ✅ SHIPPED. Optional "Track job financials" toggle on the schedule form (mileage rate/equipment/material/subcontractor/other cost), pre-filled from new tenant-level "Job Cost Standards" (Settings → Billing), auto-calculated drive distance via Google Distance Matrix (fixed a real bug along the way: `DriveTimeFromShop` was hardcoded to Patriot's shop location for every tenant — now reads each tenant's real `shop_latitude`/`shop_longitude`). Wired into the existing job P&L dashboard's cost breakdown + gross-profit calc. **Hard backward-compat requirement verified live**: a job with tracking off renders byte-for-byte the same labor-only P&L as before this feature existed. Live-tested the full chain: saved a tenant cost standard → DB confirmed only that tenant's row changed → set a test job's financials → P&L showed the exact correct math (20mi × $0.67/mi = $13.40 drive cost, all 6 cost categories summed correctly against the quote) → reverted test data.
- **Process note**: 4 parallel worktree builders, 2 touched the same file (`DriveTimeFromShop.tsx`) requiring a manual merge — resolved by combining both features (not picking one side), then had 2 independent reviewers specifically re-scrutinize the hand-merged code (not just re-check the individual builders). One real MEDIUM finding (unvalidated numeric cost inputs, could've let a negative/NaN value corrupt P&L math) — fixed and re-verified clean.
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

### Jul 22 — Takeoffs module (founder-directed; plan: `docs/plans/TAKEOFFS_MODULE_PLAN.md`)
- [x] ~~T1+T2 core + AI scope analysis~~ — ✅ SHIPPED Jul 22 (`10c7b1ec`, Patriot enabled):
      upload (signed-URL) → pdf.js viewer → calibrate-by-dimension (snaps to named scales,
      apply-to-all) → linear + count measuring w/ scope buckets (depth/diameter/surface trade
      fields) + live totals + server-side recompute → "Analyze scope" AI (text-layer only,
      rundown + key sheets + suggested buckets w/ evidence). E2E-verified against a
      known-geometry blueprint (scale snapped exactly; 720pt wall = 40.05 LF server-verified;
      AI found all 3 planted scope items). "E2E Test Blueprint" doc left in Patriot for the
      founder to play with.
- [ ] **T3 Deliverables**: annotated-PDF export (GC-ready marked scope), CSV totals, quote handoff,
      full-text sheet search; area tool; vertex editing; count-pin delete UX polish
- [ ] **T4 AI v2**: callout pins ON the sheet (text-layer anchored, accept/reject), scale
      suggestion from title block. NO auto-counting into bids (34-39% benchmark accuracy).
- Founder-side: upload a REAL bid set (Wolfie's 43-page IFP) and cross-check LF totals against
      his Easy Takeoffs numbers; bridge subscription $39/mo optional while T3 builds (his call).

### Jul 21 — compliance audit follow-ups (batch 4 done; audit: `docs/plans/COMPLIANCE_AUDIT.md`)
- [ ] **P1 — iOS location permission strings** (`ios/App/App/Info.plist`): reword
      `NSLocationWhenInUseUsageDescription` + AlwaysAndWhenInUse — current "checked once per
      clock-in" understates In-Route live sharing (Apple rejects on mismatch). NATIVE change →
      bundle with the next store build (Universal Links build is the natural vehicle).
- [ ] **P1 — store data-safety labels** (founder, ~10 min each): recheck App Store privacy
      labels + Play data-safety form against privacy policy v1.2 (location = collected, linked,
      app-functionality, no tracking).
- [ ] **P2 — SMS STOP enforcement in our code**: inbound Telnyx+Twilio webhook → set
      `sms_consent.opted_out` → suppression check in `lib/sms.ts` before send. (Carrier-level
      STOP already blocks delivery today, so users DO stop getting texts — this is
      belt-and-suspenders + audit trail.)
- [ ] **P2 — data-retention cron** (`/api/cron/data-retention`, monthly): purge
      `operator_location_pings` + `timecard_gps_logs` > 3yr, voice artifacts > 90d — the policy
      §4 table promises these windows; nearest real deadline is voice (90d).
- [ ] **P3 — EXIF strip on photo upload** (`components/PhotoUploader.tsx` canvas re-encode);
      **P3 — cookie/localStorage section** in next policy rev.

### Jul 12 — founder-queued next blocks
- [ ] **🔴 NEXT: Job-ad creation upgrade (founder Jul 13 — BLOCKS his hiring card + FB/TikTok
      connect: "we need to fix the ad creation first")**. Two parts:
      (a) **Company logo on ads** — surface tenant_branding.logo_url on the ad-kit preview +
      upload/replace control (job page); store per-job override if uploaded there. Ad creative
      previews (FB/IG/TikTok mock) render the logo.
      (b) **Context for better copy** — the HiringJob fields ALREADY EXIST (pay_min/max,
      schedule_text, requirements, benefits, generation_instructions, target_areas) but the
      creation UI only exposes title+description. Add an "Ad context" section (pay range,
      schedule, top 3 selling points, company one-liner, tone) on the job create/detail pages,
      feed ALL of it into generateAdKit's prompt, + a Regenerate button showing what context
      was used. Founder then: adds hiring card -> connects Facebook + TikTok (Phase 4 gate).
- [ ] **Artifex scope PHOTOS (founder Jul 13)** — attach pictures of the scope of work while
      creating a ticket in the Artifex room: upload button (+ camera on mobile) in the chat →
      job-photos storage bucket → attached to the draft/created job order → visible on the
      schedule-form review. Design decision: photos land on job_orders the same way
      work-performed photos do (reuse /api/job-orders/[id]/photos post-create).
- [ ] **Artifex voice barge-in (founder Jul 13)** — interrupt Felix mid-reply by speaking.
      Needs echo handling (speaker output feeding the mic transcribes Felix's own words) —
      prototype with keeping recognition open during TTS + drop results that fuzzy-match the
      spoken reply text; headset-first rollout.
- [x] ~~**Opifex build-out**~~ — ✅ RESOLVED Jul 21 (founder: "feature instead of independent
      app"): Opifex folded into the platform as the hiring module. Front-door tenant +
      self-serve signup retired; /jobs → feature marketing → /request-demo. Architecture:
      `docs/plans/OPIFEX_FEATURE_PLAN.md`.
- [ ] **Content strategy — deliver & showcase the software** (founder Jul 12: AFTER the finish-line
      phases). Positioning constraint is NON-NEGOTIABLE: never market as "concrete cutting
      software" (non-compete) — position as the bridge for companies to build custom digital
      infrastructure, industry-agnostic. Deliverables when picked up: channel plan (TikTok/FB/IG/
      LinkedIn), demo-video scripts (Artifex voice ticket = the hero moment), landing-page
      showcase sections, case-study format for tenant #1 (anonymized/white-labeled).

### Jul 8 — Patriot owner/admin report requests (source photos analyzed → `docs/plans/PATRIOT_REPORTS_PLAN.md`)
- [x] ~~**Artifex schedule history + quick job search**~~ — ✅ SHIPPED Jul 8: `search_job_history`
      tool (person/customer/date-range/status over schedule_board_view — "what jobs has X done"
      without scrolling the board).
- [x] ~~**Artifex payroll-style hours summary**~~ — ✅ SHIPPED Jul 8: `get_hours_summary` tool
      (reg/OT/DT/shop/night-premium/total + late days + subsistence nights per employee per
      pay period, weekly split; management-only).
- [ ] **Artifex co-pilot canvas (founder Jul 12)** — when Artifex works, it slides LEFT and a
      live workspace panel opens on the right: the actual quick-add form filling field-by-field
      as it collects slots, reports/schedules rendering as it pulls them, click panel → full page.
      Design: a `canvas` message-part contract from the agent (panel type + payload), right-side
      panel renderer in the room, slide-over animation. THE next Artifex UX block.
- [ ] **Artifex room: enterprise reskin Phase 2 (founder Jul 11)** — light+dark theme parity
      with the tenant app (currently dark-only), richer HUD chrome (Jarvis-reference sweep done),
      data-panel motion ("opening files" cards), voice picker. Phase 1 shipped: ambient 2nd-brain
      backdrop, speech-breathing orb, slot-filling brain, ARTIFEX identity + tile.
- [x] ~~**Attendance tracker (Patriot codes)**~~ — ✅ SHIPPED Jul 12 (`db978d6c`): attendance_events
      + 15-code set, Attendance Calendar tab (month grid, click-to-mark, auto worked/late/time-off
      overlays), codes roll into the annual Pull Report. Artifex `get_attendance_summary`
      tool ✅ SHIPPED Jul 12 PM (`e95bf2bd` — reads codes + the calendar's auto overlays,
      canvas panel). Remaining follow-ups: tenant-custom codes + holiday auto-derive (H).
- [ ] **Payroll Worksheet page** — pay-period picker (tenant pay_schedule weekly|biweekly +
      anchor), exact Patriot column set, subsistence side table, CSV export for QuickBooks.
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



- [x] ~~**APNs**: wire `lib/send-push.ts` into `/api/push/route.ts` end-to-end~~ — ✅ already done (verified Aug 2: route calls sendPushToUser; APNs/FCM + deep-link registration all wired). Remaining founder check: confirm the 4 APNs env vars in Vercel if push ever looks dead in prod.
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

## 🔬 QA loop findings (Jul 6 — Opifex/public tester)
- [x] **D2 Opifex nav trap** — hiring-only tenants had NO sidebar (no sign-out/profile/billing). FIXED: app/dashboard/hiring/layout.tsx + Job Board Billing sidebar item.
- [x] **D5 title stomp** — BrandingProvider overwrote per-page <title> everywhere. FIXED: only on /dashboard paths.
- [x] **D6 legal-page vertical leak** — /privacy + /terms said "concrete cutting". FIXED → field-services.
- [x] **D7 hiring wizard placeholder** — "Concrete Cutting Operator". FIXED → "Field Technician".
- [ ] **D1 [P1] Pricing "Start Free Trial" dead-ends** — CTAs → /dashboard/admin/subscription → bounce to company-login demanding a code the anon visitor lacks; ?plan= lost. No self-serve trial signup. Decide: point pricing CTAs at /request-demo, or build a real trial-signup flow.
- [ ] **D3 [P1] Logged-out shell leak** — expired/no-session renders the full admin shell from stale localStorage cache on some routes (equipment/fleet/inventory/maintenance/active-jobs/etc.) showing fake-empty "0 items"; other routes correctly bounce to /company-login. Data is safe (APIs 401) but UX reads as data loss + inconsistent guards. Fix: unify the client auth guard (redirect to login when no live session, don't render shell from cache).
- [ ] **D4 [P1] Pricing page washed out** — light radial gradient over dark theme makes Professional/Enterprise feature lists + trust copy near-illegible (desktop + mobile). The money page. Restyle.
- [ ] **D8 [P2] Pricing copy contradiction** — "Up to 5 team members" listed as included in EVERY plan under plans advertising 20/unlimited.
- [ ] **D9 [P3] Sub-44px tap targets at 375px** — homepage footer/nav ~17px, /jobs "Sign in" 38×15, pricing Monthly/Annual toggle 36px, my-profile 28px icon button.
- [ ] **D10 [P3] /dashboard/admin/active-jobs renders for hiring-only tenant** (marked CORE, not module-gated) — inconsistent with schedule-board/equipment gating.
- [ ] **D11 [P3] /dashboard/settings is a bare 404** (real page is /dashboard/admin/settings).
- [ ] **D12 [P3] scroll-behavior:smooth deprecation warning** — add data-scroll-behavior="smooth" to <html>.

## 🔬 QA loop findings (Jul 6 — ops-platform tester)
- [x] **#2 owner-cockpit user counts 0** — tenants API counted legacy tenant_users; now counts profiles. FIXED.
- [x] **#5 375px Platform Hub action row unreachable** — stack + overflow-x-auto. FIXED.
- [x] **#6 375px Schedule Board view toggles unreachable** — overflow-x-auto on the toggle row. FIXED.
- [x] **#8 avatar initials "S("** — getInitials strips parentheticals. FIXED.
- [x] **#10 Active Jobs raw ISO date** — formatDay(). FIXED.
- [x] **#11 scroll-behavior deprecation** — data-scroll-behavior on <html>. FIXED.
- [x] **#15 .playwright-mcp not gitignored** (119 files) — added + untracked. FIXED.
- [x] **#3 [P1] "Late" metrics contradict across 3 surfaces** — FIXED Jul 7: — timecards says 5 late/week w/ chips; time-off Attendance says 0; operator-detail says 4× vs weekly-grid 2. Attendance drives bonus decisions. Pick ONE definition of "late this week" and make all three read it. INVESTIGATE which query is right.
- [x] **#4 [P1] Overdue invoice double-counted** — FIXED Jul 7: — admin dashboard + Hub alert flag INV-2026-463087 (33d overdue, DRAFT, $3,200) but /dashboard/admin/billing shows Overdue 0 / Outstanding $0. Likely: dashboard counts draft-past-due as overdue, billing page excludes drafts. Decide: is a DRAFT invoice past its due date "overdue"? Align all three.
- [x] **#7 [P1-mobile] admin dashboard H1 overlap** — FIXED Jul 7 (stacks below sm).
- [ ] **#9 [P2] tab-title churn + wrong-audience** — dashboard pages flip marketing title → Patriot branding; the PONTIFEX owner console (/dashboard/platform*) shows PATRIOT branding (wrong audience — should be Pontifex). Consider: platform pages set their own title/branding, not the super_admin's home tenant.
- [ ] **#12 [P2] Customers phone unformatted/unvalidated** — "4705550001", an 11-digit "86491402778" stored raw. Add format-on-display + input validation.
- [ ] **#13 [P2] head-count disagreement, unlabeled** — roster 7 vs Team Profiles 13 vs Time Off 14 vs tenants-list 24 vs security 20. Each may be a different definition (clocked-in-eligible / all members / operators / active). Label each or unify.
- [ ] **#14 [P2] Settings Billing "6-Month Plan/Free Trial" vs Platform tenants "enterprise/ACTIVE"** — one is stale; reconcile source of truth.
- [ ] **#16 [P3] /favicon.ico 404 once** on command-center (favicon served from favicon.svg) — add a favicon.ico or a rel-icon fallback.
