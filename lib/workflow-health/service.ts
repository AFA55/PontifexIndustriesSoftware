/**
 * Orchestration: read history → measure → decide → send → record.
 *
 * ORDER MATTERS, and it is deliberately send-then-record.
 *
 * Recording first would be tidier, but if the Telegram call then failed we
 * would have already stamped `alerted_at`, and the next run would treat the
 * message as delivered and stay silent — a monitoring system that loses its
 * only alert and then reports itself as fine. Sending first means the worst
 * case is a message repeated once. A duplicate is an annoyance; a swallowed
 * alert is the entire failure mode this feature exists to end.
 *
 * AND EVERY SEND IS AWAITED. Fire-and-forget is the house pattern for audit
 * logging and it does NOT work here: the serverless instance freezes the moment
 * the response is returned, so an un-awaited fetch is simply cancelled. That is
 * five separate silent failures on Aug 16 alone.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendTelegram, telegramConfigFromEnv } from '@/lib/telegram';
import { todayInTz, DEFAULT_TENANT_TZ } from '@/lib/reminder-timing';
import { WORKFLOW_METRICS } from './metrics';
import {
  attachTrend,
  buildHealthMessage,
  buildHistoryFailureMessage,
  decideMetricAlert,
  isWeeklySummaryDay,
  lastAlertAt,
  runMetrics,
  selectPreviousTwo,
  workflowHealthUrl,
  type AlertReason,
  type HistoryRow,
} from './runner';
import type { HealthDataSource, MetricResultWithTrend } from './types';

/** How far back history is read. Comfortably past the weekly re-alert window. */
const HISTORY_WINDOW_DAYS = 45;

export interface TenantRef {
  id: string;
  name: string;
  timezone: string | null;
}

export interface TenantHealthReport {
  tenantId: string;
  tenantName: string;
  timezone: string;
  measuredAt: string;
  results: MetricResultWithTrend[];
}

/**
 * Read every stored measurement for this tenant inside the history window,
 * bucketed by metric.
 *
 * Returns NULL — not an empty map — when the read itself fails, and the
 * distinction is the whole point. An empty map is indistinguishable from a
 * brand-new tenant, so every one of the six live breaches would be judged
 * `new_breach` and six Telegram messages would go out every morning, forever,
 * with nothing but a console.error to explain it. NULL lets the caller say the
 * one true thing instead: the monitor cannot read its own history, so it does
 * not know what changed.
 *
 * Measuring still proceeds. Refusing to measure because yesterday's numbers
 * were unreadable would be strictly worse.
 */
export async function loadHistory(tenantId: string): Promise<Map<string, HistoryRow[]> | null> {
  const since = new Date(Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('workflow_health_runs')
    .select('metric_key, status, value, measured_at, alerted_at')
    .eq('tenant_id', tenantId)
    .gte('measured_at', since)
    .order('measured_at', { ascending: false })
    .limit(1000);

  const byMetric = new Map<string, HistoryRow[]>();
  if (error || !data) {
    console.error('[workflow-health] could not read history', error?.message);
    return null;
  }
  for (const raw of data as Array<Record<string, unknown>>) {
    const row: HistoryRow = {
      metric_key: String(raw.metric_key),
      status: raw.status as HistoryRow['status'],
      // numeric comes back as a string from PostgREST often enough to matter.
      value: raw.value === null || raw.value === undefined ? null : Number(raw.value),
      measured_at: String(raw.measured_at),
      alerted_at: raw.alerted_at ? String(raw.alerted_at) : null,
    };
    const list = byMetric.get(row.metric_key) ?? [];
    list.push(row);
    byMetric.set(row.metric_key, list);
  }
  return byMetric;
}

/** Measure every metric for one tenant and attach its week-over-week trend. */
export async function measureTenant(
  tenant: TenantRef,
  source: HealthDataSource,
  /** NULL when the history read failed — the numbers are still measured, the
   *  trend is simply absent rather than invented. */
  history: Map<string, HistoryRow[]> | null,
  nowMs: number = Date.now()
): Promise<TenantHealthReport> {
  const timezone = tenant.timezone || DEFAULT_TENANT_TZ;
  const results = await runMetrics(WORKFLOW_METRICS, source, {
    tenantId: tenant.id,
    // The TENANT's calendar day. Vercel runs in UTC, so the server's own idea
    // of "today" rolls over at 8pm Eastern and every window would be off by one
    // for the whole evening.
    todayYMD: todayInTz(timezone),
    timezone,
  });

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    timezone,
    measuredAt: new Date(nowMs).toISOString(),
    results: results.map((r) => attachTrend(r, history?.get(r.key) ?? [], nowMs)),
  };
}

