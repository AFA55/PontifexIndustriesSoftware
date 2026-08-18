/**
 * Alert-decision and message tests.
 *
 * "Should this interrupt the founder?" is the judgement that decides whether
 * this feature gets read or muted, so it is pure and it is tested. The crew's
 * 16 unread in-app notifications and the Platform Hub's 222 unopened alert rows
 * are what happens when that judgement is wrong.
 */

import {
  attachTrend,
  buildHealthMessage,
  buildHistoryFailureMessage,
  decideMetricAlert,
  displayValue,
  isMaterialChange,
  isWeeklySummaryDay,
  lastAlertAt,
  selectPrevious,
  selectPreviousTwo,
  selectTrendBaseline,
  trendClause,
  SUSTAINED_REALERT_DAYS,
  type AlertReason,
  type HistoryRow,
} from './runner';
import type { MetricResult, MetricResultWithTrend } from './types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-17T12:00:00Z').getTime();

function historyRow(over: Partial<HistoryRow> = {}): HistoryRow {
  return {
    metric_key: 'signed_completions',
    status: 'ok',
    value: 0.4,
    measured_at: new Date(NOW - DAY).toISOString(),
    alerted_at: null,
    ...over,
  };
}

function result(over: Partial<MetricResult> = {}): MetricResult {
  return {
    key: 'signed_completions',
    label: 'Signed completions',
    unit: 'ratio',
    direction: 'higher_is_better',
    threshold: 0.7,
    why: 'A finished job with no signature is a bill you may not be able to defend.',
    status: 'breach',
    value: 0.13,
    numerator: 2,
    denominator: 15,
    detail: {},
    unknownReason: null,
    error: null,
    sentence: 'Only 2 of 15 of the last finished jobs have a customer signature on file.',
    action: 'Check the completion step is actually asking for a signature.',
    href: '/dashboard/admin/completed-jobs',
    ...over,
  };
}

function withTrend(over: Partial<MetricResultWithTrend> = {}): MetricResultWithTrend {
  return { ...result(), prior: null, delta: null, trend: 'unknown', ...over };
}

// ── History selection ───────────────────────────────────────────────────────

describe('history selection', () => {
  it('picks the newest row as "previous", whatever order the DB returned', () => {
    const rows = [
      historyRow({ measured_at: new Date(NOW - 5 * DAY).toISOString(), value: 0.1 }),
      historyRow({ measured_at: new Date(NOW - DAY).toISOString(), value: 0.9 }),
      historyRow({ measured_at: new Date(NOW - 3 * DAY).toISOString(), value: 0.5 }),
    ];
    expect(selectPrevious(rows)?.value).toBe(0.9);
  });

  it('compares against a row at least a work-week old, not yesterday', () => {
    const rows = [
      historyRow({ measured_at: new Date(NOW - DAY).toISOString(), value: 0.2 }),
      historyRow({ measured_at: new Date(NOW - 7 * DAY).toISOString(), value: 0.4 }),
    ];
    expect(selectTrendBaseline(rows, NOW)?.value).toBe(0.4);
  });

  it('falls back to the oldest row it has when nothing is a week old yet', () => {
    // Day three of a new tenant: comparing to two days ago beats no trend at
    // all, and the row carries its own timestamp so the wording stays honest.
    const rows = [
      historyRow({ measured_at: new Date(NOW - DAY).toISOString(), value: 0.2 }),
      historyRow({ measured_at: new Date(NOW - 2 * DAY).toISOString(), value: 0.3 }),
    ];
    expect(selectTrendBaseline(rows, NOW)?.value).toBe(0.3);
  });

  it('refuses a baseline only minutes old — that is one reading, not a trend', () => {
    // Otherwise the very first day reports "about the same" against a
    // measurement taken four minutes earlier: reassuring, and meaningless.
    const rows = [historyRow({ measured_at: new Date(NOW - 4 * 60 * 1000).toISOString(), value: 0.2 })];
    expect(selectTrendBaseline(rows, NOW)).toBeNull();
  });

  it('never uses an unmeasured run as a baseline', () => {
    const rows = [
      historyRow({ measured_at: new Date(NOW - 8 * DAY).toISOString(), status: 'unknown', value: null }),
      historyRow({ measured_at: new Date(NOW - 9 * DAY).toISOString(), value: 0.6 }),
    ];
    expect(selectTrendBaseline(rows, NOW)?.value).toBe(0.6);
  });

  it('returns null when there is no history at all', () => {
    expect(selectTrendBaseline([], NOW)).toBeNull();
    expect(selectPrevious([])).toBeNull();
    expect(lastAlertAt([])).toBeNull();
  });

  it('finds when the metric was last actually messaged about', () => {
    const stamp = new Date(NOW - 2 * DAY).toISOString();
    const rows = [
      historyRow({ measured_at: new Date(NOW - DAY).toISOString(), alerted_at: null }),
      historyRow({ measured_at: stamp, alerted_at: stamp }),
    ];
    expect(lastAlertAt(rows)).toBe(stamp);
  });
});

