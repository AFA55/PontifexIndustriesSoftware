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

**M2f. "Proceed to invoice".** A button on the completed job that drafts an
invoice sheet. Today the office manually pulls the completion ticket and the
work ticket and retypes them into a separate invoicing ticket.

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
| **INVOICE TOTAL** | — | ❌ **NOT CAPTURED** — this is exactly why M1f exists |

**Build notes.**
- The two plural fields are the ones a naive build gets wrong: **DATE(S)** and
  **Job Ticket #(S)**. A multi-day job spans several dates, and a job worked by
  two crews has several tickets. Both must render as lists.
- **INVOICE TOTAL blocks a complete draft.** M1f ("capture the project total from
  now on") is a prerequisite, not a parallel task — without it the draft always
  has a blank where the number goes, which is the one field the office cannot
  look up.
- Output should be a PDF that matches this layout, so the office can print it and
  file it exactly as they do today. Reuse `components/pdf/DispatchTicketPDF.tsx`
  as the pattern.
- Still to confirm with the founder: **SUBCONTRACT** and **JOB NAME** — neither
  maps to an existing field and guessing them would put the wrong thing on a bill.

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