export interface DeliveryOutcome {
  tenantId: string;
  reported: Array<{ key: string; reason: AlertReason }>;
  /** A message was built and handed to the transport. */
  messageAttempted: boolean;
  messageSent: boolean;
  /** Present when a message was built but the transport refused it. */
  sendError: string | null;
  rowsWritten: number;
  isWeeklySummary: boolean;
  /** The history read failed — this run could not tell what changed. */
  historyUnavailable: boolean;
}

/**
 * Decide, send at most ONE message, then write the run rows.
 *
 * `sendFn` is injected so the cron can pass a dry-run that returns the body
 * instead of delivering it — testing a monitoring channel must not mean firing
 * a real alert at the founder.
 */
export async function deliverReport(
  report: TenantHealthReport,
  /** NULL means the history read FAILED — see the branch below. */
  history: Map<string, HistoryRow[]> | null,
  opts: {
    nowMs?: number;
    sendFn?: (text: string) => Promise<boolean>;
    /** Force the routine summary regardless of weekday (used by the test path). */
    forceWeeklySummary?: boolean;
    /** What "the transport returned false" means for THIS caller. */
    declineReason?: string;
  } = {}
): Promise<DeliveryOutcome> {
  const nowMs = opts.nowMs ?? Date.now();
  const isWeekly =
    opts.forceWeeklySummary ?? isWeeklySummaryDay(nowMs, report.timezone);

  // ── The history read failed ───────────────────────────────────────────────
  // Every metric would look brand new, so six breaches would fire six "NEW"
  // alerts — daily, and untruthfully. Say the one thing that IS true instead,
  // and stamp nothing as alerted.
  if (history === null) {
    const breaches = report.results.filter((r) => r.status === 'breach').length;
    const text = buildHistoryFailureMessage({
      tenantName: report.tenantName,
      breaches,
      total: report.results.length,
      dashboardUrl: workflowHealthUrl(),
    });
    const { sent, error } = await attemptSend(text, opts);
    const rowsWritten = await recordRun(report, nowMs, new Set<string>(), null);
    return {
      tenantId: report.tenantId,
      reported: [],
      messageAttempted: true,
      messageSent: sent,
      sendError: error,
      rowsWritten,
      isWeeklySummary: isWeekly,
      historyUnavailable: true,
    };
  }

  const decisions = report.results.map((result) => {
    const metricHistory = history.get(result.key) ?? [];
    const { previous, beforePrevious } = selectPreviousTwo(metricHistory);
    return {
      result,
      decision: decideMetricAlert({
        result,
        previous,
        beforePrevious,
        lastAlerted: lastAlertAt(metricHistory),
        nowMs,
      }),
    };
  });

  // On the weekly summary day everything is reported; otherwise only what
  // changed. This is the "quiet when healthy" rule in one expression.
  const reported = isWeekly
    ? report.results
        // A metric with nothing behind it is left out even of the summary — a
        // line reading "not measured, no data" teaches people to skim.
        .filter((r) => !(r.status === 'unknown' && r.unknownReason === 'no_data'))
        .map((result) => {
          const d = decisions.find((x) => x.result.key === result.key)!.decision;
          return { result, reason: d.reason ?? ('weekly_summary' as AlertReason) };
        })
    : decisions
        .filter((d) => d.decision.alert)
        .map((d) => ({ result: d.result, reason: d.decision.reason! }));

  let messageSent = false;
  let sendError: string | null = null;
  const messageAttempted = reported.length > 0;

  if (messageAttempted) {
    const keys = new Set(reported.map((r) => r.result.key));
    const text = buildHealthMessage({
      tenantName: report.tenantName,
      reported,
      healthy: report.results.filter((r) => r.status === 'ok' && !keys.has(r.key)),
      nowMs,
      dashboardUrl: workflowHealthUrl(),
      isWeeklySummary: isWeekly,
    });
    const outcome = await attemptSend(text, opts);
    messageSent = outcome.sent;
    sendError = outcome.error;
  }

  // Written last, and `alerted_at` is stamped ONLY on a confirmed send, so a
  // failed delivery is retried tomorrow instead of being silently forgotten.
  const reportedKeys = new Set(reported.map((r) => r.result.key));
  const rowsWritten = await recordRun(
    report,
    nowMs,
    reportedKeys,
    messageSent ? new Date(nowMs).toISOString() : null
  );

  return {
    tenantId: report.tenantId,
    reported: reported.map((r) => ({ key: r.result.key, reason: r.reason })),
    messageAttempted,
    messageSent,
    sendError,
    rowsWritten,
    isWeeklySummary: isWeekly,
    historyUnavailable: false,
  };
}