// ── Trend ───────────────────────────────────────────────────────────────────

describe('trend', () => {
  it('calls a big drop in a higher-is-better metric "worse"', () => {
    const rows = [historyRow({ measured_at: new Date(NOW - 7 * DAY).toISOString(), value: 0.4 })];
    const t = attachTrend(result({ value: 0.13 }), rows, NOW);
    expect(t.trend).toBe('worse');
    expect(t.delta).toBeCloseTo(-0.27);
  });

  it('calls the same drop "better" when lower is better', () => {
    const rows = [historyRow({ measured_at: new Date(NOW - 7 * DAY).toISOString(), value: 0.4 })];
    const t = attachTrend(
      result({ direction: 'lower_is_better', value: 0.13 }),
      rows,
      NOW
    );
    expect(t.trend).toBe('better');
  });

  it('ignores jitter', () => {
    const rows = [historyRow({ measured_at: new Date(NOW - 7 * DAY).toISOString(), value: 0.15 })];
    expect(attachTrend(result({ value: 0.13 }), rows, NOW).trend).toBe('flat');
  });

  it('has no trend when the metric could not be measured', () => {
    const rows = [historyRow({ measured_at: new Date(NOW - 7 * DAY).toISOString(), value: 0.4 })];
    const t = attachTrend(result({ status: 'unknown', value: null, unknownReason: 'error' }), rows, NOW);
    expect(t.trend).toBe('unknown');
    expect(t.delta).toBeNull();
  });

  it('requires a bigger absolute move for counts than for ratios', () => {
    expect(isMaterialChange(true, 0.12, 0.4)).toBe(true);
    expect(isMaterialChange(true, 0.05, 0.4)).toBe(false);
    expect(isMaterialChange(false, 1, 4)).toBe(false); // 1 job either way is noise
    expect(isMaterialChange(false, 3, 4)).toBe(true);
    expect(isMaterialChange(false, 3, 40)).toBe(false); // 3 of 40 is not a story
  });

  it('renders the clause that turns a number into a signal', () => {
    const t = withTrend({
      value: 0.13,
      trend: 'worse',
      prior: { value: 0.4, status: 'ok', measuredAt: new Date(NOW - 7 * DAY).toISOString() },
      delta: -0.27,
    });
    // "13%" alone says little; this is the half that carries the meaning.
    expect(trendClause(t, NOW)).toBe(', down from 40% last week');
    expect(displayValue(t)).toBe('13% (2 of 15)');
  });

  it('says so plainly when a metric was never measured', () => {
    expect(displayValue(withTrend({ value: null }))).toBe('not measured');
  });

  it('labels the very first run as such instead of inventing a comparison', () => {
    expect(trendClause(withTrend(), NOW)).toBe(' (first measurement)');
  });
});

// ── The decision ────────────────────────────────────────────────────────────

