# Night shift, split shifts, and closing a job days later

Written Aug 18 2026 from the founder's brief. Planned, not built.
Everything measured against production before it was written down.

---

## Part 1 — Closing a job a day or two later is NORMAL

> "Sometimes our team will complete a job the next day or day after, and we have
> to make sure that doesn't interfere with schedule, or see if they were at
> multiple jobs."

This is the rule behind a live defect. The founder found Dante billed **0.09 h**
on a Wednesday he spent entirely at AM King. The cause:

```
daily_job_logs on JOB-2026-277097 (Southern Basements, booked 8/10–8/11)
  log_date         2026-08-12        ← Wednesday
  day_number       3                 ← on a two-day job
  hours_worked     0.09
  created          07:00:22
  day_completed_at 07:05:29          = 5.1 minutes
  notes            "Job complete. Remote signature link sent to 678-897-0900."
```

Dante closed out Monday and Tuesday's job from his truck on Wednesday morning
before driving to AM King. The work ticket treated those five minutes of
paperwork as five minutes of *labour on that job*, on a day he was elsewhere.

**The rule that follows:** a closeout filed later is paperwork, not work. It must
never create a working day, never contribute hours, and never put a crew member
on a job the office did not place them on — but the **measurements** filed with
it are real and must survive.

The fix in flight does exactly that: the work folds onto the person's last real
day on that job and is labelled *"Measurements filed at closeout on Wed 8/12"*.
It deliberately does NOT delete the day, because all three of that job's
`work_items` carry `work_date = 2026-08-12` and that closeout is the job's only
daily log — deleting it would blank the entire scope the office invoices from.

**Blast radius, measured:** 4 phantom entries across 4 tickets, 3.31 hours.
`JOB-2026-631148` carries **3.22 h** for Conrade on a completed job.

**Still open:** the ticket should make it obvious when a person was at more than
one job on a day, rather than leaving the office to infer it.

---

## Part 2 — Split shifts and overnight work

> "Sometimes an operator might clock in morning, clock out, then work again in
> afternoon / night shift and not clock out again till the morning. We need to be
> able to see where they were even if it was night and half time in day and other
> half in other. Our platform should know to combine hours, and those hours belong
> to one day, and it's all night shift premium until they clock out from night
> shift."

### What exists today

| | |
|---|---|
| `timecard_settings_v2.night_shift_multiplier` | **1.25** |
| `timecards.is_night_shift` | a boolean, set on **3** cards ever |
| `timecards.night_shift_premium_hours` | a column — **0 cards have ever carried a value** |

So the premium is configured, flagged, and **never calculated**. Nobody has been
paid it. Whatever is built here is the first real implementation, not a repair.

### What "crosses midnight" means in the data today — and it is not night shift

10 cards have a clock-out on a different local date from their clock-in. Every
one ends at **exactly `00:00:00`** — they are forgotten clock-outs closed at
midnight, not overnight work:

```
David   7/09  06:44 → 7/10 00:00   16.77 h
David   7/01  08:01 → 7/02 00:00   15.48 h
David   6/19  07:04 → 6/20 00:00   16.42 h
Javi    6/16  08:26 → 6/17 00:00   15.06 h
Aiden   5/20  06:53 → 5/24 00:00   88.61 h   ← four days
```

**An 88-hour card went through payroll.** Before night shift can be built, a real
overnight and a forgotten clock-out must be distinguishable — otherwise the
feature legitimises the artefact. Note `auto_clockout_time` is now 19:00, so this
class should be shrinking, but the historical rows remain.

### The rule to implement

1. **A shift belongs to the day it STARTED.** An operator clocking in at 21:00
   Tuesday and out at 06:00 Wednesday worked *Tuesday*. Hours, cost and the job
   attribution all land on Tuesday.
2. **Multiple cycles in a day combine.** Morning card plus night card is one
   day's hours for that person. Overtime is computed on the combined day, not per
   card — otherwise two 6-hour cycles never trigger overtime that a single
   12-hour shift would.
