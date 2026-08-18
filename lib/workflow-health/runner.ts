/**
 * THE LOOP — measure, compare, decide whether to say anything, say it once.
 *
 * Everything in this file is PURE except `runMetrics` (which calls the data
 * source) and nothing here touches the network. The alert DECISION in
 * particular is pure and unit-tested, because "should this interrupt the
 * founder?" is the judgement that decides whether the whole feature gets used
 * or muted, and it is not something to find out about in production.
 *
 * THE DISCIPLINE, in one rule: report a CHANGE, not a state.
 *
 * A digest that fires every morning saying the same six things gets filed under
 * background noise within a week. The proof is already in this database — the
 * crew have 16 unread in-app notifications, and the Platform Hub the founder
 * was told to check has 222 unread alert rows and has never been opened. A
 * channel is only worth having if a message arriving means something new
 * happened.
 */

import type {
  HealthDataSource,
  MetricDefinition,
  MetricResult,
  MetricResultWithTrend,
  MetricStatus,
  MetricContext,
  PriorMeasurement,
} from './types';
import { formatMetricValue } from './metrics';
import { escapeMarkdownV2 } from '@/lib/telegram';

/** A sustained breach repeats at most this often. Weekly, not daily. */
export const SUSTAINED_REALERT_DAYS = 7;

/** How far back to look for the "…, down from X last week" comparison. */
export const TREND_LOOKBACK_DAYS = 5;

/** A ratio has to move this far to count as a real change rather than jitter. */
export const MATERIAL_RATIO_DELTA = 0.1;

/** A count has to move at least this much, or 25%, whichever is larger. */
export const MATERIAL_COUNT_DELTA = 2;

/**
 * A baseline younger than this is not a comparison, it is the same reading
 * twice. Without this floor the first day of any tenant's history reports
 * "about the same" against a measurement taken four minutes earlier — a claim
 * that sounds like reassurance and contains no information whatsoever.
 */
export const MIN_BASELINE_AGE_MS = 12 * 60 * 60 * 1000;

// ── History ─────────────────────────────────────────────────────────────────

/** One previously stored measurement, as read back from workflow_health_runs. */
export interface HistoryRow {
  metric_key: string;
  status: MetricStatus;
  value: number | null;
  measured_at: string;
  alerted_at: string | null;
}

