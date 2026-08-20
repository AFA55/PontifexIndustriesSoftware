/**
 * WHICH JOB IS THIS PERSON CLOCKING IN TO?
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT WENT WRONG (Aug 20 2026, 07:17, in production, with the crew on site)
 *
 * Conrade clocked in and his card was stamped JOB-2026-654657 — Sterling — a
 * job he had COMPLETED at 16:13 the previous afternoon. The office could not
 * dispatch him, because the board believed he was already somewhere. His real
 * job that morning was JOB-2026-974669.
 *
 * The clock-in route asked the per-day ledger where he was and took whatever
 * came back:
 *
 *     .eq('assignment_date', todayDate)
 *     .or(`operator_id.eq.${id},helper_id.eq.${id}`)
 *     .limit(1)
 *
 * Two independent defects, either of which alone produces a wrong answer:
 *
 *   1. NO STATUS FILTER. A completed job was a valid clock-in target. Nothing
 *      prunes `job_daily_assignments` when a job closes, so a stale row sat on
 *      today's date pointing at yesterday's finished work — and it was believed.
 *
 *   2. `.limit(1)` WITH NO `ORDER BY`. He had TWO rows for Aug 20. Postgres is
 *      free to return either; there is no default order. Even with the stale row
 *      gone, a crew member legitimately on two jobs in a day — which the board
 *      supports and sequences — got an arbitrary one of them. An arbitrary
 *      answer that is right most mornings is worse than no answer, because it
 *      is trusted.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE RULE: THE EARLIEST-SEQUENCED JOB THAT IS STILL OPEN.
 *
 * The founder's model is that a day starts on job one and moves on at each
 * In Route press (lib/job-day-boundary.ts states the billing half of the same
 * model). At 07:17 nothing has been pressed yet, so the presses cannot order
 * the morning — but the board's own ordering can, and it is already the
 * authority everywhere else: `job_daily_assignments.day_sequence` drives the
 * operator's "Job #1 of your day" list (app/dashboard/my-jobs/page.tsx) and the
 * gate that locks job #2 until job #1 is done (job-orders/[id]/status).
 *
 * So: sort the day's candidates and take the first OPEN one.
 *
 *   1. `day_sequence` ascending — job one before job two. Unsequenced
 *      candidates (the job-level and crew fallbacks carry no sequence) sort
 *      after every sequenced one.
 *   2. then the earliest recorded start ON THAT DATE, ascending, unpressed
 *      last — once the day is under way the job they actually turned toward
 *      outranks one they have not.
 *   3. then `scheduled_date` descending — a job scheduled for today over one
 *      carried in from last week. This preserves what the job-level fallback
 *      did before this file existed.
 *   4. then `job_order_id` — a stable tiebreak, so two otherwise identical
 *      candidates never resolve differently between two requests.
 *
 * Closed jobs are removed BEFORE the sort, so "job one is finished" naturally
 * moves the day on to job two — which is the founder's model, not a special
 * case bolted onto it. A person clocking back in after lunch, with job one
 * completed at 11:40, lands on job two.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * "OPEN" IS NARROWER FOR THE LEDGER THAN FOR A GUESS.
 *
 * By default only `CLOSED_JOB_STATUSES` — completed, cancelled, archived — are
 * refused. That is deliberately the narrowest possible refusal, and it is what
 * the DATED day ledger gets: the office naming a person, a job and a date is
 * evidence, and it outranks a status flag nobody cleared. JOB-2026-974669
 * (ClemTenn) had sat `on_hold` since Aug 14 with `on_hold_released_at` null,
 * and the office placed Conrade on it for Aug 20 anyway — it was his real job
 * that morning. Refusing `on_hold` here would have swapped the wrong job for no
 * job, which fixes the complaint and not the operator's day.
 *
 * The job-level-slot and `job_crew` fallbacks are UNDATED inferences, so they
 * pass the wider `UNCLOCKABLE_INFERRED_JOB_STATUSES` — exactly the exclusion
 * those two queries already carried before this file existed. Nothing about
 * those two paths gets looser here; only the ledger gets its own, correct,
 * narrower rule.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHEN NOTHING QUALIFIES, THE ANSWER IS NULL.
 *
 * Not "the closest thing we found". `timecards.job_order_id` is a payroll
 * record, and the read-time deriver (lib/timecard-job-context.ts) already
 * handles a null by saying "not recorded". A null is a gap the office can see
 * and fill; a guess is indistinguishable from something the operator did.
 *
 * Everything here is PURE — no supabase, no clock — so every rule above is a
 * unit test in lib/clock-in-job.test.ts rather than a claim in a comment.
 */

import { CLOSED_JOB_STATUSES, isClockInEligibleStatus, isClosedJobStatus } from './job-status';

/** One place the person might be today, from any of the three lookups. */
export interface ClockInJobCandidate {
  job_order_id: string;
  /** `job_orders.status`. Unknown/absent is treated as live — see job-status.ts. */
  status?: string | null;
  /** `job_daily_assignments.day_sequence`, when the office sequenced the day. */
  day_sequence?: number | null;
  /**
   * The earliest start stamp recorded for this job ON the clock-in date, or
   * null when it has not been pressed today. Callers derive it with
   * `jobStartOnDate` so the same day-guard applies as in the billing split.
   */
  started_at?: string | null;
  /** `job_orders.scheduled_date` (YYYY-MM-DD). */
  scheduled_date?: string | null;
}

