# Founder brief — Aug 19 2026

Everything the founder raised on Aug 19, captured verbatim-in-substance so the
context survives a fresh session. Ordered by what it costs to leave broken.

**Answers he gave, now settled:**
- The two "Andres Altamirano" names are **one person** — his personal email and his
  company email, so he can be logged in on two phones. He says he *should* use one
  account. Treat as one for filtering; the real fix is consolidating the accounts.
- **Night-shift lunch is the same** — 30 minutes after 5 hours, as in the day.
- **Role changes**: an admin can *request* changes; he wants to be able to change
  operator and helper roles (e.g. Jose from apprentice → operator).

---

## 1. The in-route press is the job boundary (P0 — corrupts payroll and invoices)

**This is the same defect class as the 0.09 h closeout phantom, and it is live.**

Aug 19, verified against production:

```
Conrade Richardson   clocked 07:03 → 17:38   10.09 h   ONE card, tagged NC&E
Axel valverde        clocked 07:09 → 16:42    9.06 h   ONE card, tagged NC&E

JOB-2026-262301  NC&E       in route 07:52  started 10:12  completed 10:17   ticket: 0.08 h
JOB-2026-654657  Sterling   in route 14:05  started 16:10  completed 16:13   ticket: 0.04 h
```

The 0.04 is the *daily log being open for 1 minute 45 seconds* (16:11:15 →
16:13:00). It is paperwork duration masquerading as labour — exactly the Dante
0.09 h bug, on a different surface.

**The rule the founder wants, in his words:** *"the second that they press en
route, the time card should know they are now on the clock for this job… from
the moment they clicked en route to when they clock out is when they were at the
other job."*

Applied to that day:

| Job | From | To | Hours |
|---|---|---|---|
| NC&E | clock-in 07:03 | Sterling's in-route 14:05 | 7.03 |
| Sterling | in-route 14:05 | clock-out 17:38 | 3.55 |

Axel was on **both** jobs too and must be split the same way — the founder is
explicit that showing him at 0.04 on one and x hours on the other, when he was
there eight-plus hours, "doesn't make sense."

**Requirements**
- A day's hours split at each subsequent job's `route_started_at`.
- The last job runs to clock-out.
- Helpers split identically, from their own card.
- Never derive a job's hours from a daily log's open duration. That is the whole
  bug, twice now.
- Pressing In Route already notifies the customer; it should also be recognised
  internally as "this person is now on this job".

**Depends on:** the clock-cycle billing model (`BILLABLE_HOURS_AND_SHOP_TICKETS.md`).
This is that model's first concrete case. Build once.

---

## 2. Printed timesheets don't say which jobs (P1 — payroll ran without it)

Amanda printed timesheets for payroll. They show start time, end time, total —
**not which jobs the person was on.**

- One job that day → name that job.
- Two or three → name **all** of them: contractor name, job name, and job ID
  (the founder asked for IDs explicitly, to identify a job faster).

Directly downstream of item 1: once a day is split at in-route, the timesheet can
name each job with its own hours.

---

## 3. Personal calendar and reminders (P1 — new feature, high value)

> *"I have a project starting until November. Instead of making a ticket, I'd
> like to view my own personal calendar where I could remind myself at a closer
> date to create the job ticket… put notes in there, put some files."*

**Everyone gets one** — PMs, admin, all roles. Not the job board.

- Create a reminder for a future date: title, notes, attachments (files and photos).
- It reminds them **in the app**.
- Simple and adaptable — the founder's words: *"pretty sort of easy to understand,
  ease of use."*
- Use cases he named: a job starting in November, a walk-through visit, reaching
  out to a customer nearer the date.

**Design notes**
- Personal, not shared. Each person sees their own.
- Must not clutter the schedule board — it exists *because* the board is for
  dispatched work and these are not tickets yet.