/** Newest first. Sorting here rather than trusting the caller keeps it pure. */
function byNewest(rows: HistoryRow[]): HistoryRow[] {
  return [...rows].sort(
    (a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime()
  );
}

/** The run immediately before this one — the "did it just change?" comparison. */
export function selectPrevious(history: HistoryRow[]): HistoryRow | null {
  return byNewest(history)[0] ?? null;
}

/**
 * The last TWO runs, which is what the alert decision actually needs.
 *
 * `previous` answers "did this change since yesterday?" and `beforePrevious`
 * answers "has the change held for two runs?" — the second question exists
 * because a metric sitting one unit from its threshold (6 aging jobs against a
 * limit of 5) otherwise crosses back and forth and messages every single day
 * about the same one job.
 */
export function selectPreviousTwo(history: HistoryRow[]): {
  previous: HistoryRow | null;
  beforePrevious: HistoryRow | null;
} {
  const sorted = byNewest(history);
  return { previous: sorted[0] ?? null, beforePrevious: sorted[1] ?? null };
}

/**
 * The trend baseline: the newest measurement that is at least
 * TREND_LOOKBACK_DAYS old, so "down from last week" means roughly a week.
 *
 * Falls back to the OLDEST row available when nothing is that old yet — on day
 * three of a new tenant, comparing to two days ago is far better than showing
 * no trend at all, and the returned row carries its own timestamp so the UI can
 * say how long ago it actually was rather than claiming "last week".
 */
export function selectTrendBaseline(
  history: HistoryRow[],
  nowMs: number,
  lookbackDays: number = TREND_LOOKBACK_DAYS
): HistoryRow | null {
  const sorted = byNewest(history).filter((r) => r.status !== 'unknown' && r.value !== null);
  if (sorted.length === 0) return null;
  const cutoff = nowMs - lookbackDays * 24 * 60 * 60 * 1000;
  const aged = sorted.find((r) => new Date(r.measured_at).getTime() <= cutoff);
  if (aged) return aged;

  // Fall back to the oldest reading available — but only if it is old enough to
  // mean anything. Comparing this morning's number to this morning's number
  // produces a confident "about the same" that says nothing at all.
  const oldest = sorted[sorted.length - 1];
  return nowMs - new Date(oldest.measured_at).getTime() >= MIN_BASELINE_AGE_MS ? oldest : null;
}

/** When this metric last actually appeared in a message. */
export function lastAlertAt(history: HistoryRow[]): string | null {
  const alerted = byNewest(history).find((r) => !!r.alerted_at);
  return alerted?.alerted_at ?? null;
}

// ── Measuring ───────────────────────────────────────────────────────────────

/**
 * Decide ok / breach / unknown from a definition and a sample.
 *
 * THE `denominator === 0` RULE. An empty window is NOT a score of zero. "0 of 0
 * finished jobs were signed" is 0%, which would render as a catastrophic
 * failure on a week when the crew simply had no jobs. Metrics that carry a
 * denominator therefore report `no_data`, which never alerts. Count metrics
 * (`denominator: null`) are exempt: for them zero is a genuine, and good,
 * measurement.
 */
export function evaluateStatus(
  def: MetricDefinition,
  value: number,
  denominator: number | null
): { status: MetricStatus; unknownReason: 'no_data' | null } {
  if (denominator === 0) return { status: 'unknown', unknownReason: 'no_data' };
  const breached =
    def.direction === 'higher_is_better' ? value < def.threshold : value > def.threshold;
  return { status: breached ? 'breach' : 'ok', unknownReason: null };
}

/**
 * Measure one metric, and NEVER let a failure look like a zero.
 *
 * Any throw from the data source — a bad column name, a timeout, a null tenant
 * — lands here and becomes status 'unknown' with `value: null` and the real
 * error message attached. The one outcome this function will not produce is a
 * confident number that nobody computed.
 */
export async function runMetric(
  def: MetricDefinition,
  source: HealthDataSource,
  ctx: MetricContext
): Promise<MetricResult> {
  const base = {
    key: def.key,
    label: def.label,
    unit: def.unit,
    direction: def.direction,
    threshold: def.threshold,
    why: def.why,
    action: def.action,
    href: def.href,
  };

  try {
    const sample = await def.compute(source, ctx);
    const { status, unknownReason } = evaluateStatus(def, sample.value, sample.denominator);

    if (status === 'unknown') {
      return {
        ...base,
        status,
        value: null,
        numerator: sample.numerator,
        denominator: sample.denominator,
        detail: sample.detail,
        unknownReason,
        error: null,
        sentence: `Nothing to measure yet — no ${def.label.toLowerCase()} data in this window.`,
      };
    }

    return {
      ...base,
      status,
      value: sample.value,
      numerator: sample.numerator,
      denominator: sample.denominator,
      detail: sample.detail,
      unknownReason: null,
      error: null,
      sentence: def.sentence(sample),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ...base,
      status: 'unknown',
      value: null,
      numerator: null,
      denominator: null,
      detail: {},
      unknownReason: 'error',
      error: message,
      // Said out loud, because a dashboard reading 0% from a failed query is
      // exactly the silent failure this whole feature exists to end.
      sentence: `Could not measure "${def.label}" — the check itself failed (${message}). This is NOT zero; it is unknown.`,
    };
  }
}

/** Run every metric in the registry. One failing metric never stops the others. */
export async function runMetrics(
  definitions: readonly MetricDefinition[],
  source: HealthDataSource,
  ctx: MetricContext
): Promise<MetricResult[]> {
  const out: MetricResult[] = [];
  for (const def of definitions) {
    out.push(await runMetric(def, source, ctx));
  }
  return out;
}

// ── Trend ───────────────────────────────────────────────────────────────────

export function attachTrend(
  result: MetricResult,
  history: HistoryRow[],
  nowMs: number
): MetricResultWithTrend {
  const baseline = selectTrendBaseline(history, nowMs);
  const prior: PriorMeasurement | null = baseline
    ? { value: baseline.value, status: baseline.status, measuredAt: baseline.measured_at }
    : null;

  if (result.value === null || prior === null || prior.value === null) {
    return { ...result, prior, delta: null, trend: 'unknown' };
  }

  const delta = result.value - prior.value;
  const material = isMaterialChange(result.unit === 'ratio', delta, prior.value);
  if (!material) return { ...result, prior, delta, trend: 'flat' };

  const improved = result.direction === 'higher_is_better' ? delta > 0 : delta < 0;
  return { ...result, prior, delta, trend: improved ? 'better' : 'worse' };
}

/** Is this movement worth a word, or is it just the denominator wobbling? */
export function isMaterialChange(isRatio: boolean, delta: number, priorValue: number): boolean {
  const magnitude = Math.abs(delta);
  if (isRatio) return magnitude >= MATERIAL_RATIO_DELTA;
  return magnitude >= Math.max(MATERIAL_COUNT_DELTA, Math.abs(priorValue) * 0.25);
}

// ── The decision: does this interrupt anybody? ───────────────────────────────

export type AlertReason =
  | 'new_breach'
  | 'worsened'
  | 'sustained_reminder'
  | 'recovered'
  | 'cannot_measure'
  | 'weekly_summary';

export interface MetricAlertDecision {
  key: string;
  alert: boolean;
  reason: AlertReason | null;
}

export interface AlertDecisionInput {
  result: MetricResultWithTrend;
  /** The run immediately before this one, for this metric. */
  previous: HistoryRow | null;
  /** The run before THAT — used to confirm a flip has held. See below. */
  beforePrevious: HistoryRow | null;
  /** When this metric was last included in a message. */
  lastAlerted: string | null;
  nowMs: number;
}

/**
 * Has this metric got materially worse SINCE THE LAST RUN?
 *
 * Deliberately measured against `previous` — yesterday — and NOT against
 * `result.trend`, which compares to a baseline at least TREND_LOOKBACK_DAYS
 * old. That distinction is the difference between reporting an event and
 * reporting it every morning for a week: a drop from 40% to 25% on Monday is
 * still "worse than the week-old baseline" on Tuesday, Wednesday, Thursday and
 * Friday, so gating the alert on `trend` fires FIVE identical "WORSE" messages
 * for one deterioration — per metric, across six metrics.
 *
 * `trend` remains exactly right for the DISPLAY clause ("down from 40% last
 * week"). It is simply the wrong clock for "is this news?".
 */
export function worsenedSinceLastRun(
  result: MetricResultWithTrend,
  previous: HistoryRow | null
): boolean {
  if (result.value === null || previous?.value == null) return false;
  const delta = result.value - previous.value;
  if (!isMaterialChange(result.unit === 'ratio', delta, previous.value)) return false;
  return result.direction === 'higher_is_better' ? delta < 0 : delta > 0;
}

/**
 * Per-metric: is there something NEW to say?
 *
 * The cases, and why each is drawn where it is:
 *
 *   new_breach          It just started failing. Always worth saying.
 *   worsened            Already failing, and materially worse than last time.
 *   sustained_reminder  Still failing a week later. Once a week, not daily.
 *   recovered           It came back. Cheap to send and it builds trust that
 *                       silence really does mean healthy.
 *   cannot_measure      The CHECK failed. This alerts even though there is no
 *                       bad number to report — a monitor that goes quiet
 *                       because it broke is worse than no monitor, since
 *                       silence then reads as good news.
 *
 * And the case that deliberately does NOT alert: `no_data`. An empty window is
 * not a failure, and treating a quiet week as an incident is the fastest way to
 * teach somebody to ignore the channel.
 *
 * ONE FLIP MUST SURVIVE TWO RUNS BEFORE IT IS NEWS.
 *
 * `unassigned_aging_jobs` sits at 6 against a threshold of 5. One job assigned
 * this afternoon and one new job aging tomorrow would otherwise produce
 * "✅ FIXED" and "🔴 NEW" on alternate mornings forever, about a board that
 * never meaningfully changed. So a breach announces itself on the SECOND
 * consecutive run that shows it, and a recovery on the second consecutive run
 * that shows that — a metric which cannot hold a state for two days is
 * flapping, and flapping is not an event.
 *
 * The exceptions, both deliberate:
 *   • the very FIRST measurement (no history at all) alerts immediately, so a
 *     new tenant's opening report is not a day of silence;
 *   • `cannot_measure` alerts immediately, because a monitor that has stopped
 *     working is the one thing that must never wait for confirmation.
 */
export function decideMetricAlert(input: AlertDecisionInput): MetricAlertDecision {
  const { result, previous, beforePrevious, lastAlerted, nowMs } = input;
  const key = result.key;
  const no = { key, alert: false, reason: null } as MetricAlertDecision;

  const staleEnoughToRepeat =
    lastAlerted === null ||
    nowMs - new Date(lastAlerted).getTime() >= SUSTAINED_REALERT_DAYS * 24 * 60 * 60 * 1000;

  if (result.status === 'unknown') {
    if (result.unknownReason === 'no_data') return no;
    // A broken check. Repeat weekly so it cannot be forgotten, but not daily.
    const wasAlreadyBroken = previous?.status === 'unknown';
    if (!wasAlreadyBroken || staleEnoughToRepeat) {
      return { key, alert: true, reason: 'cannot_measure' };
    }
    return no;
  }

  if (result.status === 'breach') {
    if (previous === null) return { key, alert: true, reason: 'new_breach' };
    if (previous.status !== 'breach') {
      // First run showing the breach. Wait one run to see whether it holds.
      return no;
    }
    // Yesterday was a breach too. If the day before was NOT, the flip has now
    // held for two runs and this is the announcement.
    if (beforePrevious !== null && beforePrevious.status !== 'breach') {
      return { key, alert: true, reason: 'new_breach' };
    }
    if (worsenedSinceLastRun(result, previous)) {
      return { key, alert: true, reason: 'worsened' };
    }
    if (staleEnoughToRepeat) return { key, alert: true, reason: 'sustained_reminder' };
    return no;
  }

  // status === 'ok'. Same confirmation rule in the other direction: yesterday
  // must already have been ok, and the day before must have been the breach.
  if (previous === null || previous.status !== 'ok') return no;
  if (beforePrevious?.status === 'breach') return { key, alert: true, reason: 'recovered' };
  // Recovering from a BROKEN CHECK is not news worth a message — the check
  // working again is the normal state, and it will show on the screen.
  return no;
}

/**
 * Is today the day for the routine summary?
 *
 * Weekly, on Monday, in the TENANT's timezone — infrequent by design. A routine
 * message exists so that silence is legible: a channel that has said nothing
 * for two weeks is indistinguishable from a channel that broke two weeks ago,
 * and the Monday note is what tells them apart.
 */
export function isWeeklySummaryDay(nowMs: number, timezone: string): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(new Date(nowMs));
  return weekday === 'Mon';
}

