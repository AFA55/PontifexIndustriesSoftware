/**
 * PARK AND RESTART — a job leaves the schedule and comes back with a new scope,
 * keeping its job number.
 *
 * ── THE CASE THIS WAS BUILT FROM ────────────────────────────────────────────
 * Leifeng Construction, JOB-2026-400368. Crew on it Aug 10, Aug 11 and Aug 13.
 * The contractor pushed it off. It sat until Aug 21 — ten days — and nobody
 * saw it sitting, because a parked job is simply absent from the board. It
 * comes back Friday to do different work under the same contract.
 *
 * The founder's constraint is the whole design: *"same job ID should stay
 * because same contract info"*. Duplicating the ticket and extending the dates
 * would have said the crew was on it all week. They were not.
 *
 * ── TWO DAY NUMBERS, BOTH TRUE, NEVER INTERCHANGEABLE ───────────────────────
 *
 *   phaseDay     the ordinal of the date within THIS run of work. Restarts at 1
 *                on every restart. Leifeng's Friday is Day 1 — it is the first
 *                day of getting back on it. This is what the crew's phone and
 *                the printed ticket mean by "Day N".
 *
 *   lifetimeDay  the ordinal of the date across the whole job, every phase.
 *                Never restarts. Leifeng's Friday is day 4 — the job has cost
 *                four days against this contract. This is what the office
 *                bills and what `job_orders.total_days_worked` counts.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────
 *
 * It does not renumber anything in the database, and no migration in this
 * feature touches `set_daily_log_day_number()` or `update_total_days_worked()`.
 *
 * That restraint is load-bearing twice over:
 *
 *  1. `daily_job_logs.day_number` is a KEY, not just a label. 71 of the 92
 *     `work_items` billing rows in production carry a `day_number` and NO
 *     `daily_log_id` — they are reachable only by (job, day_number). If a
 *     restart reset the stored numbering to 1, a job would hold two "Day 1"s
 *     and those orphan billing rows would collide. The Aug 14 migration went
 *     to considerable trouble to remap them exactly once; doing it again on
 *     every park would be a standing invitation to bill the wrong day.
 *
 *  2. The Aug 14 proof rule lives in ONE place — the `job_workday_evidence`
 *     view — and both database functions read it. A date counts only when the
 *     job can prove a crew was on it: a filed log, or the office placed a
 *     named crew AND that person clocked in. The phase ordinal is computed
 *     from that same list of proven dates, here, at read time. So the proof
 *     rule cannot drift: there is still exactly one definition of which dates
 *     count, and this file only decides where to draw a line through them.
 *
 * `total_days_worked` therefore keeps the single owner it already has
 * (`update_total_days_worked`, which COUNTs the evidence view). This feature
 * adds no fourth writer.
 *
 * ── NO PHASE ROWS MEANS NO CHANGE ───────────────────────────────────────────
 * A job that has never been parked has no rows in `job_phases`. Every function
 * here treats that as a single implicit phase, so `phaseDay === lifetimeDay`
 * and every existing job, ticket and invoice reads exactly as it did before.
 * That is why this feature ships without a backfill.
 */

import { parseYMDLocal, toLocalYMD } from './dates';

/** A run of work on a job. Phase 1 is the original; each restart adds one. */
export interface JobPhase {
  id: string;
  job_order_id: string;
  phase_number: number;
  /** First scheduled day of this run. A bare 'YYYY-MM-DD'. */
  started_on: string;
  /** The scope as the office described it for this run. */
  scope_text: string | null;
  /** Date this phase was parked; null while the phase is live. */
  parked_on: string | null;
  park_reason: string | null;
}

/** The `job_orders` fields this module reads. */
export interface ParkableJob {
  on_hold?: boolean | null;
  on_hold_placed_at?: string | null;
  on_hold_released_at?: string | null;
  on_hold_reason?: string | null;
  description?: string | null;
}

export interface PhaseDayNumber {
  /** Bare 'YYYY-MM-DD'. */
  date: string;
  /** 1-based ordinal within the phase. Restarts at 1 on a restart. */
  phaseDay: number;
  /** 1-based ordinal across the whole job. Never restarts. */
  lifetimeDay: number;
  phaseNumber: number;
}