- Tenant-scoped, RLS via the SECURITY DEFINER helpers.
- A reminder that fires when nobody is looking is worthless — reuse the existing
  notification dispatcher (`sendNotification`), and respect the 3-day auto-clear
  work when it lands, or these become more unread noise.

---

## 4. Time off on the schedule (P1)

A ticket type for **requested off / vacation / called off**, with:
- whether **PTO** was used
- the **dates** requested
- **notes**: why, and when they are back
- visible **on the schedule board**, so the office does not overbook
- printed on the **weekly timesheet card**, so payroll sees who was off and why

The founder's reason: *"later on we're going to be using the schedule board to
see jobs, see how far we are on jobs, and manage our jobs through the schedule
board. I would like to be able to see when someone requests time off so we don't
overbook."*

**Note:** a time-off system already exists (`/dashboard/request-time-off`,
`/api/admin/time-off`). Check what it does before building — this may be surfacing
existing data on the board and the timesheet rather than a new system.

---

## 5. Unassign a job without killing it (P1)

> *"Jobs may get unassigned but are still active right now, since not everyone's
> using the app… unassigning them shouldn't affect the user or anything. Some
> people don't have access to the app."*

The office needs to take a crew member off a job and reassign later, with the job
staying active and no side effects on the person. Today the platform conflates
"unassigned" with "not happening".

Related and already fixed: the live-job guard (Aug 18) now asks before stripping
a crew from an in-route job. That guard must not block this legitimate workflow —
it should ask, not refuse.

---

## 6. Two different completed-ticket designs (P2)

The founder found the same completed job renders differently depending on the
route in:

- **From the schedule board** → *"much more information and much more data"*, and
  he prefers it.
- **From Completed Jobs** → different design, and it is **missing Print Work
  Order** (it has Print Ticket only). He needs both on a completed job.
- The **sign-off PDFs were not visible** on one of them.

Seen on Nate's Sterling job. This is the same "two surfaces, one job" drift that
produced the two printed-ticket designs — consolidate onto the better one.

---

## 7. Change a person's role (P2 — already filed in BACKLOG.md)

Jose Mendoza is `apprentice` (shown as "Team Member") and should be `operator`.
No way to change it. Founder wants to change operator and helper roles, with a
request/approval path. See the BACKLOG entry for the audit and history questions.

---

## 8. Consolidate the founder's two accounts (P3)

`andres@patriotconcretecutting.com` and `andres.altamirano1280@gmail.com` are the
same person on two phones. He says he should use one. Until then, `salesman_name`
carries both spellings and the Completed Jobs project-manager filter shows them
separately — filtering one name returns 1 of his 4 jobs.

Also demo residue: **"Super Admin (Demo)"** appears in that filter, as
`salesman_name` on `QA-2026-122769` and `QA-2026-718910`. Two data rows, not code.

---

## Standing warning

`JOB-2026-424813` is 28 person-days over 15 dates and runs to **2026-10-02**. At
its observed rate it crosses 3 printed pages around **Sept 6** and reaches roughly
5 by October. Day and week modes exist for slicing it; no action needed yet.

---

## 1b. The DSM workflow — confirm the start time, don't infer it (founder, Aug 19)

> *"How DSM had it — we can edit job start time and completion time, or reset the
> ticket. DSM allowed you to edit your start time before completing the ticket,
> or if you already completed the ticket you had to reset the ticket and input
> the correct time, then complete it… Before completing a job it will just tell
> them to confirm the start time of the 2nd job. If more than 2 jobs, then after
> completing and starting the 3rd, confirm the start time. Start time of the 1st
> job obviously is clock-in, but for 2nd jobs it can ask for confirmation on
> start time, and end time is when they clock out."*

**This is better than the pure In Route rule shipped in `5ca940e9`, and it fixes
that rule's known gap.** The press-based split abstains on 17 of 22 multi-job
person-days because a job with no press cannot be ordered. Asking the crew to
confirm turns an abstention into an answer, at the one moment they still
remember.

