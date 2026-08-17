# Billable hours by clock cycle, and Shop Tickets

**Status:** planned, not built. Written Aug 17 2026 from the founder's own words.
**Supersedes:** the on-site window clip shipped in `9b5bcaa0` (see "What ships today").

---

## The rule

> "From when they clock in until they clock out — if they are assigned to 1 job
> the entire day, that is their time."
>
> "When someone is at the shop, create and assign a **shop ticket** to them. Once
> they start the shop ticket, that would be like starting a 2nd job. That is what
> I did when I used to work at B&D."
>
> "The time ends when the 2nd job would start, so the 1st job gets billed all the
> way until they start the 2nd job."
>
> "For 2nd jobs, allow them to edit the start time in case they forgot. If they
> are doing it the day after, they can input what time they started the 2nd job —
> and **don't send in-route notifications to clients**, because it was already the
> next day and they aren't there any more."

| # | Rule |
|---|---|
| R1 | A job's billable hours run **clock-in → clock-out**, not the on-site window. |
| R2 | One person, one job, whole day ⇒ **the entire paid card** belongs to that job. |
| R3 | **A shop ticket is a job.** Assigned like one, started like one, billed like one. |
| R4 | The boundary between two jobs is **the moment job 2 is started** — not job 1's completion or signature. Job 1 bills right up to it. |
| R5 | A start time must be **editable by the person who owns it**, including the next day. |
| R6 | A backdated or corrected start **never notifies the customer**. |

**Why R3 is the good idea:** it makes shop time a first-class assignable thing
rather than a special case in the hours maths, and it needs no change to how the
crew clocks. The earlier draft of this plan assumed shop time would be separated
by a second clock cycle (out of the job, back in for shop). The data killed that:
298 timecards across 297 person-days — **one card per day**, with the single
exception being a night shift. Crews do not clock out and back in, and a feature
built on the assumption that they do would have been permanently empty.

**Why R4 beats the previous proposal:** the earlier draft split the day at job 1's
*completion signature*. The founder's boundary is the **start of job 2**, which is
better on both counts — it is an event the crew already creates by tapping, and it
does not strand the gap between "job 1 finished" and "job 2 started" in no job at
all.

---

## What ships today, and why it disagrees

Commit `9b5bcaa0` clips a card to the job's **on-site window**
(`work_started_at ?? route_started_at` → completion), because attributed cards
were escaping a clip that linked cards still got — the weaker evidence was getting
the more generous bound, and `JOB-2026-343888` was about to bill 18.27 crew-hours
against a 4.87-hour logged day.

Under R1/R2 that job is **18.27h**, not the 9.74h now shown. The asymmetry that
fix addressed was real; the *bound it chose* was on-site time, which the founder
has now overruled.

**The panel already shows both** — `9.74h on job · 18.27h paid` — so nothing on
screen is lying. But the headline is the conservative figure. Until Phase 1 lands,
**read the "paid" number when invoicing a single-job day.**

---

## What already exists (verified Aug 17 2026)

Half of R5/R6 is built, from the founder's own Aug 11 instruction.

- **Day-after en-route suppression is live.** `app/api/job-orders/[id]/status/route.ts:630-692`
  suppresses the "crew is on the way" text when the tap lands on a day after the
  job's start date, or when a day has already been closed out. It deliberately
  does **not** suppress an early tap (2 of 22 jobs went In Route before their
  scheduled date, each a genuine first start) and deliberately does not count a
  draft daily-log row. Completion and waiver notices are never gated.
- **Timestamp editing exists and is already silent.** `app/api/admin/jobs/[id]/timestamps/route.ts`
  edits `in_route_at`, `arrived_at_jobsite_at`, `work_started_at`,
  `work_completed_at` with **no customer notification anywhere in the path**.
- **Start is a real recorded event.** `route_started_at` on 23 of 48 jobs,
  `work_started_at` on 22, both on 22, and **zero** jobs with work-start but no
  route-start — so the crew does tap through the sequence.

**The actual gap in R5:** that edit route is `requireAdmin`. An operator cannot
correct their own forgotten start time, which is precisely the case described.

---

## Proposed sequence

