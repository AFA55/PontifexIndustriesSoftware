/**
 * lib/job-day-boundary.ts — THE IN-ROUTE PRESS IS THE JOB BOUNDARY.
 *
 * Founder, Aug 19 2026, on a day that put two wrong numbers on two invoices:
 *
 *   "The second that they press en route, the time card should know they are
 *    now on the clock for this job… from the moment they clicked en route to
 *    when they clock out is when they were at the other job."
 *
 * WHAT WAS BROKEN. Conrade clocked 07:03→17:38 (10.09 h) and Axel 07:09→16:42
 * (9.06 h), each on ONE card tagged NC&E. They ran NC&E in the morning and
 * Sterling in the afternoon. The sheet printed Sterling at **0.04 h** — which is
 * not labour at all, it is how long the daily-log row was open (created 16:11:15,
 * closed 16:13:00). That is the same defect as Dante's 0.09 h phantom fixed on
 * Aug 18: a log's duration standing in for a day's work. What the sheet should
 * say is NC&E 07:03→14:05 and Sterling 14:05→17:38.
 *
 * THE RULE, as implemented here:
 *
 *   1. A person's clocked day is divided between the jobs they were on that day.
 *   2. The FIRST job runs from their CLOCK-IN — not from its own in-route press.
 *      The loading and the drive out belong to the job being loaded for (founder,
 *      Aug 17: "it's still part of 1st job because he was loading up for that job").
 *   3. Every LATER job runs from ITS OWN in-route press.
 *   4. The LAST job runs to CLOCK-OUT.
 *   5. Jobs are ordered by that press — never by job number, creation order, or
 *      completion. A job's completion does NOT end its window: job 1 bills right
 *      up to the moment job 2 is started (BILLABLE_HOURS_AND_SHOP_TICKETS.md R4).
 *      NC&E completed at 10:17 and still runs to 14:05.
 *
 * This is the first concrete implementation of the clock-cycle model in
 * `docs/plans/BILLABLE_HOURS_AND_SHOP_TICKETS.md` (R1–R4). A shop ticket, when
 * it exists, participates as just another job with a start — nothing here needs
 * to know it is one.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TWO GUARDS THAT ARE THE WHOLE DIFFERENCE BETWEEN THIS AND A NEW PHANTOM
 *
 * (a) A BOUNDARY MUST FALL ON THE DAY IT DIVIDES. `daily_job_logs` carries
 *     `route_started_at`, and on **22 of the 54** production rows that have one
 *     it is a COPY of an earlier day's press (re-counted Aug 20 2026; it was
 *     13 of 53 when this guard shipped — the ratio is getting WORSE, which is
 *     the write-side fix in `daily-log/route.ts` earning its keep):
 *     JOB-2026-277097's 8/12 closeout row carries 8/10 07:43. Dante was at another job that Wednesday and only typed
 *     that job's paperwork from the truck — believing its stamp would have handed
 *     him a 10.37-hour phantom, one order of magnitude worse than the 0.09 it
 *     replaced. So a candidate timestamp counts only when its TENANT-LOCAL
 *     calendar date equals the date being split.
 *
 * (b) EVERY JOB ON THE DAY MUST HAVE A BOUNDARY, OR NOTHING SPLITS. A job with
 *     no in-route press on that date cannot claim a boundary — and, just as
 *     importantly, cannot be ORDERED against the ones that do. Assigning it the
 *     leftover slice would be inventing hours; assigning the leftover to a
 *     pressed job would be stealing them. Neither is knowable, so the day is
 *     left exactly as the attribution rules already had it and the office sees
 *     the same answer as before. Re-counted Aug 20 2026: production holds 23
 *     multi-job person-days (24 cards — one person re-clocked). Guard (b) alone
 *     RESOLVES 5 of them and ABSTAINS on the other 18; rules 6 and 7 below add
 *     two more, for 7. The count was 22/5/17 when guard (b) shipped and the
 *     data has grown since — the numbers in this file are measurements with
 *     dates on them, not constants.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * THE CLOSE FALLBACK — WHERE A PRESS CANNOT BE TRUSTED, A CLOSE MARKS WHERE
 * THE DAY MOVED ON (founder, Aug 20 2026)
 *
 * Guard (b) above abstains whenever ANY job on the day lacks a usable same-day
 * press. That is right when the day carries no other evidence, and wrong when it
 * does. Keon Mcknight, Tue Aug 11 2026, with Axel Valverde helping:
 *
 *   QA-2026-140542  Industrial Safety Coatings   press 11:31Z  CLOSED 15:04:36Z
 *   JOB-2026-400368 Leifeng Construction         press 08/10 (STALE) — day 2
 *
 * Leifeng's press is a prior-day copy, so guard (a) rejects it, guard (b) fires,
 * and the whole day goes to one job: Leifeng billed 9.12 h — Keon's and Axel's
 * entire morning at ISC — while ISC printed 0.06 h, the length of its own log
 * session. The founder: "it should still mark his time on Industrial Safety
 * Coatings as first job and then the moment he clicked In Route for the other
 * job, stop his time for the first job."
 *
 * The In Route press he remembers was never recorded for Leifeng that day (see
 * the write-path note below). But ISC's CLOSE was. So:
 *
 *   6. When a later job has NO usable same-day press, its segment begins at the
 *      PRECEDING job's own same-day close. ISC closed 15:04:36Z, so ISC runs
 *      clock-in → 15:04:36Z and Leifeng runs 15:04:36Z → clock-out.
 *
 * A CLOSE IS EVIDENCE OF A BOUNDARY, NOT OF AN ORDERING. Read that twice before
 * changing anything here, because the distinction is the whole safety of the
 * rule. Rule 5 stands exactly as written: a completion does NOT end its own
 * job's segment, and NC&E still runs past its 10:17 sign-off to 14:05. What rule
 * 6 adds is narrower — a close of the job BEFORE this one, used only as the
 * moment this one began, and only when this one has no press of its own.
 *
 * The reason the distinction matters is that a close is an END and a press is a
 * START, and sorting the two against each other invents days that never
 * happened. Conrade's Aug 5 stamps are the clearest example: QA Harper pressed
 * 11:44 and closed 14:26, Harper General carried no same-day press and closed
 * 14:27. Ordering by "press, else close" puts Harper General second and hands it
 * the 70 seconds between the two closes, giving QA Harper a morning the two jobs
 * plainly shared. Harper General's close proves only that it was running BEFORE
 * 14:27 — never that it started after 11:44.
 *
 * (Harper General never actually reaches this function on that day — the
 * authority ladder in `lib/timecard-job-rules.ts` drops it as a conflict, so
 * Conrade's Aug 5 resolves on two fully-pressed jobs. The stamps are quoted
 * because the SHAPE is what the rule has to survive, not because that day is at
 * risk. See "WHAT STILL ABSTAINS" below, where this header used to get it wrong.)
 *
 * So order comes from starts, and never from closes:
 *
 *   7. ORDER. If every job on the day has a same-day press, the presses order
 *      them — rule 5, untouched, and every day that resolves today still
 *      resolves the same way. Otherwise the ORDER is the office's own: the
 *      board's `day_sequence`, which must be present and DISTINCT on every job
 *      of the day. A day with neither a full set of presses nor a full set of
 *      distinct sequences cannot be ordered, and abstains. Keon's Aug 11 orders
 *      by the board — ISC is its #1 and Leifeng its #3.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * GUARD (c): THE BOARD IS AN ORDER, NOT A FACT — AND A JOB MUST CARRY ONE OF
 * ITS OWN BEFORE IT MAY TAKE A BILLABLE STRETCH OF SOMEBODY'S DAY
 *
 * Rule 7 lets the office's `day_sequence` order a day the presses cannot. That
 * is a statement about SEQUENCE and nothing else. A board row is typed days
 * ahead by someone who was not there, and it is no evidence at all that the
 * crew went. Rule 6's own contradiction guards constrain only the job BEFORE a
 * boundary — nothing in rules 6 or 7, as first written, required the UNPRESSED
 * job to have any same-day fact whatsoever:
 *
 *   card 11:00→21:00 · job A pressed 12:35, closed 14:35, day_sequence 1
 *                    · job B no press, no close, day_sequence 2
 *   → A 3.58 h and B 6.41 h. Six and a half hours on an invoice, resting
 *     entirely on one line of a schedule.
 *
 * That is Axel Valverde's Aug 12 2026 — Estes pressed 12:35:13 and Leifeng
 * carries nothing on that date but an Aug 10 press copy. It abstains today ONLY
 * because the office happened to leave Leifeng's board row a SKELETON
 * (`operator_id` and `helper_id` both null) and `lib/job-clock-attribution.ts`
 * refuses a skeleton's sequence. The ordinary act of typing a crew name into
 * that one row would turn the abstention into a 3.65 h charge on a job the
 * founder says the man never went to. A safety that holds only while a row
 * stays half-filled is an accident, not a rule.
 *
 * SO: EVERY JOB THAT TAKES A SEGMENT MUST CARRY A SAME-DAY FACT OF ITS OWN.
 * There are exactly two, and this is the whole list:
 *
 *   • A SAME-DAY PRESS — `jobStartOnDate` returned something. That is this
 *     date's `daily_job_logs.route_started_at` or `.work_started_at`, or the
 *     job's `route_started_at` / `in_route_at` / `work_started_at`, every
 *     candidate filtered by guard (a).
 *   • A SAME-DAY CLOSE — `jobCloseOnDate` returned something. That is this
 *     date's `daily_job_logs.day_completed_at`, or the job's
 *     `work_completed_at`, again filtered by guard (a).
 *
 * On a fully-pressed day every job has the first of those, so the test is inert
 * on every day that resolves today and none of them moves. It bites only where
 * the board is doing the ordering — which is exactly where it must.
 *
 * WHAT IS DELIBERATELY *NOT* A FACT. Each of these was considered and each
 * would have defeated the guard by certifying the very thing it admitted:
 *
 *   • THE BOARD'S `day_sequence`. It is the thing under suspicion. Letting the
 *     order double as the evidence for the order is the defect itself.
 *   • THE TIMECARD'S OWN `job_order_id` TAG. This is the clock-in guess, frozen
 *     at 7 a.m. before the office finishes the board; `lib/timecard-job-rules.ts`
 *     ranks it LAST and `isInferredSource` reports it as inferred. It is also
 *     the rung that ADMITS a job to the day at all under the billing policy's
 *     `always_counts`, so counting it here would make the guard vacuous for the
 *     precise shape it exists to catch: Leifeng is in Axel's Aug 12 only because
 *     his card still named yesterday's job.
 *   • A BARE `daily_job_logs` ROW. Thirteen of the sixty-eight production log
 *     rows carry no press, no close and `hours_worked` 0.00 — a row opened and
 *     never filled. Door Systems' Aug 6 row is one, and it is the row that would
 *     otherwise re-open the Keon hazard below. A row that records nothing
 *     records nothing about the day either.
 *   • A `helper_work_logs` ROW. It does have `started_at` and `completed_at`
 *     columns and both are populated on all 15 production rows — but
 *     `hours_worked` is NULL on all 15 and 13 of the 15 have
 *     `started_at == completed_at`. That is a FILING INSTANT, not a work
 *     window: it says the helper pressed Save, not that the crew was on site.
 *
 * DRIVE TIME LANDS THE SAME PLACE EITHER WAY, which is why rule 6 can sit beside
 * rule 3 without contradicting it. Under the press rule the drive to job 2 falls
 * inside job 2's segment, because the segment opens when the crew presses En
 * Route — before they have gone anywhere. Under the close fallback the segment
 * opens at job 1's close, which is EARLIER still (they close out, then pack up,
 * then drive). So the drive is inside job 2's segment under both, and rule 6 is
 * strictly the more conservative of the two for the job that closed. It is
 * asserted, not assumed, in lib/job-day-boundary.test.ts.
 *
 * THE CLOSE MUST BELONG TO A JOB THAT DEMONSTRABLY RAN THAT DAY. A close alone
 * proves only that somebody filed that job's paperwork — which on this data is
 * as often done from another job's truck as on site. So rule 6 fires only when
 * the PRECEDING job also carries a usable same-day start of its own. ISC's Aug
 * 11 close qualifies: it pressed at 11:31 and started work at 15:01. J. Davis's
 * Aug 7 close does not — it carries no same-day press and lands 17 minutes after
 * Axel clocked in, and believing it would have handed J. Davis 0.28 h and Bwc
 * the other 8.79 on the strength of a paperwork stamp.
 *
 * THREE MORE CONTRADICTION GUARDS. A press is self-consistent by construction; a
 * close borrowed from the neighbouring job is not, so the arithmetic is checked
 * before it is believed and the day abstains rather than printing an
 * impossibility:
 *   • a job may not begin after its OWN same-day close;
 *   • a close-derived boundary may not fall before the preceding job's press;
 *   • boundaries must not run backwards. (Checked between boundaries only — a
 *     press landing before clock-in still clamps to a zero-length stretch, which
 *     rule 5's tests already pin as the honest answer.)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT STILL ABSTAINS, AND WHY THAT IS THE POINT
 *
 * A day abstains when it cannot be ORDERED (rule 7), when nothing marks where it
 * moved on (guard (b)), when a job on it carries no same-day fact (guard (c)),
 * or when a close-derived boundary contradicts the record.
 *
 * MEASURED, NOT ESTIMATED (Aug 20 2026). Every person-day in production was run
 * through the shipped version (commit 5ca940e9) and through this one: 23
 * multi-job person-days, 24 cards. FIVE resolve under both, byte for byte —
 * Conrade Aug 5, Conrade and Micah Aug 18, Conrade and Axel Aug 19. TWO more
 * resolve that did not: Keon Aug 11 (ISC 4.07 / Leifeng 6.45) and Axel Aug 11
 * (ISC 3.90 / Leifeng 6.32), both on rule 6. Nothing else moves.
 *
 * The abstentions worth naming, each checked against the database rather than
 * remembered:
 *
 *  • AXEL AND CONRADE, AUG 7. Neither Bwc nor J. Davis pressed that day, so the
 *    board orders it — J. Davis #1, Bwc #2. Bwc carries no same-day press and no
 *    same-day close, so guard (c) stops it. It abstained before guard (c) too,
 *    on `prev.press == null`, and it would still abstain if the genuine per-day
 *    press hidden in `job_status_history` were wired in: that table holds
 *    `scheduled → in_route` for J. Davis at 8/07 11:54:22.739, which is 28 m 35 s
 *    AFTER its 11:25:47.945 close, so the boundary would fall before the
 *    preceding job's press. Right three times over.
 *
 *  • KEON, AUG 6 — AND THE HAZARD GUARD (c) CLOSES. The board has no rows for
 *    Keon that day, so rule 7 cannot order it and it abstains. The header used
 *    to say this day "has neither a press nor a close on either job", which is
 *    false: Collins Custom Builds pressed 8/06 12:14:37 and closed 8/06
 *    19:36:37. Only Door Systems is empty on that date — its stamps are all
 *    8/05 and its Aug 6 log row is one of the thirteen bare ones. So backfilling
 *    `day_sequence` for that day USED TO start printing "Door Systems 0.00 h",
 *    a zero-length stretch handed to a job on no evidence at all. Under guard
 *    (c) the same backfill leaves the day abstaining, which is the answer.
 *
 * HOW MUCH THE BOARD WAS HOLDING UP, MEASURED. Production was re-run with EVERY
 * missing `day_sequence` filled in — the office finishing its board, which is
 * ordinary clerical work nobody would think twice about. Without guard (c) that
 * one act turns five abstentions into five divisions, and every one of them is
 * a phantom:
 *
 *     Axel   8/12  Leifeng            3.65 h   ← the founder says he never went
 *     Keon   8/06  Door Systems       0.00 h
 *     Devin  8/12  Parkk Concrete     0.07 h
 *     Devin  8/14  Parkk Concrete     0.00 h
 *     Zack   8/14  Parkk (675188)     0.03 h
 *
 * The 0.00-0.07 figures are the SAME defect this whole file exists to kill —
 * a job handed a sliver of a day it has no record of — arriving by a new road.
 * With guard (c) all five keep abstaining, and the seven days that resolve on
 * real stamps are untouched.
 *
 * TWO CLAIMS THAT WERE IN THIS HEADER AND WERE WRONG, corrected here so nobody
 * reasons from them again:
 *
 *  • "Conrade's Aug 5 still abstains" — it RESOLVES, and resolved before rules 6
 *    and 7 existed. Both its jobs pressed on the day (QA Harper 11:44:57, Bwc
 *    14:28:30), so it takes rule 5's branch: QA Harper 3.22 h, Bwc 7.77 h.
 *    Harper General never enters the day's job set — the authority ladder in
 *    `lib/timecard-job-rules.ts` drops it as a conflict, because the board named
 *    the other two and only a log named it.
 *  • "Conrade's Aug 10 carries a job that cannot be ordered" — it is a
 *    SINGLE-JOB day. The board placed him on J. Davis alone; Bwc is named only
 *    by a bare log row and the ladder drops it. The day never reaches rule 7,
 *    or indeed any rule here: `jobs.length < 2` returns first.
 *
 * An abstention the office can see beats a division it cannot check.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * STATED LIMITATIONS — TWO SHAPES OF DAY THAT CAN NEVER DIVIDE
 *
 * Both fail SAFE (guard (b) fires, nothing splits, the day keeps the answer the
 * attribution rules already gave it). Written down so the next reader does not
 * mistake "this never splits" for a bug and go looking for one.
 *
 *  (i) DAY 2+ OF A MULTI-DAY JOB. A job's press is stamped ONCE, ever:
 *      `app/api/job-orders/[id]/status/route.ts` writes `route_started_at` only
 *      `if (!existingJob.route_started_at)`, and the closeout at
 *      `app/api/job-orders/[id]/daily-log/route.ts` then copies that job-level
 *      stamp onto every day's log row — which is how 22 of 54 production log
 *      rows carry a prior-day press for guard (a) to reject. Rule 6 recovers
 *      such a day when the preceding job closed on it; it cannot conjure a press
 *      that was never recorded. The genuine per-day press DOES exist in
 *      `job_status_history` (one row per real transition, 11 jobs carry 2-10 of
 *      them on distinct dates), and reading it is the durable fix — noted here
 *      rather than done, because it would move boundaries on jobs the office has
 *      already billed and that is the founder's call, not this rule's.
 *
 * (ii) NIGHT SHIFTS AND ANY DAY-CROSSING PRESS. Guard (a) requires a candidate's
 *      tenant-local calendar date to EQUAL the date being divided, so a job
 *      pressed after midnight on a shift belonging to the previous payroll day
 *      is invisible to that day, and guard (b) abstains. The guard is not
 *      loosened for this: it is the same test that keeps the 13 stale
 *      prior-day presses from handing out ten-hour phantoms, and a night shift
 *      that abstains costs nothing while a phantom costs an invoice.
 *
 * Everything here is PURE — no supabase, no Date.now() except an injectable
 * default — so every rule is unit-tested in lib/job-day-boundary.test.ts.
 */

