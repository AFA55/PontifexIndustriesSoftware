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

---

# Batch 17 — Aug 13. Waiver chase + the operator's printed ticket.

## M20 — 🔴 URGENT, NEXT: chase the operator until the waiver is signed

> "I know we have a system set up so when they click In Route for the first time
> it sends a notification to the contact on site letting them know our ETA and
> sends the utility waiver. But we also need to have a notification go out to
> THE OPERATOR based on their estimated arrival, if the utility waiver has not
> been signed yet — to make them get it signed by the on-site contact, or to
> resend it to the on-site contact. It's important we get that document signed,
> and we need them to remember to get it signed."

**Today only half the loop exists.** First In Route fires `sendWaiver()` to the
site contact and then nothing ever checks whether it came back signed. Production
proves the gap: of the jobs that have gone In Route, exactly ONE has
`utility_waiver_signed = true`. The document that protects the company from a
cut-conduit claim is being sent and quietly ignored.

**The rule.** Once the crew is en route, if the waiver is still unsigned by the
time they are due on site, tell the OPERATOR — not the customer — and give them
two one-tap outs: get it signed on site now, or resend the link to the contact.
Repeat while it is unsigned and the job is live; stop the moment it is signed.

Timing hangs off the ETA work already scoped in batch 3 (ETA from the crew's real
GPS at In Route, not from the shop). Until that lands, fall back to
`arrival_time` on the job, and if that is missing, In Route + 30 minutes.

- Use `sendNotification()` (lib/send-reminder.ts) so it honours preferences and
  lands on the bell. ⚠️ **Push may not reach them** — Javier has zero registered
  devices and SMS off, and he will not be the only one. Audit device coverage
  before trusting push for something this important.
- Idempotency: one nudge per escalation step per job. `reminder_log` is the
  existing pattern; do not invent a second table.
- **VERBATIM WORDING.** The founder sent a photo of paper ticket #9059 and asked
  for "exact same verbiage as the ticket". That text already lives in
  `lib/legal/prework-understandings.ts` — the PRE-WORK UNDERSTANDINGS / CUSTOMER
  AGREEMENT block. Reuse it; do not paraphrase a legal clause.
- **Test before it deploys.** His words. Drive it on the demo ticket end to end.

## M21 — The ticket the OFFICE prints and hands to an operator

This is the JOB ORDER print (`/dashboard/admin/jobs/[id]/print`), not the work
ticket. It is handed to a crew at the start of a job.

- **a. Remove Difficulty.** Already done Aug 12 — verify it stayed removed.
- **b. Remove "Multi-Day" and the crew names.**
  > "I can print that ticket out, but doesn't mean the same people are always
  > going to be in the same project."
  Printing a sheet on Monday must not assert who is on it Thursday. Same lesson
  as the per-day assignment work: a name on paper outlives the assignment.
- **c. Show the EQUIPMENT the project manager actually chose.**
  > "Actually show the equipment required — show everything. You can change the
  > layout to not just be radios that get checked off, but instead show what the
  > project manager pushed and chose for equipment."
  Today it prints a flat chip list from `equipment_needed` +
  `equipment_selections`. It should show the PM's actual selections, grouped and
  legible, so the crew loads the right truck. Read what the schedule form
  writes into `equipment_selections` / `equipment_rental_flags` before
  designing the layout — the shape is already there.
- **d. Print the TICKET ID.**
  > "Show the ticket ID number so then later we can match job ticket with the
  > tickets I print for operators on their work performed."
  The work ticket got a boxed JOB ID on Aug 12; this sheet needs the same number
  in the same place so the two sheets pair up on the desk.

## Data repairs done Aug 13
- JOB-2026-160762 (Parkk, Industrial Park Dr) — span repaired Aug 13–15, unassigned.
- JOB-2026-499921 (Gleeson) — founder: "same day done job" → Aug 21, single day.
- JOB-2026-815303 (Pinnacle, starts Aug 26 ends Aug 7) — STILL INVERTED and
  invisible. on_hold, so not urgent, but it needs a duration from the founder.