/**
 * IS THIS JOB PARKED RIGHT NOW?
 *
 * There is exactly one predicate for this, because production already proved
 * the flag and the timestamps can disagree. JOB-2026-974669 (ClemTenn) sits
 * with `on_hold = true` AND `on_hold_released_at` set — the founder released it
 * by hand on Aug 20 and the boolean was left behind. Reading the boolean alone
 * would keep showing a live job as parked forever.
 *
 * The timestamps are the record; the boolean is a hint. A job is parked when it
 * was placed on hold and has not been released SINCE that placement — which is
 * also what makes park/restart repeatable, because a second park simply stamps
 * a `placed_at` later than the previous `released_at`.
 */
export function isParked(job: ParkableJob | null | undefined): boolean {
  if (!job) return false;
  const placed = job.on_hold_placed_at;
  if (!placed) return false;
  // An explicit flag that was never stamped still counts as parked.
  const released = job.on_hold_released_at;
  if (!released) return job.on_hold !== false;
  return new Date(released).getTime() < new Date(placed).getTime();
}

/**
 * How long this job has been sitting, in whole days.
 *
 * This is the number nobody could see. Leifeng sat 10 days; five more jobs were
 * sitting in production the day this was written, the oldest since Jul 28.
 * Returns null when the job is not parked.
 */
