# Management dashboard rebuild — Aug 7, 2026

Everything from the founder's admin-side walkthrough. Kept SEPARATE from
`OPERATOR_FLOW_REBUILD.md` at his request so the two don't tangle — different
users, different screens, different risk.

Same working rules: two or three items at a time, an agent reviews behind each
batch, nothing ships without him seeing it. **And after every change, check
Sentry** — his explicit instruction, so we learn we broke something from the
software rather than from a crew on a jobsite. *(Sentry is still not capturing —
the DSN isn't set in Vercel. That has to be fixed before "check Sentry" means
anything.)*

---

## BATCH M1 — the dashboard is lying  ← START HERE

Every number on the landing screen has to be true, because it is the first thing
he looks at each morning and everything else is judged against it.

**M1a. "Jobs today" says ZERO while the schedule board plainly shows jobs.**
A count that disagrees with the board next to it is worse than no count.

**M1b. Active jobs count needs to work** — same class of problem.

**M1c. Notifications don't stay dismissed.** He has 54. "Mark all as read"
appears not to stick, and "clear notifications" leaves them coming back. Note
there are TWO notification tables (`notifications` and `schedule_notifications`)
— a read/clear that only touches one of them would look exactly like this.
Related: task #27 (unread count wrong, clicking one should go somewhere useful).

**M1d. Revenue (MTD).** Confirm the tile really is month-to-date. It must count
**completed AND approval-completed** jobs — not active ones. Clicking it opens
the completed jobs behind that number: when each completed, the ticket detail,
and the cost breakdown we actually have today (labor cost, mileage cost).

**M1e. Pending timecards → "Notify to fix time".** When someone forgot to clock
out, one button that asks them to fix it, which lands as an action on their
screen.

**M1f. Collect the project total now.** Invoicing proper is deliberately parked
until the schedule board, schedule form and job ticket are solid — but capture
the project total from now on so the data exists when we get there.

---

## BATCH M2 — completed jobs

**M2a. Organise by PROJECT MANAGER**, so he can see which PM's jobs are done.

**M2b. Show ALL the data, not a summary.** He likes the current layout (daily
totals, standby, labor cost) — he wants it to keep that shape but carry
everything: how long each operator was there **each day**, the work performed
**each day**, and the rest of the detail the active-job view already shows.

**M2c. The utility waiver is MISSING from Job Documents.** The service
completion signature appears; the waiver does not. It is signed and stored —
it just isn't surfaced here. *(Ties to operator batch 11b, which stores the
signed waiver PDF against the job.)*

**M2d. Supervisor visits belong on the completed job.** If a supervisor visited,
show his notes and the ratings he left — for the operator AND the helper. If
nobody visited, show nothing rather than an empty frame.

**M2e. Average rating must NOT be one number for all jobs.** Break it down by
**operator** and by **helper**. A single blended figure across every job answers
no question anyone actually has. *(Same principle as operator batch 9b.)*

**M2f. "Proceed to invoice". ⏸️ PARKED — see `docs/plans/INVOICING_PLAN.md`.**
*Founder, Aug 11: "don't start pushing invoice — we need to make sure the
schedule board and all other task areas are completed before then."*
A working draft was BUILT and verified against a real job, then deliberately
reverted off `main` (revert `f3a848cb`) so an unrelated push could not carry it
live. The work is preserved on branch `feat/invoice-draft` (`e15c30f9`).
Everything below stays true; do not extend it until the board, the schedule form
and the job ticket are solid. The full spec, what was built, what was verified
and what remains now lives in the plan file.

**✅ THE SHEET — photo received Aug 10.** Patriot's paper "INVOICE/BILLING" form,
top to bottom, with where each field already exists in the platform:

| Field on the sheet | Where it comes from | Status |
|---|---|---|
| *(Patriot logo)* | `tenant_branding.logo_url` | ✅ have it — white-label, don't hardcode |
| **CUSTOMER** (4 lines — name + address block) | `job_orders.customer_name` + the customer's billing address | ⚠️ billing address may not be stored; check `customers` |
| **SUBCONTRACT** | — | ❓ no field. Ask what fills this |
| **CHANGE ORDER #** | `change_orders` on the job | ✅ have it |
| **PO #** | `job_orders.po_number` | ✅ |
| **JOB #** | `job_orders.job_number` | ✅ |
| **SALES REP** | `job_orders.salesman_name` | ✅ |
| **JOB NAME** | — | ❓ distinct from customer? Probably the site/project name |
| **JOB LOCATION** *(incl. city/state)* | `address` / `location` | ✅ |
| **DATE(S) WORK PERFORMED** | distinct `daily_job_logs.log_date` — a RANGE or list, not one date | ✅ derivable |
| **Job Ticket #(S)** | plural — the job's number PLUS every linked/duplicate ticket | ✅ `linked_copies` exists |
| **INVOICE DESCRIPTION OF WORK** (8 lines) | `buildWorkPerformedSummary()` over all days | ✅ this is the piece that kills the retyping |
| **INVOICE TOTAL** | — | ⏸️ **DEFERRED by the founder (Aug 10)** — see below |

**Build notes.**
- The two plural fields are the ones a naive build gets wrong: **DATE(S)** and
  **Job Ticket #(S)**. A multi-day job spans several dates, and a job worked by
  two crews has several tickets. Both must render as lists.
- **INVOICE TOTAL — the founder DEFERRED this (Aug 10):** *"right now you are
  right, we don't have that. Eventually we have to add quoted total — we have
  something similar to that already that we input — but we will need a way to
  add change order totals and other totals. That is later on, we can save that
  for later down the road."*
  So the draft ships with the money fields BLANK for the office to write in, the
  way the paper form works today. Do NOT block M2f on pricing. When it is picked
  up it is three things, not one: the QUOTED total, CHANGE ORDER totals, and
  other/extra totals — and there is already a similar field being entered
  somewhere, so find and reuse it rather than adding a fourth number.
- Output should be a PDF that matches this layout, so the office can print it and
  file it exactly as they do today. Reuse `components/pdf/DispatchTicketPDF.tsx`
  as the pattern.
- Still to confirm with the founder: **SUBCONTRACT** and **JOB NAME** — two
  printed blanks on his own paper form that map to nothing we store. Asked Aug 10;
  he wasn't sure what was being referred to, so the question needs putting
  concretely: *what do you write on those two lines when you fill this in by
  hand?* Guessing puts the wrong thing on a customer's bill.

**M2g. Print the COMPLETED ticket.** Same idea as printing a job ticket at the
start, but for a finished job: job ID, project manager, salesperson, what was
completed and on which days. This is what goes to the office as proof the job is
done.

---

## BATCH M3 — active jobs and filters

**M3a. Filters that match how he thinks:** by **project manager**, by **finishing
soonest**, and whatever else proves useful. One list with views, not several
pages.

*(Colour states for In Route / finished-for-day are in operator batch 3a —
same screen, keep them together when building.)*

---

## BATCH M4 — visits, ratings and team reports

**M4a. Site visit reports → choose an operator**, see every previous visit for
that person, including the supervisor's rating.

**M4b. A TEAM REPORTS page.** Choose a person → their **average helper rating,
average operator rating, average supervisor rating, average customer rating**,
whichever apply to their role — plus the history of visits and issues, so he can
have a real conversation with them backed by what actually happened.

**M4c. Everyone can see their own.** A button on the operator's and team
member's own dashboard — "my previous site visits" — showing their ratings and
the notes left for them. People should not have to ask what's being said about
them.

**M4d. Project managers do site visits too**, and can leave notes and ratings,
not only supervisors.

*(All of this shares one rollup with operator batch 9b and batch 14 — build the
"averages for this person, by source" helper ONCE and read it everywhere.)*

---

## BATCH M5 — Artifex should be able to take a job

Not urgent; recorded so the intent survives.

Artifex should understand the platform well enough to hold a real conversation
and **complete the SCHEDULE FORM** — not the quick-add. Ask for the client
information, accept **photos**, discuss the **equipment required**, and build the
job properly.

If it becomes too much to answer conversationally, a **"continue on the schedule
form instead"** button that **saves the progress so far** and hands them into the
form where they left off. Never make them start again.

---

## BATCH M11 — reminders: mostly ALREADY BUILT, three real gaps (added Aug 11)

*Founder: "can we send and edit reminders — 6:58 to clock in, again 7:05, then
remind them to clock out at 6pm unless night shift… or instead make it smart: add
start time in the schedule form, pre-fill at 7am, send notifications 5 mins
before start and 5 after if they still haven't clocked in, then a reminder 10 hrs
after start time to clock out unless they already clocked out."*