---

# Batch 18 — Aug 13 PM.

## M22 — ✅ DONE: admin could not see completed jobs

> "Our admin cannot see completed jobs. Allow him to see completed jobs as well
> so he could print tickets for operators that have already finished."

Not a permission problem — Amanda (admin) could read all 13 completed jobs at
the database level. The page itself filtered on
`.not('completion_signed_at','is',null)`, so **8 of 13 completed jobs were
invisible**. A crew that finishes via "skip signature — submit for supervisor
approval" never gets that stamp, so the job completed normally and then vanished
from the one page the office uses to pull a finished ticket.

Now lists every completed job and SHOWS the signature state instead of hiding
the job over it ("Not signed" / "No signature — contact off site"). Date falls
back signed-at → work-completed-at → scheduled date, so an unsigned job stops
rendering `Invalid Date`.

## M23 — 🔴 The printed ticket dates work to the day it was TYPED, not worked

> "I printed off Dante's ticket for Southern Basements, which he completed this
> past Monday and Tuesday, and the ticket says he did it the 12th, which was
> yesterday. Even if he filled out the ticket on the 12th, the day he was there
> was the 11th. The ticket we print needs to say that accordingly."

**Diagnosed. The ticket is innocent.** `resolveWorkItemDate` already prefers the
daily log over `created_at`, and it did exactly that here. The problem is one
level down:

    daily_job_logs  →  the job's ONLY log has log_date = 2026-08-12
    work_items      →  day_number 1, operator Dante, created 2026-08-12 11:04
    timecards       →  Dante worked Aug 11, 7:00 AM – 6:08 PM (10.64 hrs)
                       and Aug 12, 6:59 AM – (still open), 0.00 hrs

The log was CREATED on the 12th and took "today" as its date. The ticket then
faithfully printed the day the paperwork was filed. Same family as Keon's
0.06-hour job (M19): **submission time is being used as work time.**

### DECIDED (founder, Aug 13) — derive it, do not ask

> "We should capture the real day as when the work was scheduled, and when they
> started the job. Even if the job started on the twelfth but they didn't fill
> their ticket in until the fifteenth, that work still started the twelfth. And
> yes — you could double check from the clock in / clock out, because every day
> they are somewhere, and they do get assigned to jobs. So the app should know.
> Once you filled it out on Wednesday, he was there Monday, Tuesday."

**No extra tap.** The system already holds everything it needs; it was just
reading the wrong field. The work date is derived, in this order:

1. **The clock card is the witness.** Which day(s) was this operator actually on
   the clock, inside this job's scheduled span? That is when they were there.
   `timecards` + the M19 split-day attribution answer this; both read
   `lib/job-clock-attribution.ts`, so build it there once.
2. **Bounded by the job's schedule.** `scheduled_date` → `end_date` is the only
   window work can belong to. A ticket filed on the 15th for a job that ran the
   12th–13th can only land on the 12th or 13th.
3. **The job's start is the anchor.** If nothing else resolves, work belongs to
   `scheduled_date` — the day the job started — never to the submission date.

Submission time (`created_at`, and `log_date` when it was defaulted to "today")
stops being a source of truth for WHEN work happened. It stays as an audit fact:
when the paperwork was filed.

⚠️ **The existing rows still need repairing** — Southern Basements' only log is
dated the 12th for work done the 11th. Derivation fixes the read path; a
one-time backfill (or an office-side date correction) fixes what is already
stored. Do not skip this, or every ticket printed for past work stays wrong.

⚠️ A multi-day job where the crew clocked in on several days must produce one
row PER DAY, not one lump on the start date — the founder's "he was there
Monday, Tuesday" is literally two days on one ticket.