// ── The message ─────────────────────────────────────────────────────────────

const REASON_PREFIX: Record<AlertReason, string> = {
  new_breach: '🔴 NEW',
  worsened: '🔻 WORSE',
  sustained_reminder: '⚠️ STILL',
  recovered: '✅ FIXED',
  cannot_measure: '❓ CANNOT MEASURE',
  weekly_summary: '',
};

/** "20% (3 of 15)" for a measured metric, "not measured" for an unknown one. */
export function displayValue(r: MetricResultWithTrend): string {
  if (r.value === null) return 'not measured';
  return formatMetricValue(r.unit, r.value, r.numerator, r.denominator);
}

/**
 * The trend clause — the half of the message that turns a number into a signal.
 * "13%" says little. "13%, down from 40% last week" says everything.
 */
export function trendClause(r: MetricResultWithTrend, nowMs: number): string {
  if (r.trend === 'unknown' || r.prior?.value == null || r.value === null) {
    return r.prior === null ? ' (first measurement)' : '';
  }
  if (r.trend === 'flat') return ' (about the same)';
  const priorText = formatMetricValue(r.unit, r.prior.value, null, null);
  const rising = r.value > r.prior.value;
  const ago = describeAgo(nowMs - new Date(r.prior.measuredAt).getTime());
  return `, ${rising ? 'up' : 'down'} from ${priorText} ${ago}`;
}