**Phase 1 — hours rule.** No new UI, no new crew behaviour.
Replace the on-site clip with the clock-cycle rule: single-job day ⇒ whole paid
card; multi-job day ⇒ split at **the start of the next job** (`route_started_at`,
falling back to `work_started_at`). Shop tickets, once they exist, participate as
just another job. Re-verify all 14 completed jobs and publish before/after; expect
most figures to rise toward the "paid" column. Keep the `on job · paid` pairing —
under R1 they now agree on single-job days, so a disagreement becomes signal.

**Phase 2 — shop tickets.** A shop ticket is an assignable, startable record:
who, date, what they did, time. `tenant_id` + tenant-scoped RLS via the SECURITY
DEFINER helpers (`current_user_tenant_id()`), never `user_metadata`; additive
idempotent migration via Supabase MCP. A **Shop Tickets tab** lists who worked at
the shop, what they did, and how long. Decide early whether this is a new table or
a flavour of `job_orders` — reusing the job machinery is what makes R3 cheap, but
a shop ticket has no customer, no address, no waiver and must never appear on the
schedule board as a customer job or trigger a customer notification.

**Phase 3 — operator-editable start time.** Extend the existing timestamps route
below admin: an operator may correct the start on a job assigned to them,
rank-guarded, audit-logged, and still silent to the customer. R6 is already
satisfied by that route sending nothing — the requirement is to *keep* it that
way when the caller becomes an operator, and to add a regression test that pins
it, since "an edit must not notify" is invisible until it breaks.

---

## Answered by the founder, Aug 17 2026

**Lunch — and this splits one number into two.**
> "lunch is deducted for employees and still considered billable hours"

The customer is billed for the span; the employee is not paid for the lunch
inside it. So **billable hours ≠ paid hours**, deliberately:

| | Rule | Source |
|---|---|---|
| **Billable** (customer) | clock-in → clock-out, lunch **included** | gross span |
| **Paid** (employee) | lunch **deducted** | `min(net_hours, total_hours)` |

Every surface currently shows the deducted figure, because until now there was
only one number. Phase 1 must carry both and label which is which — a screen
that shows one and calls it "hours" will either under-bill the customer or
over-pay the crew, and the founder types these into invoices by hand.

Note this cuts against the conservative instinct: for BILLING, the gross span is
the correct figure and the current screens understate it.

**Yard time before the first job — job 1.**
> "that's correct for Dante, it's still part of 1st job because he was loading up
> for that job"

Dante's 06:59 clock-in against a 07:53 en-route is 54 minutes of loading for that
job, and it bills to it. Confirms R1/R2: the on-site window is not the boundary.

**Drive time — job 1.**
> "the drivetime does go into the 1st one as well"

Consistent with R4: job 1 runs until job 2 is *started*, so the drive between
them belongs to the job just left.

**Shop tickets DO belong on the schedule board.** This reverses a caution in the
previous draft of this plan, which said a shop ticket must never surface there.
> "it can have address as the shop and it can still surface on the schedule
> because we can see who is assigned to the schedule — it will just be a
> different type of ticket. If we need to, let's just put Patriot as customer, to
> not complicate the workflow. Shop will be put on schedule because we also go
> back and look at the physical schedule to see where people were, and now we
> will start using the schedule board to see where people were — we can see it
> clearly in the schedule board, that would be the goal"

So: address = the shop, customer = the tenant itself (Patriot), visible on the
board, distinguished by **ticket type** rather than by being hidden. The board is
replacing the paper schedule as the record of where everyone was, and a shop day
that vanishes from it defeats that.

What must still be true: a shop ticket has no external customer, so it must not
send customer notifications, must not require a waiver or signature, and must not
appear in customer-facing surfaces (the portal, invoices as a billable job).
Distinguish by type at those boundaries — not by suppressing it from the board.

## Still open

1. **Does a shop ticket's time reach payroll**, or is the timecard still the
   payroll record and the shop ticket only the description of what was done?
2. **Does shop time bill to anything?** It has an internal customer (Patriot), so
   presumably it is cost without revenue — confirm it should be excluded from
   job P&L revenue while still counting as labour cost somewhere.

---

## Related

- `docs/plans/CHANGE_ORDERS.md` — parked, same "get the ball rolling" status.
- Crew `hourly_rate` is unset on 12 of 14 active staff, so labor **cost** reads
  $0 however correct the hours become.