**The synthesis to build — not a replacement, a confirmation step:**

1. **Job 1 starts at clock-in.** Not at its own press; the yard and the loading
   belong to it. Already implemented, unchanged.
2. **Job 2+ proposes the In Route press as its start time** and asks the operator
   to confirm or correct it when they complete that ticket. The press becomes a
   default, not an assertion.
3. **The last job ends at clock-out.** Unchanged.
4. **Editable before completing.** Start and end time correctable on the ticket
   itself, before submission.
5. **Reset after completing** — see the open question below.

**Why this is the right shape:** the platform currently infers a boundary and
marks it `¶` as inferred. A confirmed boundary is *recorded*, which is strictly
better — it removes the caveat from the invoice rather than explaining it.

### What already exists — do not rebuild

`POST /api/job-orders/[id]/reset-day` ships and is reachable from the operator's
Work Performed page. It clears one day's submitted work so it can be retyped.
Three deliberate refusals are written into it:

- **It never touches a COMPLETED job.** Once the customer has signed, the record
  is closed and corrections go through the office so they are attributable.
- It only clears the **caller's own** work — one operator cannot wipe another's.
- It does not touch photos, timecards or job status — only that day's work.

### THE OPEN QUESTION — needs the founder

DSM let an operator reset a **completed** ticket and re-enter the time. This
platform deliberately refuses that, because a completed ticket carries a customer
signature and a reset would let the record change after the customer accepted it.

Three options, and this is a decision about liability, not code:

- **(a) Keep the refusal.** An operator can fix anything before completing; after
  the signature it goes through the office, where it is attributable. Safest, and
  it is what the current code was built to protect.
- **(b) Allow the reset but preserve the signature trail** — record what the times
  were when the customer signed, and what they were changed to, by whom. The
  customer's acceptance stays intact as evidence.
- **(c) Allow it outright**, as DSM did.

**Recommendation: (b).** It gives the crew the DSM workflow without erasing what a
customer agreed to. (c) means a signed record can change with no trace, which is
the thing a signature exists to prevent.

### Also still true
Only the operator can press In Route — the helper cannot. So the press is a fact
about the JOB and every crew member's card divides at the same moment. A
confirmation step must therefore be asked of the operator and applied to the crew.

---

## 9. THE CREW WANTS TO GO BACK TO PAPER (Aug 20) — read this first

> *"Nate pointed out that he still feels it's annoying to do [a] digital ticket
> and wants to go back to paper… he has to submit pictures twice, make it so it
> only asks for pictures once. And I have to go through [a] workflow to see
> tickets later. We need to make this feel easier to them, not harder."*

**This outranks everything else in this file.** Every hour of attribution work,
every phantom-hour fix, every boundary rule assumes the crew keeps filing
tickets. An operator asking for paper back is the only failure that makes all of
it worthless. Treat it as the top signal, not a complaint.

### Confirmed defect: photos are demanded twice

```
work-performed/page.tsx:697   photos attached to the work entry   → POST /job-orders/[id]/photos
day-complete/page.tsx:424     completionPhotos                    → POST /job-orders/[id]/photos
day-complete/page.tsx:314,491 "Add at least one job photo — or mark
                               'Photos prohibited on this site' to skip."
```

Same endpoint, two prompts, and the **second one is mandatory** — it blocks
completion even when the operator uploaded photos minutes earlier on the same
job, the same day. He is not imagining it and he is not being lazy: the app
genuinely asks twice and does not remember the first answer.

**Fix direction:** day-complete should count photos already on the job for that
day and only ask when there are none. The requirement is defensible; asking a
second time for something already given is not.

### The wider point, unfixed and unmeasured

Nobody has counted how many taps, screens and required fields stand between a
crew member finishing a cut and having it recorded. Paper is one sheet and a
pen. The comparison the crew is making is real, and the platform currently loses
it on effort even where it wins on everything else.

