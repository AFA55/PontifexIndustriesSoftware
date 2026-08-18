/**
 * WORKFLOW HEALTH — the shapes.
 *
 * The founder's ask, Aug 17: "Is there a loop function we can create to know
 * when parts of workflow is failing or not working properly? … They don't press
 * completed job until the day after — no, they just click complete day instead
 * of job complete."
 *
 * He is not asking for six numbers. He is asking to be TOLD when the funnel
 * leaks, instead of finding out months later because somebody happened to run a
 * query. So the unit of this feature is a METRIC DEFINITION, and adding the
 * seventh signal must be a definition in `metrics.ts` — a name, a query, a
 * threshold, a direction and an English sentence — never a new route, a new
 * cron or a new page.
 */

/** Which way is good. Decides both the breach test and the trend arrow. */
export type MetricDirection = 'higher_is_better' | 'lower_is_better';

/** A ratio renders as a percentage with its fraction; a count renders bare. */
export type MetricUnit = 'ratio' | 'count';

export type MetricStatus = 'ok' | 'breach' | 'unknown';

/**
 * WHY 'unknown' EXISTS, and why it is not just a null value.
 *
 * A dashboard that reads 0% because a select threw is the silent-failure class
 * this platform keeps hitting. `tsc` and `npm run build` both pass happily with
 * a column name that does not exist; PostgREST then rejects the entire select
 * on that one bad name, the route returns nothing, and the feature looks merely
 * empty rather than broken. Same shape as a route that 404s.
 *
 * So a metric that cannot be computed is never allowed to look like a metric
 * whose answer is zero:
 *
 *   'error'   the query failed. This is a BUG and alerts loudly.
 *   'no_data' the window was genuinely empty — a quiet week, a brand-new
 *             tenant. Honest, expected, and alerts NEVER.
 */
export type UnknownReason = 'error' | 'no_data';

/** What a metric's compute step returns when it succeeds. */
export interface MetricSample {
  /** The measured number: a 0..1 fraction for ratios, a bare count otherwise. */
  value: number;
  numerator: number | null;
  denominator: number | null;
  /** Facts the English sentence needs — job numbers, secondary counts. */
  detail: Record<string, unknown>;
}

/**
 * A metric definition. This is the extension point: everything else in this
 * feature — the cron, the message, the screen, the history table — iterates
 * over `WORKFLOW_METRICS` and knows nothing about any individual signal.
 */
export interface MetricDefinition {
  /** Stable identifier. Stored in the DB, so renaming one orphans its history. */
  key: string;
  /** Short human name. "Signed completions", not "signature_rate". */
  label: string;
  unit: MetricUnit;
  direction: MetricDirection;
  /**
   * Breach when the value crosses this. For 'higher_is_better' a value BELOW
   * the threshold breaches; for 'lower_is_better', ABOVE it.
   */
  threshold: number;
  /** One line on the screen saying what this measures and why it matters. */
  why: string;
  /** Measure it. Throws on a data-access failure — the runner turns that into 'error'. */
  compute: (source: HealthDataSource, ctx: MetricContext) => Promise<MetricSample>;
  /**
   * The whole point of the feature: what the number MEANS, for a non-engineer
   * reading on a phone. "Only 2 of the last 15 finished jobs have a customer
   * signature on file" — never "signature_rate: 0.13".
   */
  sentence: (sample: MetricSample) => string;
  /** What to actually do about it. */
  action: string;
  /** Where to go and do it. */
  href: string;
}

/** Everything a compute step needs that is not the data itself. */
export interface MetricContext {
  tenantId: string;
  /** Today's date in the TENANT's timezone, YYYY-MM-DD. Never the server's. */
  todayYMD: string;
  /** The tenant's IANA timezone, for any wall-clock reasoning. */
  timezone: string;
}

