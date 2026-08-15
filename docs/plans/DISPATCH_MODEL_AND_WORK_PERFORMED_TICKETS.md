# The schedule board is a dispatching tool — and the Work Performed Tickets page

Written Aug 15 2026, from the founder's correction. Two things, in order of
consequence: a **model correction** that affects billing, and a **new page** that
replaces a paper staple.

---

# Part 1 — A duplicate is another CREW on one job, not another job

## What the founder actually said

> "There aren't 4 Parkk jobs for Logistics Drive. Some days I just duplicated
> it, but our system should know it's still the same job — just that extra
> operators worked that day. To collect the work performed by those operators it
> doesn't need to think that they are other jobs. Same job, just operators
> available that can work at that job as well. Or sometimes an operator finishes
> early and we can send them to help someone, so I'd duplicate the ticket to be
> able to assign them and dispatch them out.
>
> **The schedule board is a dispatching tool. We need to get that clear.**"

That last line is the design principle, and the current data model does not hold
it. The board *looks* like a planning grid, so duplicating a card was
implemented as "make another job". What the founder is doing is **staffing one
job with a second crew on a given day**.

## What that costs today — measured, not theorised

The Parkk job at 520 Logistics Dr is **one job**. In the database it is four
rows, and they are not even siblings — they form a *chain*, each duplicate
parented to the previous duplicate rather than to the root:

```
JOB-2026-424813   ROOT      Aug 3 → Oct 2   Zack + Javier      13 work items · 10 logs · 10 crew-days
└─ JOB-2026-402357          Aug 4 → Aug 11  (no job-level crew)  5 work items ·  5 logs ·  8 crew-days
   └─ JOB-2026-726915       Aug 6 → Aug 14  Devin + Keyshawn     1 work item  ·  2 logs ·  5 crew-days
      └─ JOB-2026-675188    Aug 14          Zack + Javier        0 work items ·  0 logs ·  1 crew-day
```

So for **one job**: 19 work items and 17 daily logs, scattered across four rows
with four job numbers, four spans and four end dates.

Consequences that are live right now:

1. **Billing is split four ways.** The invoice for this job can only ever see a
   quarter of the footage unless somebody knows to look for the other three.
2. **The printed ticket is split four ways.** Four sheets for one job.
3. **Active Jobs shows four cards** for one site — the founder reads that as
   four jobs, and so does anyone else.
4. **`parent_job_id` chains instead of pointing at the root.** The duplicate
   route intends `original.parent_job_id ?? original.id`, which should flatten
   every copy onto one root — this data does not, so anything that rolls up by
   root is already missing rows. Worth finding out whether the chain predates
   that line or the line is wrong.
5. **Extending the job means extending one row.** When the founder asked to add
   35 days to "the Parkk job", the right answer was ambiguous. It went on the
   root; the other three still carry their old dates.

## The correction

> One job = one `job_orders` row.
> Who works it, on which day, is `job_daily_assignments`.
> Duplicating a card on the board adds a CREW, never a job.

Most of the machinery for this already exists and is already trusted:

- `job_daily_assignments` is the per-day crew ledger, and after this week's
  fixes it already drives dispatch, day numbering and the printed ticket's
  hours. It holds one operator + one helper per row, per date, with a
  `day_sequence`.
- `job_crew` holds additional crew on a job.
- `work_items` and `daily_job_logs` are already keyed by `operator_id` **and**
  `work_date`, so two crews on one job on one day already store cleanly — the
  ticket already prints per person per day.

What is missing is only that the BOARD writes a new `job_orders` row instead of
another assignment row.

### Option A — a second crew row on the same job *(recommended)*

Duplicating a card writes another `job_daily_assignments` row for that job and
date, with the next `day_sequence`, and the board renders a second card that
carries the SAME job number.

- Nothing new to store. The ledger already supports it — that unique constraint
  on `(operator_id, assignment_date, day_sequence)` exists precisely so one
  person can hold several jobs in a day.