/**
 * How long ago, said the way a person says it.
 *
 * The 5-to-10-day band collapses to "last week" deliberately: the baseline is
 * chosen to be about a week old, and "down from 40% last week" is the sentence
 * the founder actually used. "down from 40% 7 days ago" is the same fact
 * costing more effort to read.
 */
function describeAgo(ms: number): string {
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days <= 1) return 'yesterday';
  if (days <= 4) return `${days} days ago`;
  if (days <= 10) return 'last week';
  const weeks = Math.round(days / 7);
  return weeks <= 1 ? 'last week' : `${weeks} weeks ago`;
}

export interface MessageInput {
  tenantName: string;
  /** Only the metrics that earned a mention. */
  reported: Array<{ result: MetricResultWithTrend; reason: AlertReason }>;
  /** Everything else, for the one-line reassurance tail. */
  healthy: MetricResultWithTrend[];
  nowMs: number;
  /** Absolute link to the screen. */
  dashboardUrl: string;
  isWeeklySummary: boolean;
}

/**
 * Build the Telegram body. MarkdownV2, so every scrap of interpolated text goes
 * through escapeMarkdownV2 — an unescaped '.' or '-' makes Telegram 400 the
 * whole message and the alert silently never arrives. Job numbers
 * (JOB-2026-895358) and percentages are full of both.
 *
 * Pure, so the WORDING is testable without a network — which is the part that
 * actually matters, since the founder reads this on a phone and the sentences
 * are the product.
 */