export function daysParked(
  job: ParkableJob | null | undefined,
  today: string = toLocalYMD()
): number | null {
  if (!isParked(job) || !job?.on_hold_placed_at) return null;
  // on_hold_placed_at is a timestamptz; the calendar day it landed on locally
  // is what "how long has it been sitting" means to the office.
  const placedYMD = toLocalYMD(new Date(job.on_hold_placed_at));
  const diff =
    parseYMDLocal(today).getTime() - parseYMDLocal(placedYMD).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

/** Phases oldest-first, defensively sorted — callers pass whatever the DB gave. */
export function sortPhases(phases: readonly JobPhase[]): JobPhase[] {
  return [...phases].sort((a, b) => {
    if (a.started_on !== b.started_on) return a.started_on < b.started_on ? -1 : 1;
    return a.phase_number - b.phase_number;
  });
}

/**
 * Which phase does this date belong to?
 *
 * The date falls in the LAST phase that had started by then. A date earlier
 * than phase 1's start still belongs to phase 1 — a job whose first day beat
 * its own scheduled date is a real thing, and it must not fall through a hole.
 * Returns null only when there are no phases at all.
 */
export function phaseForDate(
  phases: readonly JobPhase[],
  ymd: string
): JobPhase | null {
  const sorted = sortPhases(phases);
  if (sorted.length === 0) return null;
  let found = sorted[0];
  for (const p of sorted) {
    if (p.started_on <= ymd) found = p;
  }
  return found;
}

/**
 * Number every proven work date twice — within its phase, and across the job.
 *
 * `workDates` must be the job's PROVEN dates (the `job_workday_evidence` view,
 * or the ticket's already-assembled day list). Duplicates and disorder are
 * tolerated; the caller should not have to pre-clean.
 *
 * With no phases, every date lands in phase 1 and `phaseDay === lifetimeDay`,
 * which is precisely how the platform behaved before this feature existed.
 */
export function numberJobDays(
  phases: readonly JobPhase[],
  workDates: readonly string[]
): PhaseDayNumber[] {
  const dates = Array.from(new Set(workDates)).sort();
  const counters = new Map<number, number>();

  return dates.map((date, i) => {
    const phase = phaseForDate(phases, date);
    const phaseNumber = phase?.phase_number ?? 1;
    const next = (counters.get(phaseNumber) ?? 0) + 1;
    counters.set(phaseNumber, next);
    return { date, phaseDay: next, lifetimeDay: i + 1, phaseNumber };
  });
}

/** Index a numbering by date, for the ticket's per-day lookup. */
export function byDate(
  numbering: readonly PhaseDayNumber[]
): Map<string, PhaseDayNumber> {
  return new Map(numbering.map((n) => [n.date, n]));
}

export interface PhaseGap {
  /** Last proven work date of the earlier phase. */
  lastWorkedOn: string;
  /** First proven work date of the later phase. */
  resumedOn: string;
  /** Whole days between them — what the customer sees as the pause. */
  days: number;
  /** The phase being resumed. */
  phaseNumber: number;
  parkReason: string | null;
}

/**
 * The gaps between phases, as the ticket must show them.
 *
 * The founder's second decision was that the break be VISIBLE — one ticket,
 * phases marked, and the reader can see the job stopped. A gap is only reported
 * where both sides actually have proven work, so a phase that was scheduled and
 * never worked cannot manufacture a pause out of nothing.
 */
export function phaseGaps(
  phases: readonly JobPhase[],
  numbering: readonly PhaseDayNumber[]
): PhaseGap[] {
  const sorted = sortPhases(phases);
  const gaps: PhaseGap[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const before = numbering.filter((n) => n.phaseNumber === prev.phase_number);
    const after = numbering.filter((n) => n.phaseNumber === cur.phase_number);
    if (before.length === 0 || after.length === 0) continue;

    const lastWorkedOn = before[before.length - 1].date;
    const resumedOn = after[0].date;
    const days = Math.max(
      0,
      Math.floor(
        (parseYMDLocal(resumedOn).getTime() -
          parseYMDLocal(lastWorkedOn).getTime()) /
          86_400_000
      )
    );
    gaps.push({
      lastWorkedOn,
      resumedOn,
      days,
      phaseNumber: cur.phase_number,
      parkReason: prev.park_reason ?? null,
    });
  }
  return gaps;
}

/*
 * There is deliberately NO `currentScope()` here.
 *
 * One was written, exported and tested, and called by zero production files:
 * the crew's phone reads `job_orders.description`, which the restart route
 * mirrors the new scope onto in the same statement that opens the phase, and
 * the printed ticket reads `scopeHistory()` (whose last entry is flagged
 * `isCurrent`). A third answer to "what is the scope now" would be a third
 * thing to keep in step. Code that exists so a test can pass is the habit this
 * project keeps paying for — if the phone ever stops reading `description`,
 * add it back with the caller that needs it.
 */

export interface ScopeHistoryEntry {
  phaseNumber: number;
  startedOn: string;
  scopeText: string;
  isCurrent: boolean;
}

/**
 * Every scope this job has carried, oldest first — history the office can read
 * back. The last entry is the one in force.
 */
export function scopeHistory(
  job: ParkableJob | null | undefined,
  phases: readonly JobPhase[]
): ScopeHistoryEntry[] {
  const sorted = sortPhases(phases);
  const entries: ScopeHistoryEntry[] = [];

  for (const p of sorted) {
    const text = p.scope_text?.trim();
    if (!text) continue;
    entries.push({
      phaseNumber: p.phase_number,
      startedOn: p.started_on,
      scopeText: text,
      isCurrent: false,
    });
  }

  // A never-parked job keeps its scope on job_orders.description and has no
  // phase rows at all — surface it so the history is never empty for a job
  // that plainly has a scope.
  if (entries.length === 0) {
    const desc = job?.description?.trim();
    if (!desc) return [];
    entries.push({
      phaseNumber: 1,
      startedOn: sorted[0]?.started_on ?? '',
      scopeText: desc,
      isCurrent: true,
    });
    return entries;
  }

  entries[entries.length - 1].isCurrent = true;
  return entries;
}

/**
 * ── SCHEDULING OR CREWING A PARKED JOB MUST UN-PARK IT ──────────────────────
 *
 * THE LIVE BUG. JOB-2026-974669 (ClemTenn) sat `on_hold` from Aug 14 with
 * `on_hold_released_at` null while the office placed Conrade on it for Aug 20.
 * It was his real job that morning. The founder released it by hand. Left
 * alone, the office would keep hitting this every time it crewed a parked job.
 *
 * The cause is small and exact: `PROMOTABLE_STATUSES` in `lib/reassign.ts` is
 * `['scheduled', 'pending_approval']`, so `shouldPromoteToAssigned` never fired
 * for an `on_hold` job — it stayed parked while carrying a named crew for a
 * named date. And nothing anywhere cleared the `on_hold` boolean except the
 * single reactivate route.
 *
 * This returns the field patch that releases a park, for merging into ANY
 * `job_orders` update that puts the job on the calendar or puts a person on it.
 * It returns an empty object when the job is not parked, so every caller can
 * spread it unconditionally and no caller has to think about it.
 *
 * ── AND AN EMPTY OBJECT WHEN NOBODY IS ON IT AND NOTHING IS BEING SCHEDULED ──
 *
 * That precondition is not decoration; without it this function un-parks a job
 * on the write that TAKES THE LAST MAN OFF IT. JOB-2026-396494 is parked since
 * Aug 17 with an operator on it and a `scheduled_date` now in the past. The
 * dispatcher pulls that operator off because he is needed elsewhere while the
 * job waits. Un-parked, the job drops out of the Parked column and files itself
 * under a stale past date, which the board's
 * `lte(scheduled_date, today).or(end_date…)` filter will not surface either —
 * invisible again, which is the ten-day Leifeng failure caused by the feature
 * built to end it. Four of the six `on_hold` jobs in production carry an
 * operator, so it is reachable today.
 *
 * So the release fires when — and only when — one of these is true:
 *
 *   • somebody is on the job AFTER this write (`operatorId` or `helperId`), or
 *   • `scheduling` says this same write puts it back on the calendar.
 *
 * `scheduling` is an EXPLICIT argument rather than something inferred, because
 * the callers that re-date a job pass its EXISTING crew, and existing crew
 * cannot tell "the office re-dated it" from "the office took the last man off
 * it". A caller that knows it is writing a date, or is moving the job out of
 * `on_hold` by an explicit status transition, says so. A caller that is only
 * changing who is on the job says nothing and gets the crew rule.
 *
 * Note the deliberate asymmetry with the existing reactivate route: that route
 * leaves `on_hold_reason` and `on_hold_placed_at` in place, and so does this.
 * They are the RECORD of the park that just ended — `isParked()` reads the two
 * timestamps against each other, so the history stays legible and a later park
 * simply stamps a newer `on_hold_placed_at`. Clearing them would erase how long
 * the job sat, which is the one number this whole feature exists to show.
 */
export function releaseParkedJobFields(args: {
  job: (ParkableJob & { status?: string | null }) | null | undefined;
  /** Who, if anyone, is on the job after this write. */
  operatorId?: string | null;
  helperId?: string | null;
  /**
   * TRUE when this same write is the office putting the job back in play by
   * something other than crewing it:
   *
   *   • it writes a `scheduled_date` / `end_date` that is actually moving
   *     (`schedulingDatesMoving()` answers that for a PATCH body), or
   *   • it is an explicit status transition OUT of 'on_hold' — the operator
   *     pressing In Route on a job the office never formally released.
   *
   * Omit it and a crewless write leaves the job parked, which is the whole
   * point: an unassign must not evict a job from the Parked column.
   */
  scheduling?: boolean;
  nowIso?: string;
}): Record<string, unknown> {
  const { job, operatorId, helperId, scheduling } = args;
  if (!isParked(job)) return {};
  // Nobody on it and nothing being scheduled: this write is not a return to
  // work. Leave the park exactly as it is.
  if (!operatorId && !helperId && !scheduling) return {};

  const nowIso = args.nowIso ?? new Date().toISOString();
  const fields: Record<string, unknown> = {
    on_hold: false,
    on_hold_released_at: nowIso,
  };

  // `status` is a separate axis from the boolean and they drift apart in
  // production, so fix it here too — but only from 'on_hold'. A job that was
  // parked mid-flight and is already back to in_route/in_progress keeps the
  // status it earned; downgrading a live job is how a working crew loses its
  // place.
  if (job?.status === 'on_hold') {
    fields.status = operatorId || helperId ? 'assigned' : 'scheduled';
    if (operatorId || helperId) fields.assigned_at = nowIso;
  }

  return fields;
}

/** The `job_orders` columns that mean "this job sits on the calendar here". */
export const SCHEDULING_DATE_COLUMNS = [
  'scheduled_date',
  'end_date',
  'scheduled_end_date',
] as const;

/** '' / null / undefined are one value; a timestamp compares on its date part. */
function sameDateValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) =>
    v === null || v === undefined || v === '' ? null : String(v).slice(0, 10);
  return norm(a) === norm(b);
}