- Billing, the ticket and Active Jobs collapse to one job automatically, because
  there only ever was one.
- The board keeps working exactly as it does: it already resolves crew per day
  from this table.
- **Risk:** the board renders cards from `job_orders`, so it needs to render one
  card per crew-row rather than per job. That is the real work.

### Option B — keep the extra rows, merge on read

Leave duplicates as `job_orders` rows but roll them up by root everywhere:
billing, ticket, Active Jobs, progress.

- No board rewrite.
- **But** every reader must remember to roll up, forever — and this codebase has
  produced seven bugs in a week from exactly that shape: one place knowing a
  rule and another not. It also leaves the chained-parent bug to be fixed first,
  or roll-ups silently miss rows.
- Rejected as the destination. Acceptable only as a stop-gap.

### Migrating the four existing Parkk rows

Not a script to run unattended — this is billing data on a live job.

1. Move `job_daily_assignments`, `daily_job_logs`, `work_items`, `job_crew` and
   photos from the three children onto the root, preserving `work_date` and
   `operator_id` (both already correct on every row).
2. Check for collisions: two rows for the same (operator, date, day_sequence)
   need a new sequence, not an overwrite.
3. Soft-delete the child `job_orders` rows — do NOT hard-delete; they carry the
   dispatch history.
4. Back up first, and reconcile totals before and after: **19 work items and 17
   logs must still be 19 and 17.**

### Open questions for the founder

- When a second crew is dispatched to a job, should they get their own **printed
  ticket**? (Probably yes — each crew needs a sheet in hand — but it should say
  the same job number.)
- Does a second crew ever have a **different arrival time or scope**? If so the
  crew row needs its own arrival time, which `job_daily_assignments` does not
  currently carry.
- Should Active Jobs show one card with "2 crews", or one card per crew?

---

# Part 2 — The "Work Performed Tickets" page

## The outcome

> "A card/page that says Work Performed Tickets, where we can access and print
> the work performed tickets for all jobs for certain days — e.g. Monday through
> Friday, or specific days. The goal is to make it easier to print work
> performed tickets instead of having to go to Active Jobs, then Completed Jobs,
> and complete it from there."

Today, printing a week of tickets means: open Active Jobs → find a job → open it
→ print → go back → repeat → then do the same again in Completed Jobs, because a
job that finished mid-week has moved. The office does that job by job.

This page inverts it: **pick a date range, see everything, print what you tick.**