import { dateInTz, DEFAULT_TENANT_TZ } from './reminder-timing';
import { floor2, MAX_DAILY_LOG_HOURS } from './labor-cost';

/** `job_orders` start stamps. Both spellings are read — see `jobStartOnDate`. */
export interface JobStartStamps {
  route_started_at?: string | null;
  in_route_at?: string | null;
  work_started_at?: string | null;
}

/** A `daily_job_logs` row, for the per-DAY start of a multi-day job. */
export interface DayLogStartStamps {
  job_order_id?: string | null;
  log_date?: string | null;
  route_started_at?: string | null;
  work_started_at?: string | null;
}

/**
 * THE CLOSE STAMPS, IN THEIR OWN SHAPES — DELIBERATELY NOT FOLDED INTO THE
 * START ONES.
 *
 * A completion is not a start, and rule 5 stands: a job's completion does not
 * end that job's segment. Rule 6's exception is narrow and points ONE JOB
 * DOWNSTREAM — the close of the job before this one, standing in for this one's
 * missing press. Putting `work_completed_at` inside `JobStartStamps` would have
 * compiled and would have quietly taught the next reader the broad rule the
 * header spends two paragraphs denying, so the close gets its own named type
 * instead. Callers pass ONE row object to both readers; structural typing does
 * the rest, and neither function can see the other's columns.
 */