/**
 * IS THIS UPDATE ACTUALLY MOVING THE JOB'S DATES?
 *
 * The `scheduling` argument to `releaseParkedJobFields()` has to be a fact, not
 * a guess, and "the PATCH body mentions `scheduled_date`" is not that fact: the
 * board's editor resubmits every field it rendered, so a PATCH that only takes
 * the operator off a parked job still carries the date it already had. Treating
 * that as a re-date would un-park the job on the write that empties it — the
 * exact failure the precondition exists to stop.
 *
 * So a date counts as moving only when the update names it AND the value
 * differs from what the job already holds. `job` may be null when the caller
 * could not read the row, in which case a written date is taken at face value.
 */
export function schedulingDatesMoving(
  update: Record<string, unknown>,
  job: Record<string, unknown> | null | undefined
): boolean {
  for (const col of SCHEDULING_DATE_COLUMNS) {
    if (!(col in update)) continue;
    if (!job) return true;
    if (!sameDateValue(update[col], (job as Record<string, unknown>)[col])) return true;
  }
  return false;
}

export interface RestartPlan {
  /** Phase rows to INSERT, in order. */
  insert: Array<{
    phase_number: number;
    started_on: string;
    scope_text: string | null;
    parked_on: string | null;
  }>;
  /** Phase rows to stamp as parked: `{ phase_number, parked_on }`. */
  closePhase: { phase_number: number; parked_on: string } | null;
  /** The phase number the job is on after the restart. */
  newPhaseNumber: number;
}