3. **The premium runs for the whole night-shift cycle**, start to clock-out — not
   only the hours that happen to fall after midnight. The founder is explicit:
   *"it's all night shift premium until they clock out from night shift."*
4. **Where they were must remain visible per cycle.** The founder wants to see a
   person at two jobs in a day; combining hours must not collapse the job
   attribution behind a single number.

### Answered by the founder, Aug 18 2026

**1. Declared by the operator, approved by an admin — and only asked after 11:00.**

> "It can ask an operator and admin must approve, but only ask after 11am clock-in
> so it's not asking people that clock in between 7-11am."

Two-step, so nobody awards themselves a premium: the operator declares it at
clock-in, an admin confirms it. The 11:00 gate keeps the question away from the
normal 7-to-11 start and means the crew only sees it when it might plausibly be
true. Design consequences:

- A declared-but-unapproved cycle must be **visible and pending**, never silently
  paid or silently dropped. It needs a place an admin actually looks.
- A day job that runs unexpectedly into the night starts before 11:00, so it is
  never asked. The office must be able to mark a cycle night AFTER the fact.
- The 11:00 threshold is tenant configuration, not a constant.

**2. Rate multiplier.** 10 night hours at $26 → 10 × 26 × 1.25 = $325. The column
`night_shift_premium_hours` is therefore misleading and should either be repurposed
to hold the premium *amount* or left unused with the multiplier applied at cost
time. Do not let the name drive the maths.

**3. Higher one wins — they do NOT stack.**

> "Higher one wins."

Overtime is 1.5×, night is 1.25×, so **1.5 always beats 1.25**. Applied per hour:
the first 8 hours of a night shift earn 1.25×, and every hour past 8 earns 1.5×
and no night premium. **Consequence worth stating plainly: the night premium can
never apply to an overtime hour.** A 12-hour night is 8 × 1.25 + 4 × 1.5, not
12 × 1.25 and not 12 × 1.875. Confirm this per-hour reading before building —
the alternative (whole-shift, one multiplier chosen once) pays differently.

**4. The customer already pays for it — in the quote, not as a line item.**

> "That's on [the] estimating side. Software right now doesn't mention or deal
> with this, but yes we bill different to clients, but we know night work
> beforehand."

So: **cost side yes, revenue side no.** The premium raises labour cost in job
P&L; it must NOT be added to revenue, because the quoted price already carries
it. Adding it both places would double-count the margin.

But it exposes a gap: **the estimate has no concept of night work.** The office
knows beforehand and prices for it, and the software never records that. Worth
capturing on the job at quote time so that (a) the ticket tells the crew it is a
night job, (b) the premium is expected rather than a surprise at payroll, and
(c) the estimate itself carries the reason its price is higher. That is a
separate, smaller piece of work than the payroll maths.

### Still open

5. **Lunch on a night shift** — same 30 minutes after 5 hours, or different?

### What has to be true first

- **Separate a real overnight from an auto-close.** Any card ending exactly at
  `00:00:00` or at the tenant's `auto_clockout_time` should be recognisable as
  machine-closed, not worked. Consider a distinct marker rather than inferring.
- **The crew must actually clock in twice.** Today's data has ~1.00 cards per
  person-day; the split-shift pattern barely exists in the record because the app
  does not make a second cycle natural. Building the maths without the capture
  produces a feature with no data in it.
- **Pay rates.** 13 of 15 crew have no `hourly_rate`, so any premium computes to
  $0 regardless.

---

## Related

- `docs/plans/BILLABLE_HOURS_AND_SHOP_TICKETS.md` — the clock-cycle billing model;
  night shift is the same clock-cycle question seen from the payroll side, and the
  two must be designed together rather than twice.
- Task #10 — `lib/work-ticket.ts` sums with `net_hours ?? total_hours`, which
  overstates by up to 0.5 h on four production rows.
- Task #12 — crew pay rates.
