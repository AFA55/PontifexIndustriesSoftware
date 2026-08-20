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