export interface JobCloseStamps {
  work_completed_at?: string | null;
}

/** A `daily_job_logs` row's per-DAY sign-off. See `jobCloseOnDate`. */
export interface DayLogCloseStamps {
  job_order_id?: string | null;
  log_date?: string | null;
  day_completed_at?: string | null;
}

const toMs = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * THE MOMENT THIS JOB STARTED ON THIS DATE, or null when nothing recorded one.
 *
 * Candidates, all treated equally and reduced with `min` — the EARLIEST surviving
 * stamp is the moment the crew turned toward this job:
 *   • the day's own `daily_job_logs.route_started_at` / `work_started_at`
 *     (the only source that can be right on day 5 of a multi-day job), and
 *   • `job_orders.route_started_at` / `in_route_at` / `work_started_at`
 *     (re-counted Aug 20 2026 across 62 jobs: `in_route_at` on 40,
 *     `route_started_at` on 32, and 8 jobs carry ONLY `in_route_at`, so reading
 *     `route_started_at` alone loses 8 real presses).
 *
 * WHY `min` AND NOT A PRECEDENCE TABLE — AND DON'T "SIMPLIFY" IT TO ONE COLUMN.
 * It is tempting to write "`route_started_at` is the press, read that". It is
 * not true in production. On all 5 jobs where the two columns differ,
 * `in_route_at` is the EARLIER one and `route_started_at` is a LATER re-press —
 * JOB-2026-402357 carries in_route 8/05 20:31 against route_started 8/11 13:37,
 * six days apart. Reading `route_started_at` alone would take the re-press as
 * the boundary AND lose those 8 jobs outright.
 *
 * (This paragraph used to add "reading `in_route_at` alone loses the 30 jobs
 * that populate only `route_started_at`". There are ZERO such jobs — every row
 * with `route_started_at` also has `in_route_at`. The conclusion is unchanged,
 * because `min` is still needed for the 5 re-presses, but the arithmetic
 * pointed the wrong way and would have justified the wrong simplification.)
 *
 * `min` takes the earliest surviving stamp — the moment the
 * crew first turned toward this job — and the date guard below discards every
 * candidate that belongs to a different day, which is what makes `min` safe
 * across a six-day gap. `work_started_at` is the documented fallback for a job
 * started without the route tap (plan doc, Phase 1).
 *
 * EVERY candidate is filtered by guard (a) above: its tenant-local calendar date
 * must equal `date`. A stale stamp is not a weaker boundary, it is a wrong one.
 */