describe('decideMetricAlert', () => {
  const base = { lastAlerted: null, nowMs: NOW, beforePrevious: null };

  it('waits one run before calling a breach new, so a boundary wobble says nothing', () => {
    const d = decideMetricAlert({
      ...base,
      result: withTrend({ status: 'breach' }),
      previous: historyRow({ status: 'ok' }),
    });
    expect(d.alert).toBe(false);
  });

  it('speaks up once the breach has held for two runs', () => {
    const d = decideMetricAlert({
      ...base,
      result: withTrend({ status: 'breach' }),
      previous: historyRow({ status: 'breach', value: 0.13 }),
      beforePrevious: historyRow({ status: 'ok' }),
    });
    expect(d).toEqual({ key: 'signed_completions', alert: true, reason: 'new_breach' });
  });

  it('stays QUIET on a breach that is unchanged and already reported', () => {
    // The rule the whole feature depends on. Repeating yesterday's six problems
    // every morning is how a channel becomes wallpaper.
    const d = decideMetricAlert({
      ...base,
      result: withTrend({ status: 'breach', trend: 'flat' }),
      previous: historyRow({ status: 'breach', value: 0.13 }),
      beforePrevious: historyRow({ status: 'breach', value: 0.13 }),
      lastAlerted: new Date(NOW - DAY).toISOString(),
    });
    expect(d.alert).toBe(false);
  });

  it('measures "worse" against YESTERDAY, not against the week-old trend baseline', () => {
    // `trend` is deliberately 'flat' here: it is the display clause, and it is
    // NOT what decides whether this is news. The drop from yesterday is.
    const d = decideMetricAlert({
      ...base,
      result: withTrend({ status: 'breach', value: 0.13, trend: 'flat' }),
      previous: historyRow({ status: 'breach', value: 0.4 }),
      beforePrevious: historyRow({ status: 'breach', value: 0.4 }),
      lastAlerted: new Date(NOW - DAY).toISOString(),
    });
    expect(d.reason).toBe('worsened');
  });

  it('does NOT call it worse just because the week-old baseline was higher', () => {
    // The five-mornings bug: `trend` stays 'worse' for days after a one-off
    // drop, because its baseline is a week old and does not move.
    const d = decideMetricAlert({
      ...base,
      result: withTrend({ status: 'breach', value: 0.13, trend: 'worse' }),
      previous: historyRow({ status: 'breach', value: 0.13 }),
      beforePrevious: historyRow({ status: 'breach', value: 0.13 }),
      lastAlerted: new Date(NOW - DAY).toISOString(),
    });
    expect(d.alert).toBe(false);
  });

  it('repeats a sustained breach once a week, not once a day', () => {
    const stale = new Date(NOW - (SUSTAINED_REALERT_DAYS + 1) * DAY).toISOString();
    const d = decideMetricAlert({
      ...base,
      result: withTrend({ status: 'breach', trend: 'flat' }),
      previous: historyRow({ status: 'breach', value: 0.13 }),
      beforePrevious: historyRow({ status: 'breach', value: 0.13 }),
      lastAlerted: stale,
    });
    expect(d.reason).toBe('sustained_reminder');
  });

  it('says when something got fixed, so silence can be trusted to mean healthy', () => {
    const d = decideMetricAlert({
      ...base,
      result: withTrend({ status: 'ok' }),
      previous: historyRow({ status: 'ok' }),
      beforePrevious: historyRow({ status: 'breach' }),
    });
    expect(d.reason).toBe('recovered');
  });

  it('waits a run before announcing a fix too — one good day is not a recovery', () => {
    const d = decideMetricAlert({
      ...base,
      result: withTrend({ status: 'ok' }),
      previous: historyRow({ status: 'breach' }),
    });
    expect(d.alert).toBe(false);
  });

  it('says nothing about a metric that was healthy and stayed healthy', () => {
    const d = decideMetricAlert({
      ...base,
      result: withTrend({ status: 'ok' }),
      previous: historyRow({ status: 'ok' }),
      beforePrevious: historyRow({ status: 'ok' }),
    });
    expect(d.alert).toBe(false);
  });

  it('ALERTS when the check itself breaks — a broken monitor must not read as good news', () => {
    // No confirmation delay on this one, on purpose: a monitor that has
    // stopped working is the single thing that must not wait a day.
    const d = decideMetricAlert({
      ...base,
      result: withTrend({ status: 'unknown', value: null, unknownReason: 'error' }),
      previous: historyRow({ status: 'ok' }),
    });
    expect(d.reason).toBe('cannot_measure');
  });

  it('never alerts on an empty window — a quiet week is not an incident', () => {
    const d = decideMetricAlert({
      ...base,
      result: withTrend({ status: 'unknown', value: null, unknownReason: 'no_data' }),
      previous: historyRow({ status: 'ok' }),
    });
    expect(d.alert).toBe(false);
  });

  it('does not nag daily about a check that is still broken', () => {
    const d = decideMetricAlert({
      ...base,
      result: withTrend({ status: 'unknown', value: null, unknownReason: 'error' }),
      previous: historyRow({ status: 'unknown' }),
      lastAlerted: new Date(NOW - DAY).toISOString(),
    });
    expect(d.alert).toBe(false);
  });

  it('treats the very first run of a failing metric as new', () => {
    // No history at all — nothing to confirm against, and a new tenant's first
    // report should not be a day of silence.
    const d = decideMetricAlert({
      ...base,
      result: withTrend({ status: 'breach' }),
      previous: null,
    });
    expect(d.reason).toBe('new_breach');
  });
});

