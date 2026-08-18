/**
 * THE METRIC SET — every workflow signal, defined in one place.
 *
 * TO ADD THE SEVENTH SIGNAL: append a definition to WORKFLOW_METRICS below and
 * add its query to HealthDataSource. Nothing else changes — not the cron, not
 * the Telegram message, not the admin screen, not the history table. That was
 * the actual ask ("is there a loop function we can create"), as distinct from
 * the six examples that came with it.
 *
 * EVERY THRESHOLD BELOW IS A JUDGEMENT, NOT A LAW. They are set where a
 * reasonable person would want to hear about it, then deliberately loose enough
 * that a normal week is silent. Every one of the six breaches TODAY, which is
 * correct — these are six known-broken things, measured against production on
 * Aug 17 2026. As they get fixed the channel goes quiet, and going quiet is the
 * feature.
 *
 * COLUMN NAMES. Every column referenced through this file was checked against
 * information_schema on the live database before it was written. This matters
 * more than it sounds: PostgREST rejects an ENTIRE select if one column name is
 * wrong, so a single typo makes the whole feature return nothing and look
 * merely empty — and both `tsc --noEmit` and `npm run build` pass regardless.
 * Two routes shipped that exact bug this month.
 */

import type {
  CompletedJobRow,
  HealthDataSource,
  MetricDefinition,
  MetricSample,
  MetricUnit,
} from './types';

// ── Windows and thresholds, named so the reasoning is visible ────────────────

/**
 * How many recent finished jobs the completion metrics look at.
 *
 * A COUNT, not a date range. Patriot finishes a handful of jobs a week; over
 * "the last 30 days" the denominator can be 2, and 1-of-2 reads as a
 * catastrophic 50% when it is really a quiet fortnight. A rolling sample of the
 * last N finished jobs keeps the denominator stable and matches how the founder
 * said it: "percentage of actual users that get jobs completed and signed".
 */
export const COMPLETION_SAMPLE_SIZE = 25;

/** Closeouts are a daily habit, so two weeks is plenty to see the pattern. */
export const CLOSEOUT_WINDOW_DAYS = 14;

/** A month of timecards — long enough to smooth out a light week. */
export const TIMECARD_WINDOW_DAYS = 30;

/** Past this many days unassigned, a job is not "upcoming", it is forgotten. */
export const UNASSIGNED_AGING_DAYS = 3;

/**
 * "Active crew" = someone who filed a timecard in the last quarter, in a role
 * that gets paid off one.
 *
 * Explicitly NOT `profiles.active`. The office switches that flag off for
 * people who are still filing hours — Javi and David both are today — and
 * filtering on it would drop the denominator from 15 to 13 and hide the two
 * people whose labour is silently costing $0. A metric that conceals the
 * failure it exists to catch is worse than no metric.
 *
 * A ROLE LIST *is* used (`PAID_CREW_ROLES` in data-source.ts), because
 * salesmen and office staff are not paid off a timecard and flagging them
 * would be noise. Deleted profiles are excluded too — they are gone, and no
 * rate can be set on one.
 *
 * Patriot, Aug 17 2026: 15 people qualify, 2 have a rate.
 */
export const ACTIVE_CREW_WINDOW_DAYS = 90;

// ── Small helpers ───────────────────────────────────────────────────────────