export function jobStartOnDate(
  date: string,
  logs: DayLogStartStamps[] | null | undefined,
  job: JobStartStamps | null | undefined,
  jobId?: string | null,
  timeZone: string = DEFAULT_TENANT_TZ
): string | null {
  const candidates: string[] = [];
  for (const l of logs || []) {
    if (!l) continue;
    if (jobId && l.job_order_id && l.job_order_id !== jobId) continue;
    if (l.log_date && l.log_date !== date) continue;
    if (l.route_started_at) candidates.push(l.route_started_at);
    if (l.work_started_at) candidates.push(l.work_started_at);
  }
  if (job) {
    if (job.route_started_at) candidates.push(job.route_started_at);
    if (job.in_route_at) candidates.push(job.in_route_at);
    if (job.work_started_at) candidates.push(job.work_started_at);
  }

  let best: { iso: string; ms: number } | null = null;
  for (const c of candidates) {
    const ms = toMs(c);
    if (ms == null) continue;
    // GUARD (a): a boundary must fall on the day it divides.
    if (dateInTz(c, timeZone) !== date) continue;
    if (!best || ms < best.ms) best = { iso: c, ms };
  }
  return best ? best.iso : null;
}

/**
 * THE MOMENT THIS JOB CLOSED ON THIS DATE, or null when nothing recorded one.
 *
 * The mirror of `jobStartOnDate`, and it exists for exactly one purpose: rule 6,
 * where the PRECEDING job's close stands in for the missing press of the job
 * after it. It is never a job's own end — rule 5 is untouched, and no caller may
 * use this to close the segment of the job it belongs to.
 *
 * Candidates:
 *   • the day's own `daily_job_logs.day_completed_at` (the per-day sign-off,
 *     right on day 5 of a multi-day job), and
 *   • `job_orders.work_completed_at` (the whole-job sign-off, which guard (a)
 *     admits only on the day it actually happened — on every other day of a
 *     multi-day job it is a different day's fact and is discarded, exactly as a
 *     stale press is).
 *
 * REDUCED WITH `max`, WHERE `jobStartOnDate` USES `min`, AND THE ASYMMETRY IS
 * DELIBERATE. One principle drives both: a job's window on a day runs to the
 * OUTERMOST evidence that job carries. The earliest surviving start is the first
 * moment the crew turned toward it; the latest surviving close is the last
 * moment it was still alive. Taking `min` here would hand the next job minutes
 * the closing job can prove it was still working, which is the one direction a
 * boundary must not err — the closing job is the party with the record.
 *
 * EVERY candidate is filtered by guard (a): its tenant-local calendar date must
 * equal `date`. On ISC's Aug 11 both sources agree to the millisecond
 * (15:04:36.460Z), which is the common case; they are both read because the log
 * is the only per-day source and the job stamp is the only source on a day no
 * log was filed.
 */