### The two options considered before that decision (kept for context):
  **A. Ask at entry.** Day Complete asks "what day was this work performed?",
     defaulting to today. One tap on the normal path; correct on the late path.
  **B. Infer from the clock card.** If the operator had no clocked hours on the
     log's date but did on the preceding day, date the work to the clocked day.
     No extra tap, but it is a guess, and guessing is what produced this.

Recommend **A**, with the office able to correct a log's date after the fact
(needed regardless — nothing can fix the existing rows without it). B can ride
along as the DEFAULT the question is pre-filled with.

⚠️ Whatever lands must also fix the EXISTING logs, or every ticket printed for
past work stays wrong.

## M24 — Dispatch to a helper WITHOUT an operator, and to more than one

> "I would like to assign jobs to helpers and then give me the option to either
> assign them as operator or helper… Some helpers just need to know where the
> address is and get out there. I want to dispatch a ticket to them, but I can't
> right now unless I assign them as the operator, even though they don't have to
> fill an operator ticket. So I'd like to be able to assign and choose a helper,
> and not have to assign an operator if I don't want to. And since I assigned
> them as a helper, they just fill out the helper ticket. And I want to be able
> to assign more than one helper — a button that says ADD HELPERS."

Three distinct pieces:
  a. **Assign a helper with no operator.** Today the board's assign flow is
     operator-first; a helper-only job must be possible, and the job must
     dispatch and appear on that helper's schedule.
  b. **Choose the SEAT when assigning.** Operator or helper, explicitly — this
     is the 1g "which ticket do they fill?" question arriving from the office
     side instead of the operator side. The seat decides the ticket: operator →
     operator ticket, helper → helper ticket. `lib/rbac.ts canBeCrewMember()`
     and the slot-based visibility work (Aug 11) already support a person in
     either seat; this is the assign UI catching up.
  c. **More than one helper.** `job_orders` holds ONE `helper_assigned_to`, but
     `job_crew` is already a many-row table with a `role` — that is the seam.
     ⚠️ Read how job_crew is consumed before adding a column; the plural crew is
     already half-built and a second mechanism would fracture it.

## M25 — Rescheduling leaves the job "in progress"

Noticed Aug 13 while building the waiver chase. JOB-2026-160762 was moved to
today and still carried `status = in_progress` and an Aug 10 `in_route_at`. The
waiver cron had to grow a "span must cover today" guard to avoid chasing a crew
off a three-day-old stamp.

Founder: *"Pending — just like you're on pending."* So a rescheduled job should
drop back to a pre-work state and clear the run stamps (`in_route_at`,
`arrived_at_jobsite_at`, `work_started_at`) for the new day. Anything already
logged stays — history is not rewritten, only the live flags.


## M26 — ✅ DONE: Adam and David can approve pending jobs

> "Give permission to Adam Ingalls and David Schadt, the supervisors — add this
> to their permissions so they could push jobs if I'm not here."

Adam is a `salesman`, David a `supervisor`. The approve endpoint sat behind
`requireAdmin` (admin | super_admin | operations_manager), so neither could
release a job and the schedule stalled whenever the founder was away. The pending
jobs PAGE already admitted both roles — only the API said no.

Fixed with a dedicated `requireJobApprover` guard, NOT by widening ADMIN_ROLES.
Widening that constant would have handed a salesman every admin route on the
platform — timecard edits, team permissions, deletions — to fix one button.
4 tests lock the boundary: both roles can approve, the crew still cannot, and
approving does not imply admin.

---

# Batch 19 — Aug 13 evening. The printed ticket, photos, and scheduling by DURATION.

## M27 — Equipment on the printed ticket (supersedes M21c with the founder's detail)

> "I wanna show all equipment required. Right now it doesn't show that when I
> print out the ticket — it just shows radio boxes. That's not necessary. What I
> need is to show me the equipment that is required for that job. If it's a
> quick add job, let's make it smart so when it chooses hand saw it knows what to
> grab or what goes with it usually. And if we can't do that, let's just have a
> space where the project manager can write out equipment that is required."