**He designed the second option himself, and it is the better one — it handles
night shift for free instead of special-casing it. It is also, almost exactly,
what is already running.** Checked before writing any code:

| What he asked for | Status |
|---|---|
| Start time on the job, pre-filled 7am | ✅ `job_orders.arrival_time`, falling back to `tenants.default_start_time` = **07:00:00**, then a hardcoded 07:00 |
| Notify **5 min before** start | ✅ `clockInReminderPhase` 'pre' — window start−7 → start−2 |
| Notify **5 min after**, only if not clocked in | ✅ 'post' — window start+3 → start+8 |
| Clock-out reminder **10 h after** start | ✅ `clock_out_10h`, plus 12 h and 15 h escalations |
| Don't nag someone who already clocked out | ✅ the cron only looks at open cards |

**And it fired this morning.** From `reminder_log`, last 10 days:
`clock_in_pre` 41 sent (most recent **today 07:25 ET**), `clock_in_post` 30
(today 07:35), `clock_out_10h` 28, plus 12h, auto-clockout warnings, and the
work-performed lunch/midday/overdue set. The 07:25/07:35 timings confirm it keys
off the JOB's start time, not a fixed clock.

### So the three things that are genuinely missing

**M11a. `arrival_time` is set on only 12 of 30 recent jobs.** The other 18 fall
back to the tenant's 7:00. That is a safe default, but it means a job with a real
9am start still gets nagged at 06:55. The founder's own words — *"add start time
in schedule form, standard, pre-fill at 7am"* — are the fix: make the schedule
form always carry a start time, pre-filled 07:00, so the per-job accuracy the
engine already supports actually gets used.

**M11b. NIGHT SHIFT is not excluded from clock-in reminders.** `is_night_shift`
lives on `timecards` — it is recorded AFTER the fact, from the shift worked.
Nothing on the JOB or the person marks them as a night-shift crew beforehand, so
the clock-in cron has nothing to check and will nag a night operator at 7am.
Needs a scheduled attribute (on the job or the assignment), not a derived one.
*(Note: with a per-job start time this mostly solves itself — a 19:00 arrival
time produces 18:55/19:05 reminders. M11a may be the whole fix. Verify before
building anything separate.)*

**M11c. There is NO WAY TO EDIT ANY OF IT.** This is what he actually asked for
first — "send and **edit** reminders". Every threshold is a constant in code:
`lib/reminder-timing.ts` (the ±5 min windows, LUNCH_HOURS 4, OVERDUE_HOURS 7) and
the 10/12/15-hour ladder in the clock-out cron. `tenants.default_start_time`
exists in the DB but has no settings screen. Ties directly into operator batch
**10b**, which already asks to "see and control the AUTOMATED notifications —
clock-in, work-performed, clock-out, dispatch, waiver chase, midday — at minimum
on/off and timing."

⚠️ Build 10b and M11c as ONE screen. Two places to configure notification timing
is how the waiver ended up with two wordings.

---

## BATCH M9 — hours by contractor and project (added Aug 11)

*Founder: "I would like to see contractor name and project name in timecards, to
see where operators were within a timecard. For certain contractors we like to
see how many hours we are working on certain projects."*

**M9a. Show the CONTRACTOR and PROJECT on every timecard entry** — so a timecard
says not just "8.5 hours" but "8.5 hours, Collins Custom Builds — Purple Power".

**M9b. Total hours by contractor / by project.** The actual business question:
how many hours are we pouring into this customer, this project. Needs the answer
to M9a to be trustworthy first.

### ⚠️ MEASURE FIRST — the link is missing on most timecards

`timecards.job_order_id` EXISTS, but is mostly empty. Measured Aug 11:

| | All time | Last 21 days |
|---|---|---|
| Timecards | 251 | 90 |
| Shop hours (no job expected — correct) | — | 2 |
| **Linked to a job directly** | **34** | 34 |
| Derivable from that day's work logs | 14 | 14 |
| **Field time with NO job connection at all** | ~200 | **37** |

So **roughly 40% of recent field timecards cannot say which job they were on.**
Building the report without fixing this gives the founder a number that quietly
omits nearly half the hours — worse than no number, because he would trust it.