Before adding another field to the operator flow, someone should walk it end to
end on a phone, in gloves, and count. Candidates already visible from the code:
- Photos asked twice (above).
- Work performed and day-complete are separate screens with overlapping asks.
- The founder: *"I have to go through [a] workflow to see tickets later"* — the
  office side has the same problem in reverse.

### Related, already known
- The founder's own instruction from Aug 2: *"operator field data = the STORY,
  not just quantities"* — pair the minimum numbers with a Quick Notes field and
  drop non-essential required fields. That instruction and this complaint are
  the same instruction.
- Task: crews barely file a second clock cycle (~1.00 cards per person-day), so
  the shop-ticket and split-shift work also depends on the flow being lighter.

---

## 10. Timecard vs ticket — the founder and Amanda settled the model (Aug 20)

> *"Me and Amanda have concluded that it will be easier when processing timecards
> to be able to see contractor name, job ID and project name when doing payroll,
> and work performed be separate. Their hours in [the] timecard are true, and
> then when we separate between jobs is more when we look at [the] ticket and
> work performed."*

**This settles the two-bases problem raised on Aug 19.** There is no conflict —
they are two documents answering two questions:

| | Timecard | Work ticket |
|---|---|---|
| Question | What do we PAY this person? | What do we BILL this customer? |
| Hours | The **true clocked day**, whole. Never divided. | **Divided** per job at each In Route press. |
| Jobs | **Listed** for reference — contractor, job ID, project name | Each job's own hours |
| Lunch | Deducted (payroll) | Included (billable) |

So the split shipped in `5ca940e9` stays exactly where it is — on the ticket —
and the timecard gains job *names* without gaining job *arithmetic*.

### The defect: the timecard shows no job at all

Verified — `app/api/admin/timecards/[id]/pdf/route.ts` and the operator report
path contain **no reference to `job_number`, `customer_name` or `project_name`**.
Amanda prints times and totals with nothing saying where anyone was. This is the
same complaint as item 2, now with the model to fix it properly.

**Build:** per day on the timecard, show contractor name, job number and project
name for every job that person was on. One job → name it. Several → name them
all. Hours stay whole and undivided.

### Keon's week — why his timecard was wrong, and it is not only display

Two AM King jobs at the **same address** (300 Garlington Rd):

```
QA-2026-533392   AM KING   project_name NULL          scheduled 8/17 only    completed
JOB-2026-898480  AM King   "GE - KAA pit infill"      scheduled 8/19 → 8/20  assigned
```

```
Mon 8/17   9.48 h   board: QA-533392            card untagged
Tue 8/18   8.00 h   board: NOTHING              card untagged   his log: QA-533392
Wed 8/19   9.28 h   board: 898480               card: 898480    his log: QA-533392  ← conflict
Thu 8/20   open     board: NOTHING              card: 898480
```

The founder's account is project 1 on Mon+Tue and project 2 on Wed+Thu. Three
data problems produce the wrong printout:

1. **Wednesday's log is filed against the OLD job.** QA-533392 was scheduled for
   8/17 only and never closed, so it stayed reachable on his phone and caught
   Tuesday's and Wednesday's filings. Same shape as Nate's clock-in on Aug 20 —
   a finished job lingering and catching later work. The clock-in resolver now
   refuses closed jobs; **the ticket-filing path has no equivalent guard.**
2. **Tuesday and Thursday have no board rows**, so only his own log and his card
   know where he was.
3. **QA-533392 has no `project_name`** — it is a quick-add. Two jobs for one
   customer at one address, and only one of them can be told apart by name.

**Do not repair Keon's rows without asking** — his Wednesday log is his own filed
work, and re-pointing it changes what an operator recorded.

**The build must therefore resolve a day's jobs from all the evidence** (board,
card tag, daily log, attribution) rather than any single source, and say when
they disagree instead of silently picking one. A timecard that quietly picks the
wrong job is worse than one that shows none, because Amanda would trust it.