/**
 * Hand one message to the transport, awaited, and translate a refusal into
 * words that say WHICH refusal it was.
 *
 * "transport declined" on a dry run reads like a delivery failure in the cron's
 * JSON, which is how a deliberate no-send gets mistaken for a broken channel
 * (and, worse, how a genuinely broken channel gets mistaken for a dry run).
 */
async function attemptSend(
  text: string,
  opts: { sendFn?: (text: string) => Promise<boolean>; declineReason?: string }
): Promise<{ sent: boolean; error: string | null }> {
  const send = opts.sendFn ?? defaultSend;
  try {
    // AWAITED. See the header — an un-awaited send in a serverless function is
    // a send that never happens.
    const sent = await send(text);
    if (sent) return { sent: true, error: null };
    return {
      sent: false,
      error:
        opts.declineReason ?? 'transport declined (not configured, or Telegram refused it)',
    };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Write one row per metric. Returns how many landed; 0 means the insert failed. */
async function recordRun(
  report: TenantHealthReport,
  nowMs: number,
  reportedKeys: Set<string>,
  stamp: string | null
): Promise<number> {
  const rows = report.results.map((r) => ({
    tenant_id: report.tenantId,
    metric_key: r.key,
    status: r.status,
    value: r.value,
    numerator: r.numerator,
    denominator: r.denominator,
    threshold: r.threshold,
    detail: r.detail ?? {},
    unknown_reason: r.unknownReason,
    error: r.error,
    measured_at: new Date(nowMs).toISOString(),
    alerted_at: reportedKeys.has(r.key) ? stamp : null,
  }));

  const { error: insertError } = await supabaseAdmin.from('workflow_health_runs').insert(rows);
  if (insertError) {
    console.error('[workflow-health] could not record run', insertError.message);
    return 0;
  }
  return rows.length;
}

/**
 * The real transport — the same Telegram path already delivering to the founder.
 *
 * ONE CHAT, ALL TENANTS, ON PURPOSE. `TELEGRAM_ALERT_CHAT_ID` is the platform
 * owner's chat, and the platform owner is entitled to see every tenant he
 * hosts; each message names its tenant and covers exactly one. The
 * tenant-facing surface is the admin SCREEN, which is RLS-scoped so one
 * tenant's admins can never read another's numbers. If a tenant ever wants
 * their own alerts, the change is a per-tenant chat id — not a change to any of
 * this logic.
 */
async function defaultSend(text: string): Promise<boolean> {
  const config = telegramConfigFromEnv();
  if (!config) {
    console.warn('[workflow-health] Telegram not configured — message NOT sent');
    return false;
  }
  return sendTelegram(config, text);
}

/**
 * Can an alert actually leave the building, and when did one last do so?
 *
 * WHY THIS IS ON THE SCREEN. Without it, "quiet because healthy" and "quiet
 * because the Telegram token is missing" look identical — rows keep being
 * written, `alerted_at` stays null, the cards read fine, and the only trace is
 * a console.warn nobody reads. A monitoring feature whose silence is ambiguous
 * is not a monitoring feature.
 *
 * `lastDeliveredAt` is queried across ALL time, not the 45-day history window,
 * so "never" means never rather than "not lately".
 */
export async function alertingStatus(
  tenantId: string
): Promise<{ configured: boolean; lastDeliveredAt: string | null; lookupFailed: boolean }> {
  const configured = telegramConfigFromEnv() !== null;
  const { data, error } = await supabaseAdmin
    .from('workflow_health_runs')
    .select('alerted_at')
    .eq('tenant_id', tenantId)
    .not('alerted_at', 'is', null)
    .order('alerted_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[workflow-health] could not read last alert time', error.message);
    return { configured, lastDeliveredAt: null, lookupFailed: true };
  }
  const row = (data ?? [])[0] as { alerted_at?: string } | undefined;
  return { configured, lastDeliveredAt: row?.alerted_at ?? null, lookupFailed: false };
}

/** Every tenant, for the cron's loop. */
export async function listTenants(): Promise<TenantRef[]> {
  const { data, error } = await supabaseAdmin.from('tenants').select('id, name, timezone');
  if (error) throw new Error(`reading tenants: ${error.message}`);
  return (data ?? []) as TenantRef[];
}