### Why the link is missing
`app/api/timecard/clock-in/route.ts` DOES try to associate the job, but it only
looks at the two job-level slots (`assigned_to`, `helper_assigned_to`). It does
NOT consider:
- **`job_crew`** — extra crew members on a job,
- **`job_daily_assignments`** — the per-day ledger, which is authoritative for
  who is on a job on a given DAY (see the clock-out gate, which was fixed to
  respect it),
- anyone who clocks in **before** the job is dispatched (the query requires
  `dispatched_at`).

### Build order
1. **Widen the clock-in lookup** to job_crew + the day ledger, so new timecards
   carry the link. Cheapest fix, biggest effect, and it compounds daily.
2. **Derive at read time** for anything still unlinked: the day's
   `daily_job_logs` / `helper_work_logs` for that user+date name the job. Covers
   history without rewriting stored rows.
3. **Say "not recorded" honestly** where neither works. Never a blank cell that
   reads as zero hours.
4. Only then the by-contractor / by-project totals, with a visible note of how
   many hours could not be attributed.

⚠️ Do NOT backfill historic `job_order_id` by guessing. Deriving at read time is
reversible and auditable; writing a guess into the payroll record is not.

---

## BATCH M10 — edit the original scope after a job goes active (added Aug 11)

*Founder: "I would like to be able to add to / edit original scopes of work once
a job becomes active."*

Scope is set on the schedule form before dispatch. Once the crew is on site,
reality changes — the customer adds an opening, a dimension was wrong, something
was missed. Today that scope is effectively frozen.

**What this must NOT become:** a way to quietly rewrite what was agreed.
- Progress is measured AGAINST scope (`lib/job-progress.ts`). Editing scope moves
  the goalposts, so a job at 80% can jump to 40% or vice versa.
- Added work that the CUSTOMER asked for is a **change order** and already has a
  flow (`change_orders`), which carries a price and a signature.

**So the distinction has to be explicit at the point of editing:**
- **Correcting** the original scope (it was recorded wrong) — edits in place,
  keeps the original visible in history.
- **Adding** scope (new work the customer wants) — becomes a change order, not a
  silent edit of the original.

Operator batch **13b** already asks for exactly this to be visible: *"original
scope and added scope in DIFFERENT COLOURS, so the distinction is readable at a
glance."* Build the data model so 13b is possible — original and added must stay
distinguishable after the edit, not merged into one number.

**Also required:** an audit trail. Who changed the scope, when, and what it was
before. A scope edit changes what we bill and what the crew is measured against.

---

## BATCH M8 — many operators, ONE job (clarified by the founder, Aug 10)

*This is why DATE(S) and Job Ticket #(S) are plural on the paper invoice. It is
not a formatting detail — it is how Patriot actually works.*

**His words:** "There can be multiple operators inputting data… they can all be
on the same job but we need a way for each of them to input data into the same
ticket… some days some operators might have only gone 1 day to a job to help
someone out, or half a day. I need to duplicate a ticket to send them to a job
and collect work-performed data, but it should all be plugged into the 1 job…
**I need to track the work being done for the specific JOB, not the operator** —
but I need to see who has worked on it, when, their hours."

**The model he wants:**
- **One JOB** — the thing the customer is billed for, holding the scope, the
  progress and the total.
- **Many TICKETS** hanging off it — one per operator, so each can record their
  own work and hours without fighting over one form.
- Every ticket's work-performed rolls up into the ONE job.
- The office can see, per job: **who worked it, which days, how many hours each,
  and who contributed to the scope/progress.**

**What ALREADY exists — do not rebuild it:**
- `job_orders.parent_job_id` — duplicates are linked children. Live today: two
  Parkk Concrete jobs each have a linked ticket (Devin, Aiden).
- `lib/duplicate-job-order.ts` — the duplicate flow.
- `linked_copies_count` on the job detail view.
- Recorded earlier: *"Duplicates = linked children; scope + progress roll up to
  the parent, only hours/work are per-person."*

**The gap is the ROLL-UP VIEW, not the ticket mechanism.** On an Active Job the
office should see one consolidated picture — every operator who touched it, the
days each was there, hours each, and their contribution to the scope — instead of
having to open each linked ticket separately.

✅ **Checked, and the hard part is already done.** `lib/job-progress-server.ts`
resolves the ROOT via `parent_job_id` and gathers `work_items` across every
linked ticket before deriving progress. So a two-crew job's scope and progress
already roll up correctly — "all plugged into the 1 job" is true at the data
level today. (I flagged this as a suspected bug first and it wasn't one; leaving
the correction here so nobody re-investigates.)