/** Treat '', '   ' and null identically — an empty signature is not a signature. */
function nonEmpty(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Does this job have an actual signature ARTIFACT — something a court could be
 * shown — as opposed to a timestamp claiming one was taken?
 *
 * Three columns can hold one, and they are all in live use: `customer_signature`
 * and `completion_signature` hold inline data, `completion_signature_url` holds
 * a stored image. Checking only the first two undercounts: one Patriot job
 * (JOB-2026-343888) has the URL and nothing else, and it IS signed.
 */
export function hasSignatureArtifact(job: CompletedJobRow): boolean {
  return (
    nonEmpty(job.customer_signature) ||
    nonEmpty(job.completion_signature) ||
    nonEmpty(job.completion_signature_url)
  );
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** "3 of 15" — the fraction a person can check, next to every percentage. */
function fraction(numerator: number, denominator: number): string {
  return `${numerator} of ${denominator}`;
}

/** Render a measured value for a human: "20% (3 of 15)" or "8". */
export function formatMetricValue(
  unit: MetricUnit,
  value: number,
  numerator: number | null,
  denominator: number | null
): string {
  if (unit === 'count') return String(Math.round(value));
  const pct = `${Math.round(value * 100)}%`;
  if (numerator === null || denominator === null) return pct;
  return `${pct} (${fraction(numerator, denominator)})`;
}

/** Subtract days from a YYYY-MM-DD, staying in local calendar terms. */
export function shiftYMD(ymd: string, days: number): string {
  // parse LOCAL (never new Date('2026-08-17'), which is UTC midnight and lands
  // on the previous day in every US timezone), shift, then read local parts back
  // out (never toISOString().split('T')[0], the same bug from the other end).
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── The metrics ─────────────────────────────────────────────────────────────

/**
 * 1. SIGNED COMPLETIONS — the legal-liability one.
 *
 * Production, Aug 17: 3 of the last 15 finished jobs carry a real signature.
 * Seven have `completion_signed_at` set, so FOUR assert a signature was taken
 * and have nothing whatsoever behind it. A completion record claiming a
 * signature it cannot produce is worse than one that admits it has none, which
 * is why the phantom count is reported as its own sentence rather than folded
 * into the percentage.
 */
const signedCompletions: MetricDefinition = {
  key: 'signed_completions',
  label: 'Signed completions',
  unit: 'ratio',
  direction: 'higher_is_better',
  threshold: 0.7,
  why: 'A finished job with no signature is a bill you may not be able to defend.',
  href: '/dashboard/admin/completed-jobs',
  action: 'Check the completion step is actually asking for a signature on the phone.',
  async compute(source, ctx): Promise<MetricSample> {
    const jobs = await source.recentCompletedJobs(ctx.tenantId, COMPLETION_SAMPLE_SIZE);
    const withArtifact = jobs.filter(hasSignatureArtifact);
    // Claims a signature, cannot produce one. The dangerous set.
    const phantom = jobs.filter((j) => !hasSignatureArtifact(j) && nonEmpty(j.completion_signed_at));
    return {
      value: jobs.length === 0 ? 0 : withArtifact.length / jobs.length,
      numerator: withArtifact.length,
      denominator: jobs.length,
      detail: {
        phantomSignatures: phantom.length,
        phantomJobNumbers: phantom.slice(0, 5).map((j) => j.job_number).filter(Boolean),
      },
    };
  },
  sentence(sample) {
    const n = sample.numerator ?? 0;
    const d = sample.denominator ?? 0;
    const phantom = Number(sample.detail.phantomSignatures ?? 0);
    const head =
      n === d
        ? `All ${d} of the last ${d} finished ${plural(d, 'job has', 'jobs have')} a customer signature on file.`
        : `Only ${fraction(n, d)} of the last finished jobs have a customer signature on file.`;
    if (phantom === 0) return head;
    return `${head} ${phantom} more ${plural(phantom, 'says it was', 'say they were')} signed but ${plural(phantom, 'has', 'have')} nothing attached.`;
  },
};

/**
 * 2. STALLED AFTER CLOSEOUT — the one the founder described from memory.
 *
 * "They don't press completed job until the day after — no, they just click
 * complete day instead of job complete." Exactly right, and measurable: a
 * "Done for Today" whose job is STILL scheduled/assigned days later. The job
 * never completes, so it never invoices, so the money never arrives — and
 * nothing anywhere says so.
 *
 * Deliberately phrased as the leak (lower is better) rather than as a success
 * rate. The founder thinks about it as "they clicked the wrong button", and a
 * metric should be named the way the person reading it already thinks.
 */
const stalledAfterCloseout: MetricDefinition = {
  key: 'stalled_after_closeout',
  label: 'Closeouts that left the job stuck',
  unit: 'ratio',
  direction: 'lower_is_better',
  threshold: 0.25,
  why: 'A job stuck after the crew finished never completes, so it never gets invoiced.',
  href: '/dashboard/admin/active-jobs',
  action: 'Make "Done for Today" ask whether the whole job is finished.',
  async compute(source, ctx): Promise<MetricSample> {
    const since = shiftYMD(ctx.todayYMD, -CLOSEOUT_WINDOW_DAYS);
    const closeouts = await source.recentCloseouts(ctx.tenantId, since);
    // One job can be closed out on several days; judge the JOB, not the row,
    // or a five-day job counts its stall five times and swamps the ratio.
    const statusByJob = new Map<string, { status: string | null; jobNumber: string | null }>();
    for (const c of closeouts) {
      statusByJob.set(c.job_order_id, { status: c.job_status, jobNumber: c.job_number });
    }
    const jobs = Array.from(statusByJob.values());
    const stuck = jobs.filter((j) => j.status === 'scheduled' || j.status === 'assigned');
    // Moved on but NOT finished. These are not what this metric measures — the
    // crew did press something — but they have not invoiced either, so the
    // all-clear sentence must not imply they are done. Patriot today: 3 on
    // hold and 2 in progress behind a numerator of 6.
    const stillOpen = jobs.filter((j) => j.status === 'in_progress' || j.status === 'on_hold');
    return {
      value: jobs.length === 0 ? 0 : stuck.length / jobs.length,
      numerator: stuck.length,
      denominator: jobs.length,
      detail: {
        windowDays: CLOSEOUT_WINDOW_DAYS,
        stillOpen: stillOpen.length,
        stuckJobNumbers: stuck.slice(0, 5).map((j) => j.jobNumber).filter(Boolean),
      },
    };
  },
  sentence(sample) {
    const n = sample.numerator ?? 0;
    const d = sample.denominator ?? 0;
    const days = Number(sample.detail.windowDays ?? CLOSEOUT_WINDOW_DAYS);
    if (n === 0) {
      // NOT "moved forward" — of Patriot's 21 closeouts, 5 sit on hold or in
      // progress, un-invoiced. The claim this metric can honestly make is the
      // narrow one: nothing is still sitting where the crew left it.
      const open = Number(sample.detail.stillOpen ?? 0);
      const head = `None of the ${d} ${plural(d, 'job', 'jobs')} the crew closed out in the last ${days} days ${plural(d, 'is', 'are')} still sitting where the crew left ${plural(d, 'it', 'them')}.`;
      if (open === 0) return head;
      return `${head} ${open} ${plural(open, 'is', 'are')} still open — on hold or in progress — so ${plural(open, 'it has', 'they have')} not invoiced yet.`;
    }
    const examples = (sample.detail.stuckJobNumbers as string[] | undefined) ?? [];
    const tail = examples.length ? ` (${examples.slice(0, 3).join(', ')})` : '';
    return `${fraction(n, d)} ${plural(d, 'job', 'jobs')} the crew closed out in the last ${days} days ${plural(n, 'is', 'are')} still sitting unfinished${tail}. Nobody has pressed "job complete", so ${plural(n, 'it', 'they')} will never invoice.`;
  },
};

/**
 * 3. TIMECARDS TAGGED TO A JOB.
 *
 * 61 of 140 in the last 30 days (298 is the all-time figure and is NOT what
 * this measures). When a timecard does not say which job it was for, labor
 * cost has to be reconstructed from where the office happened to place someone
 * on the schedule — which is a guess wearing a number's clothes.
 */
const timecardsTagged: MetricDefinition = {
  key: 'timecards_tagged_to_job',
  label: 'Timecards tagged to a job',
  unit: 'ratio',
  direction: 'higher_is_better',
  threshold: 0.6,
  why: 'An untagged timecard means job cost is guessed from the schedule instead of read.',
  href: '/dashboard/admin/timecards',
  action: 'Have clock-in carry the job when the operator is dispatched to one.',
  async compute(source, ctx): Promise<MetricSample> {
    const since = shiftYMD(ctx.todayYMD, -TIMECARD_WINDOW_DAYS);
    const cards = await source.recentTimecards(ctx.tenantId, since);
    const tagged = cards.filter((c) => !!c.job_order_id);
    return {
      value: cards.length === 0 ? 0 : tagged.length / cards.length,
      numerator: tagged.length,
      denominator: cards.length,
      detail: { windowDays: TIMECARD_WINDOW_DAYS, untagged: cards.length - tagged.length },
    };
  },
  sentence(sample) {
    const n = sample.numerator ?? 0;
    const d = sample.denominator ?? 0;
    const days = Number(sample.detail.windowDays ?? TIMECARD_WINDOW_DAYS);
    const untagged = Number(sample.detail.untagged ?? d - n);
    if (untagged === 0) {
      return `All ${d} ${plural(d, 'timecard', 'timecards')} from the last ${days} days say which job the hours were for.`;
    }
    return `Only ${fraction(n, d)} timecards from the last ${days} days say which job the hours were for. The other ${untagged} have to be matched to a job by hand in the office.`;
  },
};

/**
 * 4. UNASSIGNED JOBS AGING ON THE BOARD.
 *
 * Live jobs with nobody in ANY crew slot — not the operator slot, not the
 * helper slot, not the job_crew table — already past their scheduled date, OR
 * never given one at all (the query covers both; so does the sentence).
 * Mostly print-only tickets that will never be assigned to anyone; they sit on
 * the board forever, and every stale card makes the board a little less worth
 * reading.
 *
 * A COUNT, not a ratio: zero is a perfectly normal answer, and it should read
 * as zero rather than as an undefined percentage.
 */
const unassignedAgingJobs: MetricDefinition = {
  key: 'unassigned_aging_jobs',
  label: 'Unassigned jobs aging on the board',
  unit: 'count',
  direction: 'lower_is_better',
  threshold: 5,
  why: 'A live job nobody is on, past its date, will sit there until somebody clears it.',
  href: '/dashboard/admin/schedule-board',
  action: 'Assign them, or close the ones that were only ever printed.',
  async compute(source, ctx): Promise<MetricSample> {
    const cutoff = shiftYMD(ctx.todayYMD, -UNASSIGNED_AGING_DAYS);
    const jobs = await source.unassignedAgingJobs(ctx.tenantId, cutoff);
    // The query also picks up jobs with NO scheduled_date, which are forgotten
    // in a different way. Counted here, and said separately below — a sentence
    // claiming a job is "past its scheduled date" when it never had one is the
    // small kind of untrue that costs the whole feature its credibility.
    const neverScheduled = jobs.filter((j) => !j.scheduled_date).length;
    return {
      value: jobs.length,
      numerator: jobs.length,
      // No denominator on purpose: this is a count, so 0 must be a real
      // measurement rather than an empty window. See the runner's no_data rule.
      denominator: null,
      detail: {
        agingDays: UNASSIGNED_AGING_DAYS,
        neverScheduled,
        jobNumbers: jobs.slice(0, 5).map((j) => j.job_number).filter(Boolean),
      },
    };
  },
  sentence(sample) {
    const n = sample.numerator ?? 0;
    const days = Number(sample.detail.agingDays ?? UNASSIGNED_AGING_DAYS);
    if (n === 0) {
      return `No live jobs are sitting unassigned — none past their scheduled date, and none without one.`;
    }
    const examples = (sample.detail.jobNumbers as string[] | undefined) ?? [];
    const tail = examples.length ? ` (${examples.slice(0, 3).join(', ')})` : '';
    const never = Number(sample.detail.neverScheduled ?? 0);
    const stale = n - never;
    const head = `${n} live ${plural(n, 'job has', 'jobs have')} nobody assigned`;
    if (never === 0) {
      return `${head} and ${plural(n, 'is', 'are')} more than ${days} days past ${plural(n, 'its', 'their')} scheduled date${tail}.`;
    }
    if (stale === 0) {
      return `${head} and no scheduled date at all${tail}.`;
    }
    return `${head} — ${stale} more than ${days} days past ${plural(stale, 'its', 'their')} scheduled date, and ${never} with no date at all${tail}.`;
  },
};

/**
 * 5. CREW WITH A PAY RATE.
 *
 * 2 of 15 today. With no rate, labor cost multiplies out to $0 — so job profit
 * looks flattering, revenue-per-employee cannot be computed at all, and neither
 * failure announces itself. A silently wrong number is worse than a missing
 * one, which is the same principle the 'unknown' status exists to enforce.
 */
const crewPayRateCoverage: MetricDefinition = {
  key: 'crew_pay_rate_coverage',
  label: 'Crew with a pay rate set',
  unit: 'ratio',
  direction: 'higher_is_better',
  threshold: 0.9,
  why: 'No pay rate means labor cost computes to $0 and job profit silently lies.',
  href: '/dashboard/admin/team-profiles',
  action: 'Set an hourly rate on each crew profile.',
  async compute(source, ctx): Promise<MetricSample> {
    const since = shiftYMD(ctx.todayYMD, -ACTIVE_CREW_WINDOW_DAYS);
    const crew = await source.activeCrew(ctx.tenantId, since);
    const withRate = crew.filter((c) => typeof c.hourly_rate === 'number' && c.hourly_rate > 0);
    return {
      value: crew.length === 0 ? 0 : withRate.length / crew.length,
      numerator: withRate.length,
      denominator: crew.length,
      detail: {
        windowDays: ACTIVE_CREW_WINDOW_DAYS,
        missingNames: crew
          .filter((c) => !(typeof c.hourly_rate === 'number' && c.hourly_rate > 0))
          .slice(0, 5)
          .map((c) => c.full_name)
          .filter(Boolean),
      },
    };
  },
  sentence(sample) {
    const n = sample.numerator ?? 0;
    const d = sample.denominator ?? 0;
    const missing = d - n;
    const days = Number(sample.detail.windowDays ?? ACTIVE_CREW_WINDOW_DAYS);
    if (missing === 0) {
      return `All ${d} crew who worked in the last ${days} days have a pay rate set.`;
    }
    // "who worked in the last N days" is the literal denominator — every paid
    // role that filed a timecard in the window, switched on or not.
    return `Only ${fraction(n, d)} crew who worked in the last ${days} days have a pay rate set. Labor cost comes out as $0 for the other ${missing}, so job profit is wrong.`;
  },
};

/**
 * 6. UNACCOUNTED COMPLETIONS.
 *
 * A job marked completed with NO signature artifact, NO claim that one was
 * taken, and NO office sign-off. Eight of the last fifteen. Somebody decided
 * these were done and the system has no idea who, when, or on what basis.
 *
 * This is deliberately distinct from metric 1: a job can be honestly closed by
 * the office without a customer signature (`office_completed_at` records who
 * did it and why), and that is a legitimate path. This metric counts only the
 * jobs that took NO path at all.
 */
const unaccountedCompletions: MetricDefinition = {
  key: 'unaccounted_completions',
  label: 'Completions with no accountability record',
  unit: 'count',
  direction: 'lower_is_better',
  threshold: 2,
  why: 'A job marked done by nobody, with nothing attached, cannot be defended or explained.',
  href: '/dashboard/admin/completed-jobs',
  action: 'Require either a signature or an office sign-off before a job can be completed.',
  async compute(source, ctx): Promise<MetricSample> {
    const jobs = await source.recentCompletedJobs(ctx.tenantId, COMPLETION_SAMPLE_SIZE);
    const unaccounted = jobs.filter(
      (j) =>
        !hasSignatureArtifact(j) &&
        !nonEmpty(j.completion_signed_at) &&
        !nonEmpty(j.office_completed_at)
    );
    return {
      value: unaccounted.length,
      numerator: unaccounted.length,
      // Sample size IS the denominator here even though the value is a count:
      // with no finished jobs at all there is nothing to say, and the runner
      // turns denominator === 0 into an honest "no data" rather than a
      // congratulatory zero.
      denominator: jobs.length,
      detail: { jobNumbers: unaccounted.slice(0, 5).map((j) => j.job_number).filter(Boolean) },
    };
  },
  sentence(sample) {
    const n = sample.numerator ?? 0;
    const d = sample.denominator ?? 0;
    if (n === 0) {
      return `All ${d} of the last finished jobs have either a signature or an office sign-off behind them.`;
    }
    const examples = (sample.detail.jobNumbers as string[] | undefined) ?? [];
    const tail = examples.length ? ` (${examples.slice(0, 3).join(', ')})` : '';
    return `${fraction(n, d)} of the last finished jobs were closed with no signature, no signature claim and no office sign-off${tail}. There is no record of who decided they were done.`;
  },
};

/**
 * The registry. Order is the order the founder reads them in on his phone, so
 * money and legal exposure come first and housekeeping last.
 */
export const WORKFLOW_METRICS: readonly MetricDefinition[] = [
  signedCompletions,
  stalledAfterCloseout,
  unaccountedCompletions,
  timecardsTagged,
  crewPayRateCoverage,
  unassignedAgingJobs,
];

export function metricByKey(key: string): MetricDefinition | undefined {
  return WORKFLOW_METRICS.find((m) => m.key === key);
}

/** Exported for tests — a definition list is only useful if it is consistent. */
export type { HealthDataSource, MetricDefinition, MetricSample };