export function jobCloseOnDate(
  date: string,
  logs: DayLogCloseStamps[] | null | undefined,
  job: JobCloseStamps | null | undefined,
  jobId?: string | null,
  timeZone: string = DEFAULT_TENANT_TZ
): string | null {
  const candidates: string[] = [];
  for (const l of logs || []) {
    if (!l) continue;
    if (jobId && l.job_order_id && l.job_order_id !== jobId) continue;
    if (l.log_date && l.log_date !== date) continue;
    if (l.day_completed_at) candidates.push(l.day_completed_at);
  }
  if (job?.work_completed_at) candidates.push(job.work_completed_at);

  let best: { iso: string; ms: number } | null = null;
  for (const c of candidates) {
    const ms = toMs(c);
    if (ms == null) continue;
    // GUARD (a), unchanged: a boundary must fall on the day it divides.
    if (dateInTz(c, timeZone) !== date) continue;
    if (!best || ms > best.ms) best = { iso: c, ms };
  }
  return best ? best.iso : null;
}

/** One job on a person's day, with the moment it started (null = never pressed). */
export interface DayJobStart {
  job_order_id: string;
  /** ISO timestamp of the in-route press for this job on this date. */
  started_at: string | null;
  /**
   * ISO timestamp of this job's SAME-DAY close, from `jobCloseOnDate`. Read only
   * as the boundary handed to the job AFTER this one (rule 6) — never to end
   * this job's own segment, which rule 5 forbids.
   */
  completed_at?: string | null;
  /**
   * The board's `job_daily_assignments.day_sequence` — the office's own order
   * for the day. Consulted ONLY when a press is missing somewhere on the day
   * (rule 7); on a fully-pressed day the presses decide and this is ignored, so
   * a board that disagrees with the stamps can never move a day that already
   * resolves.
   */
  day_sequence?: number | null;
}