**So the work is presentation, not plumbing:** an Active Job needs a per-person
breakdown — for each operator who touched this job or any of its linked tickets:
which DAYS they were there, HOURS each day, and what they recorded. The numbers
exist (`daily_job_logs`, `timecards`, `work_items` + the parent resolution
above); nothing surfaces them together.

Design note the founder was explicit about: the JOB is the unit, not the
operator. Per-person detail is a breakdown WITHIN one job's page — not a
separate per-operator view of the same work.

---

## BATCH M7 — what did we actually tell the customer? (added Aug 10)

*The founder: "I would like to be able to see in active jobs what notifications
have been sent out to contacts on site, so I know what they text me about."*

**M7a. A per-job log of every outbound customer message.** On the Active Job:
what was sent, to which number/email, at what time, through which channel, and
**the exact text**. When a contact texts him asking something, he should be able
to open the job and see what they were told — instead of reconstructing it.

⚠️ **This data does not exist yet.** `message_usage` records only tenant,
channel, provider, segment count, cost and a `source` string. `sendSMSAny`
receives `jobId` and **throws it away** — `meterSms()` never stores it, nor the
recipient, nor the body. So today there is NO way to answer "what did we send
this customer". Needs a proper outbound-message log (job_id, recipient, channel,
body, provider message id, status, sent_at) written at every send site, then the
Active Job surface reads it. Tenant-scoped, and treat the body as customer PII.

**M7b. The audit he asked for — DONE Aug 10, and it found something worse.**

*His report: Southern Basements texted asking if we were on site, but the ticket
said In Route at 7:43, so no message should have gone earlier.*

**He was right that nothing went early, and the wording is fine.** Exactly one
customer SMS was sent for JOB-2026-277097, at **07:43:56 ET — two seconds AFTER**
In Route (07:43:54), and it reads *"your crew is on the way… Track your job:
{portal link}"*. Honest, correctly timed.

**But `arrived_at_jobsite_at` is a lie on every job in the database.** It is
stamped 1–3 seconds after `in_route_at` — 15 of 15 jobs checked, going back to
July. Southern Basements: In Route 07:43:54, "arrived" 07:43:56. Nobody drives to
a jobsite in two seconds.

So at the moment the contact was told *"on the way"*, the system already had the
crew **arrived and working**, and the SMS hands them a portal link. The strong
hypothesis for Jay Harn's text: he opened the link, saw the crew marked on site,
looked outside, saw nobody, and asked. ⚠️ NOT yet verified — confirm what the
customer portal actually renders for a job in that state before calling it
proven.