Three tiers, in order of preference:
  a. **Print what the PM actually chose.** `equipment_selections` /
     `equipment_rental_flags` / `equipment_needed` already carry it — read the
     shape the schedule form writes before designing the layout.
  b. **Infer for quick-add jobs.** A job type implies its kit: hand saw → blades,
     water, hose, GFCI. Build the mapping as DATA, not code, so the office can
     correct it without a deploy. It is a SUGGESTION and must be labelled as one.
  c. **Always allow free text.** A PM writing "bring the 36in blade" beats any
     inference. This is the fallback that makes (b) optional rather than blocking.

## M28 — What the printed job order must and must not carry

> "Remove difficulty rating and multi-day words, as well as employees and
> employee names — that is not required on the ticket when I print it out. What
> we need is the jobsite information, contact information, a space to put notes,
> equipment required, jobsite specifications."

REMOVE: difficulty rating · "Multi-Day" · crew names.
KEEP / ADD: jobsite information · contact information · **a blank notes space** ·
equipment required (M27) · jobsite specifications.
Plus: the **job number bigger and more visible** — "I wanna hand out the ticket
just so we know what ticket goes with what work-performed ticket." The work
ticket got a boxed JOB ID on Aug 12; this sheet needs the same treatment, and
the body text needs to come up a step like the work ticket's did.

## M29 — 🔴 Daily progress drops a day the crew actually worked

> "Aiden's clock shows him there the 4th, 5th, 6th and 7th, but the daily
> progress shows the 5th, 6th, 7th. And instead of showing started-in-route,
> show the clock-in / clock-out time. If they forget to input data but were
> assigned to the job, just show the day."

**Confirmed against production.** Aiden (14cb2d1a) on JOB-2026-402357:

| day | clock hours | log filed against | ledger says he was on |
|---|---|---|---|
| Aug 4 | 9.89 | JOB-2026-**424813** | JOB-2026-**402357** |
| Aug 5 | 10.27 | 402357 | 402357 |
| Aug 6 | 10.02 | 402357 | 402357 |
| Aug 7 | 8.84 | 402357 | 402357 |

Aug 4 vanishes from 402357's daily progress because the day is built from
`daily_job_logs`, and that day's log was filed against the sibling job. He was
clocked in nearly ten hours and the per-day ledger puts him on 402357.

**The rule:** a day belongs on a job when the ledger says the person was on it
AND they were on the clock — a missing log is a missing TICKET, not a missing
day. Render it with the clock in/out and an explicit "no ticket filed" marker,
which also makes M30's remind button obvious where to put it.