## Wireframe

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Work Performed Tickets                                    [ Print (6) ]   │
│  Every ticket for the days you choose — no hunting through job lists.      │
├────────────────────────────────────────────────────────────────────────────┤
│  [ Today ] [ This week ] [ Last week ]   From [Aug 10] To [Aug 14]         │
│  Group by:  ( Person )  ( Job )        Show: [x] Completed [x] In progress │
├────────────────────────────────────────────────────────────────────────────┤
│ [x] ▸ Dante Burgess                        3 tickets · 28.4 hrs            │
│      ┌──────────────────────────────────────────────────────────────────┐  │
│      │ [x] Mon Aug 10  AM King · JOB-2026-914932        9.4 h   ✓ signed│  │
│      │        WALL SAW 132 LF @ 6"  ·  CORE DRILL 7 holes               │  │
│      │ [x] Tue Aug 11  AM King · JOB-2026-914932       10.2 h   — open  │  │
│      │        no ticket submitted                          ⚠ chase      │  │
│      │ [x] Wed Aug 12  Southern Basements · JOB-…       0.1 h   ✓ signed│  │
│      └──────────────────────────────────────────────────────────────────┘  │
│ [ ] ▸ Zack                                 4 tickets · 39.1 hrs            │
│ [x] ▸ Keontre Mcknight                     2 tickets · 19.8 hrs            │
├────────────────────────────────────────────────────────────────────────────┤
│  6 of 9 selected · 3 people · Aug 10–14        [ Print selected ]          │
└────────────────────────────────────────────────────────────────────────────┘
```

Printed output — **one sheet per person per period**, which is what gets stapled
to a timecard and walked to payroll:

```
┌──────────────────────────────────────────────────────────────┐
│ PATRIOT CONCRETE CUTTING          WORK PERFORMED             │
│                                   Aug 10 – Aug 14, 2026      │
│ Dante Burgess · Operator                                     │
├──────────────────────────────────────────────────────────────┤
│ MON AUG 10   AM King · JOB-2026-914932                       │
│              07:02 – 17:45   lunch 30   9.40 hrs             │
│              WALL SAW  132 LF @ 6"                           │
│              CORE DRILL  7 holes, 4" bit, 10" deep           │
│              ______________________________________________  │
│ TUE AUG 11   AM King · JOB-2026-914932                       │
│              06:59 – 17:51   lunch 30  10.20 hrs             │
│              ______________________________________________  │
│                                          (blank = no ticket) │
├──────────────────────────────────────────────────────────────┤
│ TOTAL  28.40 hrs · 3 days · 2 jobs                           │
│ Reviewed by ________________________  Date ________________  │
└──────────────────────────────────────────────────────────────┘
```

## The two rules that INVERT on this sheet

Both would be introduced silently by copy-pasting `buildTicketDays`, and both
matter:

1. **Shop time must be INCLUDED here.** `isShopCard` is skipped on the job
   ticket because shop hours are not job labour and must not reach a customer.
   But this sheet is payroll's, and it is paid time. A sheet that silently drops
   eight hours is worse than no sheet.
2. **`quantitiesFrom: 'lead'` must NOT apply.** On the job ticket that stops a
   helper's footage double-counting the lead's. On a PERSON sheet it would print
   every helper an empty page — the point here is what *this person* did.

## What is allowed here that is forbidden on the customer's sheet

This is an INTERNAL document, so it may carry: operator Quick Notes, shop hours,
lateness, the "no ticket submitted" gap, and the internal day note. None of those
may ever reach `/sign/[token]` or the completion PDF. The boundary is enforced by
`stripInternalNotes` / `toCompletionPdfWorkItems`, and this page sits on the
inside of it.

## Reuse vs new

| Piece | Status |
|---|---|
| Hours attribution | **reuse** `lib/job-clock-attribution.ts` — already the one rule both the ticket and Daily Progress use |
| Measurement text | **reuse** `lib/work-items-format.ts` — never format measurements at a call site |
| Day/crew grouping | **adapt** `buildTicketDays` — it is job-centred; this is the person-centred transpose |
| Print CSS | **reuse** the existing ticket page's |
| Person-centred query | **new** |
| The page + selection UI | **new** |

## Build order — each piece ships on its own

1. **The read.** One `requireAdmin` route: date range in, `people → days → jobs →
   hours → work lines` out. Shop days labelled and counted from version one.
2. **The list page.** Grouped by person, expandable, checkboxes, From/To plus
   Today / This week / Last week.
3. **The printed sheet.** One page per person via `break-after: page`.
4. **The card** on the admin dashboard.
5. *(later)* Group-by-job as an alternative view.
6. *(later)* The Friday reminder — "print this week's tickets?" — which the
   founder explicitly deferred: *"eventually set reminders and ask admin if they
   want to print, but that's later on."*

## Smallest useful first slice

Steps 1–3 with **no** grouping toggle, **no** dashboard card and **no**
reminders: a date range, a checkbox list by person, and a Print button that
produces one sheet each. That alone removes the Active-Jobs-then-Completed-Jobs
hunt, which is the whole complaint.

---

## Related

- `docs/plans/OFFICE_PAPERWORK_AND_SITE_CONDITIONS.md` — the fuller version of
  this feature plus job-site conditions on day one
- `docs/plans/SYSTEM_MAP.md` — every screen and its weak joins
- `BACKLOG.md` — priorities