export interface ClockInJobResolution {
  /** The job to stamp on the timecard, or null when nothing qualified. */
  jobOrderId: string | null;
  /** The winning candidate, for logging. Null when nothing qualified. */
  chosen: ClockInJobCandidate | null;
  /**
   * Candidates dropped because the job is CLOSED — the Aug 20 signature, and
   * the only pruning canary that exists until something prunes the ledger.
   * Callers log these with the ids so a stale row is visible the first morning
   * it misleads someone rather than the morning someone notices.
   */
  closed: ClockInJobCandidate[];
  /** Candidates dropped for any other ineligible status (on_hold, …). */
  ineligible: ClockInJobCandidate[];
  /** True when more than one OPEN candidate qualified and the sort decided. */
  contested: boolean;
}

export interface PickClockInJobOptions {
  /**
   * Statuses to refuse. Defaults to CLOSED-ONLY, which is what the DATED day
   * ledger gets: the office naming a person, a job and a date outranks a status
   * flag nobody cleared. See the warning on `UNCLOCKABLE_INFERRED_JOB_STATUSES`
   * — refusing `on_hold` here would have turned Conrade's real Aug 20 job into
   * a null. Callers working from an UNDATED inference (a job-level crew slot,
   * the `job_crew` list) pass the wider set.
   */
  refuse?: readonly string[];
}

const NO_SEQUENCE = Number.MAX_SAFE_INTEGER;

function toMs(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Collapse candidates that name the same job.
 *
 * The ledger can hold more than one row for a job on a date (the office moves
 * crew around), and the three lookups can each surface the same job. Merging
 * keeps the MOST specific value of every field — the lowest `day_sequence`, the
 * earliest `started_at`, and any status/date we learned — so a row that happens
 * to arrive second cannot erase what the first one knew.
 */
function dedupe(candidates: ClockInJobCandidate[]): ClockInJobCandidate[] {
  const byJob = new Map<string, ClockInJobCandidate>();
  for (const c of candidates) {
    if (!c?.job_order_id) continue;
    const prev = byJob.get(c.job_order_id);
    if (!prev) {
      byJob.set(c.job_order_id, { ...c });
      continue;
    }
    const prevSeq = prev.day_sequence ?? null;
    const nextSeq = c.day_sequence ?? null;
    if (nextSeq != null && (prevSeq == null || nextSeq < prevSeq)) prev.day_sequence = nextSeq;

    const prevStart = toMs(prev.started_at);
    const nextStart = toMs(c.started_at);
    if (nextStart != null && (prevStart == null || nextStart < prevStart)) prev.started_at = c.started_at;

    if (prev.status == null && c.status != null) prev.status = c.status;
    if (prev.scheduled_date == null && c.scheduled_date != null) prev.scheduled_date = c.scheduled_date;
  }
  return Array.from(byJob.values());
}

/** The sort documented in the header, as a comparator. Total and stable. */
export function compareClockInCandidates(a: ClockInJobCandidate, b: ClockInJobCandidate): number {
  const aSeq = a.day_sequence ?? NO_SEQUENCE;
  const bSeq = b.day_sequence ?? NO_SEQUENCE;
  if (aSeq !== bSeq) return aSeq - bSeq;

  const aStart = toMs(a.started_at);
  const bStart = toMs(b.started_at);
  if (aStart !== bStart) {
    if (aStart == null) return 1; // unpressed sorts after anything pressed
    if (bStart == null) return -1;
    return aStart - bStart;
  }

  // Later scheduled_date first — today's job over one carried in from last week.
  const aDate = a.scheduled_date ?? '';
  const bDate = b.scheduled_date ?? '';
  if (aDate !== bDate) {
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate < bDate ? 1 : -1;
  }

  return a.job_order_id.localeCompare(b.job_order_id);
}

/**
 * Pick the job a clock-in belongs to, or return null.
 *
 * Never throws, never guesses, and never depends on the order the caller
 * happened to collect its candidates in.
 */
export function pickClockInJob(
  candidates: ClockInJobCandidate[] | null | undefined,
  options: PickClockInJobOptions = {}
): ClockInJobResolution {
  const refuse = options.refuse ?? CLOSED_JOB_STATUSES;
  const closed: ClockInJobCandidate[] = [];
  const ineligible: ClockInJobCandidate[] = [];
  const open: ClockInJobCandidate[] = [];

  for (const c of dedupe(candidates ?? [])) {
    if (isClosedJobStatus(c.status)) {
      closed.push(c);
      continue;
    }
    if (!isClockInEligibleStatus(c.status, refuse)) {
      ineligible.push(c);
      continue;
    }
    open.push(c);
  }

  if (open.length === 0) {
    return { jobOrderId: null, chosen: null, closed, ineligible, contested: false };
  }

  open.sort(compareClockInCandidates);
  return {
    jobOrderId: open[0].job_order_id,
    chosen: open[0],
    closed,
    ineligible,
    contested: open.length > 1,
  };
}