/** The stretch of one clocked day that belongs to one job. */
export interface JobDaySegment {
  job_order_id: string;
  /** ISO — clock-in for the first job, this job's own press thereafter. */
  start: string;
  /** ISO — the NEXT job's press, or clock-out for the last job. */
  end: string;
  /** Hours in the stretch, FLOORED to 2dp. See `floor2` in lib/labor-cost.ts. */
  hours: number;
  /**
   * TRUE when the day's ORDER came from the board rather than from the crew's
   * own presses — rule 7's second branch. Set on EVERY segment of that day: it
   * is the day's division that rests on the weaker evidence, and every job's
   * figure moves with it.
   *
   * THIS IS THE FLAG THE PRINTED SHEET MARKS, AND IT IS WIDER THAN
   * `divided_by_close` ON PURPOSE. A board-ordered day comes in two shapes and
   * only one of them draws a boundary from a close:
   *
   *   • job A has no press but job B does — the LINE is B's real press, and what
   *     rests on the board is which job stands on which side of it;
   *   • job B has no press either — the line is A's close (rule 6).
   *
   * Marking only the second left the first printing `¶`, whose footnote states
   * that In/Out come from clock-in or the In Route press. On a day where the
   * first job never pressed, that is a claim the record does not support. Both
   * shapes are inferences the office should check against its own board, so both
   * carry the same mark.
   */
  divided_by_board?: boolean;
  /**
   * TRUE when at least one boundary on this DAY was drawn from a close rather
   * than a press (rule 6) — a strict subset of `divided_by_board`, since a day
   * where every job pressed never needs a close.
   *
   * Kept alongside the wider flag because it names WHICH stamp an admin has to
   * check: on Keon's Aug 11 the whole line between two invoices is ISC's
   * completion time. The sheet prints one mark for both shapes and lets the
   * footnote say, when this is set, that a sign-off drew the line.
   */
  divided_by_close?: boolean;
}