export function buildHealthMessage(input: MessageInput): string {
  const { tenantName, reported, healthy, nowMs, dashboardUrl, isWeeklySummary } = input;

  const anyBad = reported.some(
    (r) => r.reason !== 'recovered' && r.reason !== 'weekly_summary'
  );
  const icon = isWeeklySummary && !anyBad ? '📋' : anyBad ? '⚠️' : '✅';
  const heading = isWeeklySummary ? 'Weekly workflow check' : 'Workflow health';

  const lines: string[] = [
    `${icon} *${escapeMarkdownV2(heading)}* — ${escapeMarkdownV2(tenantName)}`,
  ];

  for (const { result, reason } of reported) {
    const prefix = REASON_PREFIX[reason];
    const head = `${prefix ? `${escapeMarkdownV2(prefix)} ` : ''}*${escapeMarkdownV2(result.label)}*`;
    lines.push('');
    lines.push(`${head} — ${escapeMarkdownV2(displayValue(result) + trendClause(result, nowMs))}`);
    // THE sentence. This is the reason the feature exists: what it MEANS, in
    // words a non-engineer can act on, not `signature_rate: 0.13`.
    lines.push(escapeMarkdownV2(result.sentence));
    if (result.status !== 'ok') {
      lines.push(escapeMarkdownV2(`→ ${result.action}`));
    }
  }

  if (healthy.length > 0) {
    lines.push('');
    lines.push(
      escapeMarkdownV2(`Fine right now: ${healthy.map((h) => h.label).join(', ')}.`)
    );
  }

  lines.push('');
  lines.push(escapeMarkdownV2(dashboardUrl));
  return lines.join('\n');
}

/**
 * The ONE line that goes out when the monitor cannot read its own history.
 *
 * Without history every metric looks like a brand-new breach, so the naive
 * behaviour is six "🔴 NEW" messages every morning until somebody notices —
 * which is precisely how a channel gets muted, and the six alerts would be
 * saying something untrue besides (nothing is new; we simply cannot tell).
 * One honest line instead, and the per-metric numbers stay on the screen.
 */
export function buildHistoryFailureMessage(input: {
  tenantName: string;
  breaches: number;
  total: number;
  dashboardUrl: string;
}): string {
  const { tenantName, breaches, total, dashboardUrl } = input;
  return [
    `❓ *${escapeMarkdownV2('Workflow monitor degraded')}* — ${escapeMarkdownV2(tenantName)}`,
    '',
    escapeMarkdownV2(
      'The checks ran, but the monitor could not read its own history, so it cannot tell what changed since yesterday. Nothing below is necessarily new.'
    ),
    escapeMarkdownV2(
      `${breaches} of ${total} checks are outside their limits right now. The screen has the detail.`
    ),
    '',
    escapeMarkdownV2(dashboardUrl),
  ].join('\n');
}

/** The absolute link that goes in the message. */
export function workflowHealthUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://pontifexindustries.com').replace(
    /\/$/,
    ''
  );
  return `${base}/dashboard/admin/workflow-health`;
}