// ── Several mornings in a row ────────────────────────────────────────────────

/**
 * Run the real decision loop across consecutive days, feeding each day's
 * outcome back into the history exactly as the service does.
 *
 * Unit tests that hand-set `trend: 'worse'` cannot catch a repeat, because the
 * repeat IS the question of what happens tomorrow. This runs tomorrow.
 */
function simulateDays(
  values: number[],
  opts: {
    startMs: number;
    seed: HistoryRow[];
    unit?: 'ratio' | 'count';
    direction?: 'higher_is_better' | 'lower_is_better';
    threshold?: number;
  }
): Array<AlertReason | null> {
  const { startMs, seed } = opts;
  const unit = opts.unit ?? 'ratio';
  const direction = opts.direction ?? 'higher_is_better';
  const threshold = opts.threshold ?? 0.7;
  const history = [...seed];
  const alerts: Array<AlertReason | null> = [];

  values.forEach((value, i) => {
    const nowMs = startMs + i * DAY;
    const breached = direction === 'higher_is_better' ? value < threshold : value > threshold;
    const r = attachTrend(
      result({ value, unit, direction, threshold, status: breached ? 'breach' : 'ok' }),
      history,
      nowMs
    );
    const { previous, beforePrevious } = selectPreviousTwo(history);
    const d = decideMetricAlert({
      result: r,
      previous,
      beforePrevious,
      lastAlerted: lastAlertAt(history),
      nowMs,
    });
    alerts.push(d.alert ? d.reason : null);
    history.push({
      metric_key: 'signed_completions',
      status: r.status,
      value: r.value,
      measured_at: new Date(nowMs).toISOString(),
      alerted_at: d.alert ? new Date(nowMs).toISOString() : null,
    });
  });

  return alerts;
}

/** A week of identical, already-reported readings to start from. */
function steadyWeek(value: number, status: HistoryRow['status'], startMs: number): HistoryRow[] {
  return Array.from({ length: 7 }, (_, i) =>
    historyRow({
      status,
      value,
      measured_at: new Date(startMs - (7 - i) * DAY).toISOString(),
      // Reported when it first appeared, six days ago — inside the weekly
      // re-alert window, so `sustained_reminder` is not what we are measuring.
      alerted_at: i === 0 ? new Date(startMs - 6 * DAY).toISOString() : null,
    })
  );
}