export interface DayClockCard {
  clock_in_time?: string | null;
  clock_out_time?: string | null;
}

/**
 * Divide ONE clocked day between the jobs the person was on that day.
 *
 * Returns `null` — meaning "no split applies, leave this day exactly as the
 * existing attribution rules had it" — when any of these is true:
 *   • no clock-in (there is no day to divide);
 *   • fewer than two jobs (a single-job day is the whole card, R2, and is
 *     already what every surface prints — re-deriving it here would swap a
 *     recorded payroll figure for a computed span on days nothing is wrong with);
 *   • the day cannot be ORDERED — neither every job pressed nor every job
 *     carrying a distinct board `day_sequence` (rule 7);
 *   • a job on the day carries no same-day fact of its own — no press and no
 *     close — so the only thing putting it in the running is a board row
 *     (guard (c));
 *   • a job with no same-day press follows one with no same-day close, so
 *     nothing marks where the day moved on (guard (b), as widened by rule 6);
 *   • a close-derived boundary contradicts the record — see the three guards in
 *     the header.
 *
 * WHY THE HOURS ARE FLOORED, NOT ROUNDED. `round2` on each of N segments can sum
 * to MORE than the card contains: Conrade's Aug 19 rounds to 7.04 + 3.56 = 10.60
 * against a 10.59-hour clocked span, half a minute of labour that exists on no
 * clock. A split may only ever divide what was clocked, so each segment gives up
 * its final fraction. It also reproduces the founder's own arithmetic exactly
 * (7.03 and 3.55), which is the number he has already written on an invoice.
 *
 * WHAT THESE HOURS ARE, PRECISELY. They are the CLOCKED SPAN of the stretch —
 * lunch included. A card carries ONE lunch deduction and there is no recorded
 * fact saying which of two jobs it fell in, so it is not apportioned; the day's
 * lunch minutes stay on the day. Consequence, stated here because it reaches an
 * invoice: on a split day the segments sum to the card's GROSS span (10.58 for
 * Conrade) where a single-job day prints the card's PAID hours (10.09). That
 * seam is the billable-vs-paid distinction the plan doc calls out
 * (BILLABLE_HOURS_AND_SHOP_TICKETS.md, "Lunch — and this splits one number into
 * two") and is task #10's to close, not this rule's. Every surface marks a split
 * figure so the office can see which of the two it is reading.
 */
