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
 *     `route_started_at`, and on **13 of the 53** production rows that have one
 *     it is a COPY of an earlier day's press: JOB-2026-277097's 8/12 closeout row
 *     carries 8/10 07:43. Dante was at another job that Wednesday and only typed
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
 *     the same answer as before. Across all of production there are 22 multi-job
 *     person-days: this RESOLVES 5 and ABSTAINS on the other 17.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * STATED LIMITATIONS — TWO SHAPES OF DAY THAT CAN NEVER DIVIDE
 *
 * Both fail SAFE (guard (b) fires, nothing splits, the day keeps the answer the
 * attribution rules already gave it). Written down so the next reader does not
 * mistake "this never splits" for a bug and go looking for one.
 *
 *  (i) DAY 2+ OF A MULTI-DAY JOB. A job is pressed en route ONCE, on day 1.
 *      `daily_job_logs` looks like the per-day source that would fix this, but
 *      `app/api/job-orders/[id]/daily-log/route.ts:355` writes
 *      `route_started_at: job.route_started_at` — it COPIES the job's original
 *      press onto every day's log. So day 5's log carries day 1's timestamp,
 *      guard (a) rejects it as off-day, that job has no start on the date, and
 *      guard (b) abstains for the whole day. A genuine per-day press would have
 *      to be recorded at the source before this could resolve.
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
 *     (`in_route_at` is populated on 38 of 62 production jobs and
 *     `route_started_at` on 30 — 8 jobs carry ONLY `in_route_at`, so reading
 *     either one alone loses real presses).
 *
 * WHY `min` AND NOT A PRECEDENCE TABLE — AND DON'T "SIMPLIFY" IT TO ONE COLUMN.
 * It is tempting to write "`route_started_at` is the press, read that". It is
 * not true in production. On all 5 jobs where the two columns differ,
 * `in_route_at` is the EARLIER one and `route_started_at` is a LATER re-press —
 * JOB-2026-402357 carries in_route 8/05 20:31 against route_started 8/11 13:37,
 * six days apart. Reading `route_started_at` alone would take the re-press as
 * the boundary; reading `in_route_at` alone loses the 30 jobs that populate only
 * `route_started_at`. `min` takes the earliest surviving stamp — the moment the
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

/** One job on a person's day, with the moment it started (null = never pressed). */
export interface DayJobStart {
  job_order_id: string;
  /** ISO timestamp of the in-route press for this job on this date. */
  started_at: string | null;
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
 *   • ANY job on the day has no start on that date — guard (b).
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

  // Guard (b) — one unpressed job and the day is not divisible.
  const starts: Array<{ jobId: string; ms: number }> = [];
  for (const j of jobs) {
    if (!j?.job_order_id) return null;
    const ms = toMs(j.started_at);
    if (ms == null) return null;
    starts.push({ jobId: j.job_order_id, ms });
  }

  const clockOut = toMs(card?.clock_out_time);
  // Same open-card guard as `boundedJobHours`: a forgotten clock-out must not
  // book days, so an un-clocked-out card ends at `now`, never more than 16h out.
  const cardEnd =
    clockOut != null ? clockOut : Math.min(now.getTime(), clockIn + MAX_DAILY_LOG_HOURS * 3600000);
  if (cardEnd <= clockIn) return null;

  // Ordered by the PRESS. Job id breaks an exact tie so two jobs pressed in the
  // same millisecond produce a stable answer rather than an input-order one.
  starts.sort((a, b) => (a.ms !== b.ms ? a.ms - b.ms : a.jobId.localeCompare(b.jobId)));

  const clamp = (ms: number) => Math.min(Math.max(ms, clockIn), cardEnd);

  const out: JobDaySegment[] = [];
  for (let i = 0; i < starts.length; i++) {
    // Rule 2: the first job starts when the PERSON did, not when it was pressed.
    const startMs = i === 0 ? clockIn : clamp(starts[i].ms);
    // Rule 3/4: the next press, or clock-out for the last.
    const endMs = i === starts.length - 1 ? cardEnd : clamp(starts[i + 1].ms);
    const span = Math.max(0, endMs - startMs);
    out.push({
      job_order_id: starts[i].jobId,
      start: new Date(startMs).toISOString(),
      end: new Date(Math.max(endMs, startMs)).toISOString(),
      // A zero-length segment is honest and stays: it says the crew left for the
      // next job the moment this one started. It is NOT the same as "no record".
      hours: floor2(span / 3600000),
    });
  }
  return out;
}