describe('the same problem, five mornings running', () => {
  it('reports ONE deterioration once, not once a day for a week', () => {
    // The bug: a metric drops 40% → 25% on Monday and stays there. The trend
    // baseline is at least five days old, so it still reads 40% on Tuesday,
    // Wednesday, Thursday and Friday — and gating on `trend` fired "🔻 WORSE"
    // every one of those mornings, for one event, per metric, across six.
    const alerts = simulateDays([0.25, 0.25, 0.25, 0.25, 0.25], {
      startMs: NOW,
      seed: steadyWeek(0.4, 'breach', NOW),
    });

    expect(alerts).toEqual(['worsened', null, null, null, null]);
    expect(alerts.filter(Boolean)).toHaveLength(1);
  });

  it('still speaks up if it deteriorates a SECOND time', () => {
    const alerts = simulateDays([0.25, 0.25, 0.1, 0.1], {
      startMs: NOW,
      seed: steadyWeek(0.4, 'breach', NOW),
    });
    expect(alerts).toEqual(['worsened', null, 'worsened', null]);
  });
});

describe('a metric sitting one unit from its threshold', () => {
  // `unassigned_aging_jobs`: 6 against a limit of 5. One job assigned and one
  // new job aging is an ordinary week at this shop, not six events.
  const countOpts = {
    startMs: NOW,
    unit: 'count' as const,
    direction: 'lower_is_better' as const,
    threshold: 5,
  };

  it('says NOTHING while it flaps back and forth across the line', () => {
    const alerts = simulateDays([6, 5, 6, 5, 6, 5], {
      ...countOpts,
      seed: steadyWeek(5, 'ok', NOW),
    });
    expect(alerts.filter(Boolean)).toHaveLength(0);
  });

  it('but does report a breach that actually sticks — one day late, once', () => {
    const alerts = simulateDays([6, 6, 6, 6], {
      ...countOpts,
      seed: steadyWeek(5, 'ok', NOW),
    });
    expect(alerts).toEqual([null, 'new_breach', null, null]);
  });

  it('and reports the recovery once it sticks too', () => {
    const alerts = simulateDays([5, 5, 5], {
      ...countOpts,
      seed: steadyWeek(8, 'breach', NOW),
    });
    expect(alerts).toEqual([null, 'recovered', null]);
  });
});

describe('selectPreviousTwo', () => {
  it('returns the last two runs newest-first, whatever order the DB gave', () => {
    const rows = [
      historyRow({ measured_at: new Date(NOW - 3 * DAY).toISOString(), value: 0.3 }),
      historyRow({ measured_at: new Date(NOW - DAY).toISOString(), value: 0.1 }),
      historyRow({ measured_at: new Date(NOW - 2 * DAY).toISOString(), value: 0.2 }),
    ];
    const { previous, beforePrevious } = selectPreviousTwo(rows);
    expect(previous?.value).toBe(0.1);
    expect(beforePrevious?.value).toBe(0.2);
  });

  it('has no second row to offer on day one', () => {
    expect(selectPreviousTwo([historyRow()]).beforePrevious).toBeNull();
    expect(selectPreviousTwo([]).previous).toBeNull();
  });
});

describe('isWeeklySummaryDay', () => {
  it('is Monday in the TENANT timezone, not the server\'s', () => {
    // 2026-08-17T02:00Z is Monday in UTC but still Sunday evening in New York.
    const sundayEveningEastern = new Date('2026-08-17T02:00:00Z').getTime();
    expect(isWeeklySummaryDay(sundayEveningEastern, 'America/New_York')).toBe(false);
    expect(isWeeklySummaryDay(sundayEveningEastern, 'UTC')).toBe(true);
  });

  it('is true on a Monday morning locally', () => {
    expect(isWeeklySummaryDay(NOW, 'America/New_York')).toBe(true);
  });
});

// ── The message ─────────────────────────────────────────────────────────────