/**
 * Plan a restart. Pure — the route applies it.
 *
 * ── WHY PHASE 1 IS WRITTEN LAZILY, AT THE FIRST RESTART ─────────────────────
 *
 * A job that has never been restarted has NO phase rows, and every function
 * here reads that as one implicit phase. So parking alone writes nothing, the
 * five jobs sitting parked in production right now are untouched, and no
 * backfill is needed anywhere.
 *
 * The cost of that choice is that phase 1 has to be reconstructed at the moment
 * of the first restart — which is the last moment the original scope still
 * exists, because the restart is about to overwrite `job_orders.description`
 * with the new one. Capturing it here is what makes the founder's third
 * decision true: *both scopes kept; the new one is current*. Miss this and the
 * old wording is gone for good.
 *
 * `firstWorkedOn` should be the job's earliest PROVEN work date (from
 * `job_workday_evidence`); it falls back to the job's scheduled date, and then
 * to the restart date, so a job with no history still produces a valid phase 1
 * rather than a null that breaks day numbering.
 */
export function planRestart(args: {
  phases: readonly JobPhase[];
  /** Bare 'YYYY-MM-DD' the job comes back on. */
  restartOn: string;
  /** The new scope text for this run. */
  newScopeText: string | null;
  /** The scope in force BEFORE this restart — normally job_orders.description. */
  previousScopeText: string | null;
  /** Earliest proven work date, for reconstructing phase 1. */
  firstWorkedOn?: string | null;
  /** The job's scheduled_date, as a fallback for phase 1's start. */
  scheduledDate?: string | null;
  /** Date the previous run stopped — normally the day it was parked. */
  parkedOn?: string | null;
}): RestartPlan {
  const sorted = sortPhases(args.phases);
  const insert: RestartPlan['insert'] = [];

  if (sorted.length === 0) {
    // First restart: reconstruct the original run before overwriting it.
    const started =
      args.firstWorkedOn || args.scheduledDate || args.restartOn;
    insert.push({
      phase_number: 1,
      started_on: started,
      scope_text: args.previousScopeText,
      // The run that just ended IS phase 1 on a first restart, so it is stamped
      // here rather than by `closePhase` — which can only touch a row that
      // already exists.
      parked_on: args.parkedOn ?? null,
    });
  }

  const priorNumber =
    sorted.length > 0 ? sorted[sorted.length - 1].phase_number : 1;
  const newPhaseNumber = priorNumber + 1;

  insert.push({
    phase_number: newPhaseNumber,
    started_on: args.restartOn,
    scope_text: args.newScopeText,
    parked_on: null, // this is the live run now
  });

  // Stamp the run that just ended, so the ticket can say when work stopped
  // rather than inferring it. Only for a phase row that already exists — the
  // one being inserted above carries its `parked_on` from the start.
  const closePhase =
    sorted.length > 0 && args.parkedOn
      ? { phase_number: priorNumber, parked_on: args.parkedOn }
      : null;

  return { insert, closePhase, newPhaseNumber };
}

/**
 * How a phase heading reads on the printed ticket.
 *
 * The reader must never wonder whether "Day 1" means the job just started. The
 * founder's mental model is the sentence to reproduce: *this is day one of
 * getting back on it, and it's the fourth day we've been on this job.*
 *
 * A job that was never parked has one phase and gets the plain, unchanged
 * "Day 4" it has always had — the second clause would be noise.
 */
export function formatDayHeading(
  n: PhaseDayNumber,
  totalPhases: number
): string {
  if (totalPhases <= 1 || n.phaseDay === n.lifetimeDay) {
    return `Day ${n.lifetimeDay}`;
  }
  return `Day ${n.phaseDay} — day ${n.lifetimeDay} on the job`;
}