/** One metric, measured (or honestly not measured), for one tenant. */
export interface MetricResult {
  key: string;
  label: string;
  unit: MetricUnit;
  direction: MetricDirection;
  threshold: number;
  why: string;
  status: MetricStatus;
  /** NULL if and only if status is 'unknown'. Mirrors the DB CHECK constraint. */
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  detail: Record<string, unknown>;
  unknownReason: UnknownReason | null;
  error: string | null;
  /** Plain English. Always populated — including when the metric could not be measured. */
  sentence: string;
  action: string;
  href: string;
}

/** A previous measurement, for the trend. */
export interface PriorMeasurement {
  value: number | null;
  status: MetricStatus;
  measuredAt: string;
}

/** A result plus how it compares to roughly a week ago. */
export interface MetricResultWithTrend extends MetricResult {
  /** The comparison point, or null when there is no history yet. */
  prior: PriorMeasurement | null;
  /** value - prior.value, or null when either side is unmeasured. */
  delta: number | null;
  /** Has it got better, worse, or stayed put? Direction-aware. */
  trend: 'better' | 'worse' | 'flat' | 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// The data-access port.
//
// WHY A PORT RATHER THAN CALLING supabaseAdmin DIRECTLY IN EACH METRIC.
// Two reasons, both learned here the hard way.
//
// 1. TESTABILITY OF THE FAILURE PATH. The requirement is that a metric which
//    CANNOT be computed says so rather than reporting zero. That path is only
//    trustworthy if it is tested, and you cannot make the real supabase client
//    fail on demand without a network. With a port, the test hands the runner a
//    source whose method throws, and asserts the result is 'unknown'/'error'
//    with value null — never 0.
//
// 2. EVERY QUERY IS FORCED TO NAME ITS TENANT. supabaseAdmin bypasses RLS
//    entirely, so a forgotten `.eq('tenant_id', …)` is a cross-tenant leak with
//    no safety net beneath it. Here `tenantId` is the first parameter of every
//    single method — a query that does not scope itself does not typecheck.
// ─────────────────────────────────────────────────────────────────────────────

export interface CompletedJobRow {
  id: string;
  job_number: string | null;
  customer_signature: string | null;
  completion_signature: string | null;
  completion_signature_url: string | null;
  completion_signed_at: string | null;
  office_completed_at: string | null;
  work_completed_at: string | null;
}

export interface CloseoutRow {
  job_order_id: string;
  log_date: string;
  /** The job's status NOW — did pressing "Done for Today" ever move it on? */
  job_status: string | null;
  job_number: string | null;
}

export interface TimecardRow {
  id: string;
  job_order_id: string | null;
}

export interface AgingJobRow {
  id: string;
  job_number: string | null;
  scheduled_date: string | null;
}

export interface CrewRow {
  id: string;
  full_name: string | null;
  hourly_rate: number | null;
}

export interface HealthDataSource {
  /**
   * The most recent `limit` jobs in status 'completed', newest first. A rolling
   * COUNT rather than a date window on purpose: this shop finishes a handful of
   * jobs a week, so "the last 30 days" collapses to a denominator of two and
   * every percentage becomes noise. "The last 15 finished jobs" is also how the
   * founder said it out loud.
   */
  recentCompletedJobs(tenantId: string, limit: number): Promise<CompletedJobRow[]>;
  /** "Done for Today" closeouts on or after `sinceYMD`, with the job's current status. */
  recentCloseouts(tenantId: string, sinceYMD: string): Promise<CloseoutRow[]>;
  /** Timecards dated on or after `sinceYMD`. */
  recentTimecards(tenantId: string, sinceYMD: string): Promise<TimecardRow[]>;
  /** Live jobs with nobody in ANY crew slot, scheduled before `cutoffYMD` (or never scheduled). */
  unassignedAgingJobs(tenantId: string, cutoffYMD: string): Promise<AgingJobRow[]>;
  /** Crew who actually worked recently — see the metric for why "active" means that. */
  activeCrew(tenantId: string, sinceYMD: string): Promise<CrewRow[]>;
}