describe('buildHealthMessage', () => {
  const dashboardUrl = 'https://pontifexindustries.com/dashboard/admin/workflow-health';

  it('leads with the plain-English sentence, the trend, and what to do', () => {
    const text = buildHealthMessage({
      tenantName: 'Patriot Concrete Cutting',
      reported: [
        {
          result: withTrend({
            status: 'breach',
            trend: 'worse',
            prior: { value: 0.4, status: 'ok', measuredAt: new Date(NOW - 7 * DAY).toISOString() },
          }),
          reason: 'new_breach',
        },
      ],
      healthy: [withTrend({ key: 'other', label: 'Timecards tagged to a job', status: 'ok' })],
      nowMs: NOW,
      dashboardUrl,
      isWeeklySummary: false,
    });

    expect(text).toContain('NEW');
    expect(text).toContain('Signed completions');
    expect(text).toContain('down from 40% last week');
    expect(text).toContain('Only 2 of 15 of the last finished jobs');
    expect(text).toContain('Fine right now: Timecards tagged to a job');
    // Never the raw key/number form the founder cannot act on.
    expect(text).not.toContain('signature_rate');
  });

  it('escapes MarkdownV2 everywhere, or Telegram 400s and the alert vanishes', () => {
    const text = buildHealthMessage({
      tenantName: 'Patriot Concrete Cutting',
      reported: [
        {
          result: withTrend({
            status: 'breach',
            sentence: 'Job JOB-2026-895358 is stuck (nobody pressed complete).',
          }),
          reason: 'new_breach',
        },
      ],
      healthy: [],
      nowMs: NOW,
      dashboardUrl,
      isWeeklySummary: false,
    });

    // Every dash, dot, paren and percent must arrive backslash-escaped.
    expect(text).toContain('JOB\\-2026\\-895358');
    expect(text).toContain('\\(nobody pressed complete\\)');
    expect(text).toContain('https://pontifexindustries\\.com');
    // No bare, unescaped hyphen inside the interpolated job number.
    expect(text).not.toContain('JOB-2026-895358');
  });

  it('reads as good news, not as an alarm, when the only news is a fix', () => {
    const text = buildHealthMessage({
      tenantName: 'Patriot Concrete Cutting',
      reported: [{ result: withTrend({ status: 'ok' }), reason: 'recovered' }],
      healthy: [],
      nowMs: NOW,
      dashboardUrl,
      isWeeklySummary: false,
    });
    expect(text.startsWith('✅')).toBe(true);
    expect(text).toContain('FIXED');
  });

  it('names a broken check as unknown, never as zero', () => {
    const text = buildHealthMessage({
      tenantName: 'Patriot Concrete Cutting',
      reported: [
        {
          result: withTrend({
            status: 'unknown',
            value: null,
            unknownReason: 'error',
            sentence: 'Could not measure "Signed completions" — the check itself failed. This is NOT zero; it is unknown.',
          }),
          reason: 'cannot_measure',
        },
      ],
      healthy: [],
      nowMs: NOW,
      dashboardUrl,
      isWeeklySummary: false,
    });

    expect(text).toContain('CANNOT MEASURE');
    expect(text).toContain('not measured');
    expect(text).toContain('NOT zero');
    expect(text).not.toMatch(/\b0%/);
  });

  it('says the monitor is degraded in ONE line, rather than crying wolf six times', () => {
    // With no history every breach looks brand new. Six "🔴 NEW" messages
    // every morning would be both noise and a falsehood — nothing is new, we
    // simply cannot tell.
    const text = buildHistoryFailureMessage({
      tenantName: 'Patriot Concrete Cutting',
      breaches: 6,
      total: 6,
      dashboardUrl,
    });

    expect(text).toContain('could not read its own history');
    expect(text).toContain('Nothing below is necessarily new');
    expect(text).not.toContain('NEW');
    // MarkdownV2 or Telegram 400s it and nothing arrives at all.
    expect(text).toContain('https://pontifexindustries\\.com');
  });

  it('marks the Monday summary as routine rather than as an incident', () => {
    const text = buildHealthMessage({
      tenantName: 'Patriot Concrete Cutting',
      reported: [{ result: withTrend({ status: 'ok' }), reason: 'weekly_summary' }],
      healthy: [],
      nowMs: NOW,
      dashboardUrl,
      isWeeklySummary: true,
    });
    expect(text).toContain('Weekly workflow check');
    expect(text.startsWith('📋')).toBe(true);
  });
});