Same family as M19 (Keon's split day) and M23 (work dated to when it was typed).
All three are "the day is derived from the wrong record". Build them together in
`lib/job-clock-attribution.ts`, once.

## M30 — "Remind operator to input work performed for this day"

> "A button that says remind operator to input work performed for this day… if
> they haven't input the work performed for that day, let us send out
> notifications, and have a notification hub where the project manager for the
> job can just click a button. And it's based on the day."

Per-DAY, per-person, manual — sitting on the empty day M29 now renders. Reuse
`sendNotification` + `reminder_log`; there is already an automatic
work-performed cron, so this is the manual override for the office.
⚠️ Device coverage again: Javier has zero push tokens and SMS off. A button that
silently reaches nobody is worse than no button — surface the delivery result.

## M31 — 🔴 PDFs in photos crash; images open off-site

> "When PDFs get referenced in photos, right now it crashes. I'd like to input
> PDF photos and view them. Right now when I click on them it sends me to a
> supervised page. We need to have all this in house — so when I click on the
> image I could zoom in, zoom out, and really get more details."

Two defects and one feature:
  a. a PDF in the photo flow **crashes** — reproduce it first, it is the only
     one here that loses work;
  b. clicking a photo leaves the app for a raw Supabase storage URL (the same
     class as the dead completion-PDF links — storage URLs are not a UI);
  c. an in-app viewer: zoom, pan, next/previous, and PDF support.

## M32 — Schedule by DURATION, not by a date range (Doug)

> "Right now it shows the work being Monday through Sunday all through the week.
> Instead of putting a time frame, I could just put the job is expected to last
> five days. That way when they input work performed, the schedule will
> automatically update. If they can't work Fridays but it's a five-day job, the
> schedule should not put it on Friday, Saturday or Sunday. It would show it for
> the days we can work there and put it in the schedule accordingly — because
> eventually we're gonna use that schedule to put NEW jobs on the schedule."

The biggest idea in this batch, and the one to design before touching code.

A job gains an **expected duration in WORKING days**. The calendar span becomes
DERIVED: lay the duration onto the days this crew/site can actually work,
skipping non-working days. As work is performed the remaining duration shrinks
and the projected end date moves on its own.

Depends on knowing which days are workable — per site (this customer allows no
Friday work) and per company (holidays; `holidays` settings already exist).
Feeds the eventual auto-scheduler, which is the real reason he wants it.

⚠️ `end_date` is currently authoritative in a dozen read paths (board visibility,
the ledger span, the work ticket). Duration must be introduced ALONGSIDE it —
derive `end_date` from duration and keep writing it — or every one of those
breaks at once. Do not flip the source of truth in one commit.

## M33 — Quick-add jobs: fill in the rest later

> "When I add quick-add jobs, I would like to be able to press on it and then
> later go back and fill out the whole schedule form. The quick add is just gonna
> be there to put space on the schedule."

A quick-add is a placeholder that reserves a slot. Opening it should continue
into the full schedule form, pre-filled with what little it has, and saving
should upgrade it in place — same job, same number, no duplicate.

---

# Batch 20 — Aug 13. Photos nobody else can see, and the ticket-printing hub.

*Founder: "analyse these and add them to files with directions on how to resolve
those issues, so once we start working on them we can tackle them right away."*
So each item below carries a first move, not just a description.

## M34 — 🔴 Only the founder can see job photos. David and Amanda cannot.

> "For some reason I can open jobs and view images and pictures, but David,
> project managers and Amanda cannot. And for some reason it opens in Supabase —
> it should open internally."

**Almost certainly the same shape as the work_items bug fixed Aug 12**, and the
first move is the same: DO NOT assume, impersonate and measure.

    begin;
    select set_config('request.jwt.claims','{"sub":"<david|amanda uuid>","role":"authenticated"}', true);
    set local role authenticated;
    select count(*) from job_photos;            -- or whichever table backs photos
    select count(*) from storage.objects where bucket_id = '<job-photos bucket>';
    rollback;

The founder is `operations_manager`/`super_admin`; Amanda is `admin`; David is
`supervisor`. If the count differs from his, it is an RLS grant that names too
few roles — fix by widening the SELECT policy with
`current_user_has_role(...)` + a tenant check, never `user_metadata`, and verify
by re-impersonating (see `20260812_work_items_select_ops_manager.sql` as the
template).

Second half: **"it should open internally."** Photos link straight to a storage
URL, which is the same class as the dead completion-PDF links — a storage URL is
not a UI, and on a private bucket it will not even open. Serve through a signed
URL minted at click time, exactly like `lib/completion-pdf-path.ts` +
`/api/admin/jobs/[id]/documents` now do.

## M35 — 🔴 A maintenance request's photo is invisible to the founder

> "When David tries to submit a maintenance request, I can see he uploaded an
> image, but I cannot see the image."

Note the direction is REVERSED from M34 — here the uploader can see it and the
founder cannot. That asymmetry is the clue: check whether the row stores a raw
storage path vs a full URL, and whether the reader resolves it. Bucket is
`maintenance-photos` (3 objects, private). First moves:
1. Read the row — is the column a path, a public URL, or a signed URL that has
   since expired? (Expired signed URLs look exactly like "broken image".)
2. Impersonate both accounts against `storage.objects` for that bucket.
3. Whatever it turns out to be, the fix ends in the same place as M34: a signed
   URL minted at read time, rendered in-app.

## M36 — In-app photo viewer (zoom, pan, PDF)

> "When I click on the image I could zoom in, zoom out and really get more
> details on the pictures." Plus: **PDFs currently crash** the photo flow.

Direction: one viewer component used everywhere photos appear (job photos,
maintenance, scope photos). Signed URL in, zoom/pan, next/previous, and a PDF
branch. Reproduce the PDF crash FIRST — it is the only item here that can lose
someone's upload, and the stack trace will say whether it is the uploader
(rejecting a non-image mime) or the renderer (an `<img>` pointed at a PDF).

## M37 — ⭐ OPERATOR DAILY TICKETS — one page to print them all

> "Instead of having to go to each individual ticket to print out work
> performed, I'd like a space dedicated in the software that says Operator Daily
> Tickets, where I can view operators, see where they have been, their hours,
> and print tickets for all operators for that week if I wanted to — or just a
> specific date, or a specific operator. That way I can print out what I need so
> much faster than looking and clicking through active jobs and completed jobs.
> And in that same card and page we can have shop tickets, and I can print out
> all shop tickets at once instead of clicking one by one. The goal is to print
> these tickets faster and see where everyone was, to be able to bill and track
> hours accordingly."

The single highest-leverage item on the whole list: it is how the office bills.

**Pivot the data by PERSON × DAY instead of by job.** Everything needed already
exists and must be REUSED, not rewritten:
  • `lib/job-clock-attribution.ts` — which job a person's clock card belongs to
    (and, once M19/M23/M29 land, how a split day divides).
  • `lib/work-ticket.ts` `buildTicketDays()` — already groups by day then by
    operator, and already prefers timecard hours.
  • `/dashboard/admin/jobs/[id]/work-ticket?mode=day|week&date=` — the printable
    sheet already exists; this page selects WHICH ones to print.

Build order:
  a. **The view**: filter by date / week / operator; a row per operator per day
     showing where they were, their hours, and whether a ticket was filed.
     Reuse the M29 "assigned + clocked in but no ticket" rendering — the same
     gap the office is chasing when they print.
  b. **Print one**, from that row.
  c. **Print many** — every operator for a week, or every shop ticket at once.
     ⚠️ Bulk printing is where this gets hard: one print view rendering N
     tickets with a page break between them, not N browser tabs. Design that
     before building (a), because it constrains how the ticket renders.
  d. **Shop tickets** in the same place — `helper_work_logs.is_shop_ticket`
     already exists, and M18's shop-time work will feed it.

Blocked-ish: the hours are only trustworthy once M19 (split days), M23 (work
dated when typed) and M29 (missing day) land. Billing off today's numbers would
bill the wrong hours — build the page, but land those first or state plainly on
screen which figures are derived.

---

# Batch 21 — Aug 13 late. Adam's 403, David's unreachable button, dark mode, and the notepad.

## M38 — ✅ FIXED: the office got 403 on jobs they own

> "Adam wasn't able to click on J. Davis or open it up, and that's his own
> project, so he should most definitely be able to open it up."

Screenshot: **"Failed to load job details. HTTP 403"**, signed in as Adam Ingalls.

The job-detail PAGE admits `admin, super_admin, operations_manager, salesman,
supervisor` — but all four endpoints it calls (`summary`, `live-status`,
`progress-by-day`, `documents`) used `requireAdmin`, which is only the first
three. Adam is a `salesman`, David a `supervisor`: the UI said yes, the API said
no, and it reads as the app being broken rather than as a permission.

Fixed: those four are READ-ONLY, so they now use `requireSalesStaff` — exactly
the roles the page admits. **Third time this exact shape has bitten** (work_items
RLS, the approve button, this). ⚠️ RULE: when a page's role list and its
endpoint's guard disagree, the page is the spec. Audit the rest of
`/api/admin/**` GETs against the pages that call them.

## M39 — 🔴 David cannot reach the Continue button on his phone

> "David tried to click the button to continue the review form and it does not
> let him proceed because that button is hard to reach. I know all phones are
> different, but we must have a way… or have a proper layout so he can actually
> touch the button."

Screenshot: the visit-report form on an Android; **"Continue →" is behind the
system nav bar** at the bottom.

Cause is the same family as the Dynamic Island work on Aug 11: a fixed bottom
bar with no bottom safe-area inset. Android gesture/nav bars vary by device, so
a fixed pixel offset will always be wrong on some phone.

Fix: `padding-bottom: max(1rem, env(safe-area-inset-bottom))` on that action
bar — `.pb-safe` already exists in globals.css — and make sure the scroll
container reserves the bar's height so the last field is not hidden under it.
Then verify at 375×812 AND on a short viewport, not just a tall one.
Same audit applies to every fixed bottom action bar (work-performed already has
`pb-safe`; the visit-report flow evidently does not).

## M40 — Dark mode: white boxes you cannot read

> "In schedule form in dark mode one part shows up white even though it's dark
> mode and it's hard to see. Same goes for the questions the schedule form asks
> toward the end for Friday or Saturday work — it's white and can't be seen."

Screenshot confirms: the equipment "Add" input renders white-on-white inside the
dark form. Two known spots (equipment add, the Friday/Saturday work questions),
but treat it as a sweep: find inputs/containers with a hardcoded light
background and no `dark:` variant. `docs/reference/UI_CATALOG.md` is where the
correct pattern should be recorded once fixed.

## M41 — Duration-based scheduling (the founder's own restatement of M32)

> "Right now we choose start and end date of projects. Moving forward I would
> just like to choose the start date, then the job timeframe — input the number
> of days we think the project will take — so it can automatically change the
> dates. And then be smart and not put on the schedule weekends, or Friday, if
> they didn't click that they work on those days."

Same as M32 (Doug's version); recorded again because he asked for it twice,
which is the signal it is real. The schedule form already asks about
Friday/Saturday/Sunday work — that answer becomes the input to the calendar
walk, not just a note. See M32 for the ⚠️ about `end_date` still being
authoritative in a dozen read paths: derive it, keep writing it.

## M42 — From the notepad photo ("Pontifex – Improvements")

**Ticket fill-out**
  a. A **bold line item for Contractor Signature and Utility Waiver** on the
     ticket — or a SEPARATE printout accompanying the ticket for the customer to
     sign. (Ties to M20: the waiver is the document that keeps going unsigned.)
  b. Add a **grinding / scarifying** work option.
  c. Let a job be marked **both inside AND outside** — today it is one or the
     other.
  d. A **"Will Call"** section on the schedule form. (The board already has a
     Will Call folder — check what feeds it before adding a second flag.)

**Errors**
  e. Error when clicking **Active Jobs** — likely the same 403 family as M38;
     re-test after this push before investigating further.
  f. Error when clicking to **view the customer signature** on job completion.
  g. **Completion photos do not load** — M34/M35 family (storage URL, not a UI).

**Money**
  h. **Edit the money total after a ticket is created.** Feeds M16 (the quote)
     and the parked invoicing work.

**Access / mornings**
  i. Adam needs to **print his jobs (or all jobs) and mark them completed**, and
     to cover "when Andres isn't here" — the same standing theme as M26/M38.
  j. **Schedule job tickets to go out at 7am** automatically. There is already a
     dispatch cron (`auto-dispatch`) — check its schedule and whether it sends
     the ticket, before building a second sender.

## M43 — "Deleted User" holds a live job on the schedule board

Visible in the board screenshot: a **Deleted User** row owning DEMO-2026-000002.
Deactivated profiles still hold assignments. Decide the rule (reassign on
deactivation, or surface as Unassigned) and make the board stop presenting a
deleted person as a crew slot.