This is the same rotten field as **operator batch 2c** ("Remove 'Arrived on
site' entirely… GPS already tells us when they arrived — the button adds a step
and produces a lie"). 2c is now more urgent than it looked: the bad value is not
just making Active Jobs read 0 hours internally, it is reaching CUSTOMERS.

---

## BATCH M6 — small but blocking

**M6a. The scan ticket has never worked.** He wants it working *now*, precisely
because they're mid-transition between paper and digital. It stops mattering
later — which is exactly why it matters at the moment.

**M6b. Waiver notification should know it's been signed.** If the contact signs
**on site**, stop sending the request. If the request went out first and they
then sign in person, opening that link should say it's already signed rather
than presenting the form again. *(Operator batch 6c is the same fact from the
crew's side — one status, honoured everywhere.)*

---

## Answered by the founder (Aug 7)

**M1d — revenue.** The tile shows **total minus labor cost**. Clicking it opens
a view showing **both gross and net**, so the headline is one number but the
detail doesn't hide either.

**M4b — who sees whose ratings.** Not one switch — four rules:
| Role | Sees |
|---|---|
| **Supervisor** | **Everyone's** reviews — he leaves them, and he needs to pull that data back |
| **Project manager** | Only the reviews left on **his own jobs** — not everybody's |
| **Operations manager** | Everything |
| **Admin** | Everything |
Enforce this SERVER-SIDE, not by hiding UI. A project manager must not be able
to reach another PM's people by changing a URL.

## Still open

**M2f — invoicing.** He is sending a photo of the sheet the office fills in
today. Build to that, not to a guess.

---

# Batch 16 — Aug 12, 2026. The founder's build order.

He gave an explicit order. Work it top-down; don't jump ahead.

> "lets work on job documents then filter on completed jobs then the new end of
> work questions"

## M12 — Job documents: the signed PDFs (DO FIRST)

> "in office documents in active jobs i would like to see the pdfs of the signed
> waivers and job completion tickets — i haven't seen any of that yet"
> …and on completed jobs: "I should be able to see the waiver signed and work
> completion signature there in documents as well."

Both surfaces, ACTIVE and COMPLETED. He has never once seen a signed document
come back out of the system, which is the tell: something is generated and then
lost, or never generated at all.

**Before building, verify which of these is true** — the answer changes the job
entirely:
1. Are the PDFs actually being produced and stored? Check the storage bucket and
   whatever column points at them (`utility_waiver_signature_data`,
   `completion_signature`, `customer_signature` are signature *images*, not the
   PDF). `CompletionSignOffPDF.tsx` and `LiabilityReleasePDF.tsx` exist — find
   out whether anything WRITES their output anywhere.
2. If they are produced but not listed → this is a read/link job.
3. If they were never persisted → this is "generate on demand from the stored
   signature + job data", which is cheap and also fixes every past job.

Do NOT assume (2). The pattern this session has been: the data exists and the
read path is wrong — but the invoicing module and the ratings both turned out to
have never written a row at all.

## M13 — Filter the completed-jobs list

> "let me be able to filter the jobs, because right now it just has jobs
> completed and a whole list of them. Let me be able to search it up by project
> manager or by day."

Filter by **project manager** and by **day / date range**, plus free-text search
on customer + job number while we are in there. `app/dashboard/admin/completed-jobs`.

## M14 — End-of-work questions (replaces the printed "Before You Leave")

> "What we can start asking them is if they dispose of slurry off-site… these are
> questions to ask AFTER they already input all the scopes of work. If they
> remove slurry off-site, if they remove concrete, how many barrels they used,
> and standby time."

Asked at the END of work-performed entry, once the scope is in. Keep it to one
short screen — he was explicit that the entry flow must get simpler, not longer.
Answers land on the printed ticket already filled in; that is the whole point of
having removed the paper checklist.

Fields: slurry disposed off-site (y/n) · concrete removed (y/n) · barrels used
(number) · standby time (hours + who authorised).

## M15 — Wages → labour cost on a completed job

> "i dont have a place to put current wage of employees to see labor cost after
> job is complete, so allow me to view that"

A wage per employee, and a labour-cost roll-up once the job completes.

⚠️ **Two things to get right.** `timecards.labor_cost` ALREADY EXISTS as a
column — find out what writes it before adding a second source of truth. And
wages are sensitive: whatever holds them needs its own RLS, readable by
admin/ops-manager only, never by the crew. This is exactly the shape of the bug
that hid work_items from the founder — check who can read it, by impersonating,
before calling it done.

Depends on the hours being right, which they now are (see the Aug 12 clock-card
attribution work). Labour cost built on the old numbers would have been fiction.

## M16 — Show the quote on completed jobs

> "show me in jobs completed the job quote that was input in schedule form to be
> able to track the financials"

The schedule form already captures a number — find it (`estimated_cost` is the
likely candidate; INVOICING_PLAN.md §4 flags the same question) and surface it
against actual hours/labour on the completed job. **Reuse the existing field.
Do not add a fourth money column.**

## M17 — Per-day work on completed jobs + print from there

> "still need to be able to see work performed for each day, not just tell me in
> total, so i can print out tickets on work completed tickets as well"

The completed-jobs panel shows a flat list. It needs the same per-day, per-
operator breakdown the work ticket already builds — `lib/work-ticket.ts`
`buildTicketDays()` does exactly this. Reuse it; do not write a second grouper.

## M18 — SHOP TIME (new, Aug 12 — he is telling the crew about it now)

> "im about to tell them about shop time, because once they get to the shop they
> should clock out then clock back in with shop time, and in timecards show if
> they were at shop as well. And I would like them, when they click clock in
> shop, to automatically create a ticket in their schedule that asks what they
> did at the shop — something simple, doesn't have to be multi-step, just so we
> can know — and requires signature of completion from admin. And create a shop
> tickets page under active jobs so we can see and print off those tickets as
> well, and show properly the time that they were in the shop for."

Six parts:
1. **Clock out of the job, clock back in as SHOP.** The toggle exists —
   `timecards.is_shop_hours` / `is_shop_time` / `hour_type` / `work_location`
   are all already columns. Establish which one is authoritative before writing
   a seventh.
2. **Timecards show shop vs field** at a glance, per entry and in the totals.
3. **Clocking in to shop auto-creates a shop ticket** on that person's schedule:
   "what did you do at the shop?" ONE screen. `helper_work_logs.is_shop_ticket`
   already exists — there may be half of this built already. CHECK FIRST.
4. **Admin signs it off.** A completion signature from management, not the crew.
5. **Shop Tickets page under Active Jobs** — view and print, same treatment as
   the work ticket.
6. **Shop time totals shown properly**, separated from field hours.

⚠️ This touches clock-in, which is the one thing that must not break at 7am.
Ship it behind verification and test the ordinary field clock-in path after,
not just the new shop path.

---

## Ticket layout — DONE Aug 12 (M11)

Landscape; type scaled up throughout; boxed JOB ID that cannot wrap; legal
verbiage replaced by a Signatures YES/NO strip; "Before You Leave" removed with
total footage moved into the totals; day blocks 1–3 across by week length.

Founder: *"clean and legible and modern UI, clear job ID… make the size of words
bigger."* Screenshot verified against Southern Basements, not asserted.

**Known trade-off:** a single day and a light week fit one landscape page. A busy
five-day week runs to ~1.4 pages. Closing that means shrinking the work detail,
which is the reason the sheet exists — his call, not ours to make silently.

## M19 — Split a day's clock card BETWEEN the jobs, by when the next one started

> "Yesterday I had Keon at 2 jobs and it says he was at the first one for .06
> hrs — that's not the case. It should see when they started their 2nd job, and
> that concludes the time for the first job."

**Diagnosed Aug 12 against production. Keon (Keontre Mcknight), Aug 11:**

| source | job | what it says |
|---|---|---|
| clock card | linked to JOB-2026-400368 | **7:00 AM → 5:32 PM = 10.04 hrs** ← the truth |
| daily log | QA-2026-140542 (Industrial Safety Coatings) | work_started 11:01 AM, day_completed 11:04 AM → **0.06 hrs** |
| daily log | JOB-2026-400368 (Leifeng) | day_completed 4:07 PM → 9.12 hrs |

The 0.06 is exactly the **three minutes** between tapping "start work" and
closing the ticket. He was filing paperwork at 11:04 before moving on, not
working for three minutes. `daily_job_logs.hours_worked` measures
work_started → day_completed, which on a two-job day measures the paperwork.

**The founder's rule, and it is the right one:** a job's time ends when the next
job begins. Applied to that day it reconciles exactly:

    job 1: 7:00 AM (clock in) → 11:04 AM (job 2 starts)  ≈ 4.07 hrs
    job 2: 11:04 AM           → 5:32 PM  (clock out)     ≈ 5.97 hrs
                                              total = 10.04 hrs ✓ payroll

### Where it goes

`lib/job-clock-attribution.ts`. Today that helper is all-or-nothing: a card is
attributed whole, or the day is reported `split_day` with no number. This
replaces the second branch with a real split.

Per person, per date:
1. Order the jobs they touched that day by first activity — earliest of
   `route_started_at`, `work_started_at`, or the first work_item timestamp.
2. Segment the clock card: job *k* runs from `max(clock_in, start_k)` to
   `min(start_k+1, clock_out)`.
3. Hours per job = its segment. **The segments must sum to the card**, so a
   rounding remainder goes to the last job rather than being dropped.

### Traps

- A card with **no clock-out** (still open) has no end boundary — fall back to
  today's behaviour and report it unattributable rather than inventing an end.
- A job started the PREVIOUS day (Leifeng's route began Aug 10) must clamp its
  segment start to the clock-in, not to its own route stamp.
- The first job of the day starts at **clock-in**, not at its route stamp — the
  drive and the shop time before it are still that job's.
- Do not write the split back into `timecards`. It is a read-time derivation;
  payroll's own number stays the card total. (Same rule as
  lib/timecard-job-context.ts.)
- `hours_source` gains a `'split'` value so the panel can show it as derived.

Fixing this also fixes the printed ticket, the Daily Progress panel and — once
M15 lands — labour cost, since all three now read the same helper.