export function splitClockDayAtJobStarts(
  card: DayClockCard,
  jobs: DayJobStart[],
  now: Date = new Date()
): JobDaySegment[] | null {
  const clockIn = toMs(card?.clock_in_time);
  if (clockIn == null) return null;
  if (!jobs || jobs.length < 2) return null;

  const rows: Array<{ jobId: string; press: number | null; close: number | null; seq: number | null }> =
    [];
  for (const j of jobs) {
    if (!j?.job_order_id) return null;
    rows.push({
      jobId: j.job_order_id,
      press: toMs(j.started_at),
      close: toMs(j.completed_at),
      seq:
        typeof j.day_sequence === 'number' && Number.isFinite(j.day_sequence)
          ? j.day_sequence
          : null,
    });
  }

  const clockOut = toMs(card?.clock_out_time);
  // Same open-card guard as `boundedJobHours`: a forgotten clock-out must not
  // book days, so an un-clocked-out card ends at `now`, never more than 16h out.
  const cardEnd =
    clockOut != null ? clockOut : Math.min(now.getTime(), clockIn + MAX_DAILY_LOG_HOURS * 3600000);
  if (cardEnd <= clockIn) return null;

  // ── GUARD (c): A SAME-DAY FACT PER JOB ────────────────────────────────────
  // Every job that is about to take a stretch of this person's day must carry
  // one of the two same-day facts listed in the header — its own press, or its
  // own close. The board's `day_sequence` is an ORDER and is not a fact; nor is
  // the card's frozen clock-in tag, which is what put half these jobs on the day
  // in the first place. Without this, a job whose only trace in the database is
  // one line of a schedule can be handed six billable hours (Axel, Aug 12).
  //
  // Checked BEFORE the ordering and for EVERY job, not only the unpressed ones
  // that reach rule 6: on the shape where the FIRST job never pressed, no
  // boundary is ever asked of it — the second job's press does all the work —
  // and it would otherwise take clock-in → that press on no evidence at all.
  // Inert on a fully-pressed day, where the press IS the fact, so no day that
  // resolves today can move.
  for (const r of rows) {
    if (r.press == null && r.close == null) return null;
  }

  // ── RULE 7: ORDER ─────────────────────────────────────────────────────────
  let dividedByBoard = false;
  if (rows.every((r) => r.press != null)) {
    // Rule 5, byte for byte: ordered by the PRESS, job id breaking an exact tie
    // so two jobs pressed in the same millisecond produce a stable answer rather
    // than an input-order one. Every day that resolves today takes this branch.
    rows.sort((a, b) =>
      a.press !== b.press ? (a.press as number) - (b.press as number) : a.jobId.localeCompare(b.jobId)
    );
  } else if (
    rows.every((r) => r.seq != null) &&
    new Set(rows.map((r) => r.seq)).size === rows.length
  ) {
    // A press is missing somewhere, so the ORDER comes from the office's board.
    // Sequences must be DISTINCT: two jobs the board calls #1 are not an order,
    // they are the board saying it did not distinguish them, and guessing which
    // came first is precisely the invention guard (b) exists to prevent.
    rows.sort((a, b) => (a.seq as number) - (b.seq as number));
    // The ORDER is now an office document rather than the crew's own stamps, and
    // every figure the day produces rests on it — including the ones whose
    // boundary is a real press. The sheet says so; see `divided_by_board`.
    dividedByBoard = true;
  } else {
    // Neither a full set of presses nor a full set of distinct sequences. The
    // day cannot be ordered, so it is not divided — guard (b), unchanged in
    // spirit and merely better informed. Keon's Aug 6 lands here: the board has
    // no rows for him that day, so nothing can order his two jobs. (This comment
    // used to name Conrade's Aug 5 and Aug 10. Neither reaches this branch —
    // Aug 5 is fully pressed and resolves, Aug 10 is a single-job day. See the
    // header.)
    return null;
  }

  // ── RULE 6: BOUNDARIES ────────────────────────────────────────────────────
  // bounds[0] is clock-in (rule 2); bounds[i] opens job i and closes job i-1.
  const bounds: number[] = [clockIn];
  let dividedByClose = false;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const here = rows[i];
    let b = here.press;
    if (b == null) {
      // Rule 6: no press of its own, so the day moved on when the job before it
      // was closed out.
      //
      // ONLY IF THAT JOB IS KNOWN TO HAVE RUN THAT DAY. A close with no
      // same-day start behind it is the closeout-from-another-truck pattern, not
      // a day's work: Axel and Conrade, Aug 7, where J. Davis carries a close at
      // 11:25:47 — seventeen minutes after Axel clocked in — and no same-day
      // press at all. Believing it would hand J. Davis 0.28 h and Bwc the other
      // 8.79, on the strength of a stamp that says only "somebody filed this
      // job's paperwork today". ISC's Aug 11 close is trusted precisely because
      // ISC also pressed at 11:31 and started work at 15:01: it demonstrably ran.
      if (prev.press == null) return null;
      b = prev.close;
      if (b == null) return null; // nothing at all marks the boundary — abstain
      // A job may not begin after its OWN close.
      if (here.close != null && b > here.close) return null;
      // Nor before the press of the job it follows.
      if (b < prev.press) return null;
      dividedByClose = true;
    }
    // Boundaries may not run backwards. Checked BETWEEN boundaries only: a press
    // landing before clock-in still clamps to a zero-length stretch, which rule
    // 5's tests already pin as the honest answer rather than an abstention.
    if (i >= 2 && b < bounds[i - 1]) return null;
    bounds.push(b);
  }

  const clamp = (ms: number) => Math.min(Math.max(ms, clockIn), cardEnd);

  const out: JobDaySegment[] = [];
  for (let i = 0; i < rows.length; i++) {
    // Rule 2: the first job starts when the PERSON did, not when it was pressed.
    const startMs = i === 0 ? clockIn : clamp(bounds[i]);
    // Rule 3/4/6: the next boundary, or clock-out for the last.
    const endMs = i === rows.length - 1 ? cardEnd : clamp(bounds[i + 1]);
    const span = Math.max(0, endMs - startMs);
    out.push({
      job_order_id: rows[i].jobId,
      start: new Date(startMs).toISOString(),
      end: new Date(Math.max(endMs, startMs)).toISOString(),
      // A zero-length segment is honest and stays: it says the crew left for the
      // next job the moment this one started. It is NOT the same as "no record".
      hours: floor2(span / 3600000),
      ...(dividedByBoard ? { divided_by_board: true } : {}),
      ...(dividedByClose ? { divided_by_close: true } : {}),
    });
  }
  return out;
}
