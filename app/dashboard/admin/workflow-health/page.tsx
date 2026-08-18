'use client';

export const dynamic = 'force-dynamic';

/**
 * WORKFLOW HEALTH — the screen.
 *
 * The Telegram message tells the founder something changed; this is where he
 * comes to look. It must therefore say the SAME things in the SAME words — the
 * plain-English sentences are rendered on the server and shipped down verbatim,
 * so the page and the alert can never drift apart and disagree about the same
 * number.
 *
 * Read on a phone, so: 375px first, nothing below 14px (text-sm floor — there
 * is no text-xs on this page at all), every tappable thing at least 44px tall,
 * and problems sorted to the top so the answer to "what's wrong?" is above the
 * fold.
 *
 * Visual language is lifted from /dashboard/admin/system-health — gray-50 page,
 * white rounded-2xl cards, sticky header with a back arrow. Nothing new
 * invented.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  HelpCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';

interface HistoryPoint {
  value: number | null;
  measuredAt: string;
  status: string;
}

interface Metric {
  key: string;
  label: string;
  why: string;
  unit: 'ratio' | 'count';
  direction: 'higher_is_better' | 'lower_is_better';
  threshold: number;
  status: 'ok' | 'breach' | 'unknown';
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  unknownReason: 'error' | 'no_data' | null;
  error: string | null;
  sentence: string;
  display: string;
  trend: 'better' | 'worse' | 'flat' | 'unknown';
  trendText: string;
  action: string;
  href: string;
  history: HistoryPoint[];
}

interface Alerting {
  configured: boolean;
  lastDeliveredAt: string | null;
  lookupFailed: boolean;
}

interface Payload {
  tenantName: string;
  measuredAt: string;
  alerting: Alerting;
  historyAvailable: boolean;
  metrics: Metric[];
}

const ADMIN_ROLES = ['admin', 'super_admin', 'operations_manager'];

/** Problems first. "What is wrong?" must be answerable without scrolling. */
const SEVERITY: Record<string, number> = { breach: 0, error: 1, ok: 2, no_data: 3 };
function severityOf(m: Metric): number {
  if (m.status === 'breach') return SEVERITY.breach;
  if (m.status === 'unknown') return SEVERITY[m.unknownReason ?? 'no_data'] ?? 3;
  return SEVERITY.ok;
}

export default function WorkflowHealthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.push('/login');
        return;
      }
      // requireAuth reads the BEARER TOKEN, not cookies — see CLAUDE.md.
      const res = await fetch('/api/admin/workflow-health', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `Request failed (${res.status})`);
        setData(null);
        return;
      }
      setData(json.data as Payload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user || !ADMIN_ROLES.includes(user.role)) {
        router.push('/dashboard');
        return;
      }
      await fetchHealth();
    })();
  }, [router, fetchHealth]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-brand animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Checking the workflow…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 max-w-md w-full text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Could not load</h2>
          {/* Said plainly, not shown as an empty page — an empty page reads as
              "nothing is wrong", which is the exact lie this feature exists to
              stop telling. */}
          <p className="text-sm text-gray-600 mb-5">{error}</p>
          <button
            onClick={() => router.push('/dashboard/admin')}
            className="min-h-[44px] px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-xl text-sm font-semibold w-full"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const metrics = [...data.metrics].sort((a, b) => severityOf(a) - severityOf(b));
  const problems = metrics.filter((m) => m.status === 'breach').length;
  const broken = metrics.filter((m) => m.unknownReason === 'error').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard/admin')}
              aria-label="Back"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-xl"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Workflow Health</h1>
              <p className="text-sm text-gray-500 truncate">
                {data.tenantName} · checked{' '}
                {new Date(data.measuredAt).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <button
              onClick={fetchHealth}
              aria-label="Refresh"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-xl"
            >
              <RefreshCw
                className={`w-5 h-5 text-gray-500 ${refreshing ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-4">
        <SummaryBanner problems={problems} broken={broken} total={metrics.length} />
        <AlertingNote alerting={data.alerting} historyAvailable={data.historyAvailable} />

        {metrics.map((m) => (
          <MetricCard key={m.key} metric={m} onGo={() => router.push(m.href)} />
        ))}

        <p className="text-sm text-gray-500 text-center pt-2 pb-8">
          Measured live, right now. A Telegram message goes out only when one of
          these changes — no news is good news.
        </p>
      </div>
    </div>
  );
}

function SummaryBanner({
  problems,
  broken,
  total,
}: {
  problems: number;
  broken: number;
  total: number;
}) {
  if (broken > 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <HelpCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-base text-amber-900 font-medium">
          {broken} {broken === 1 ? 'check' : 'checks'} could not run
          {problems > 0 ? `, and ${problems} of the rest need attention` : ''}. A check that
          cannot run is not a pass — see below.
        </p>
      </div>
    );
  }
  if (problems === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
        <CheckCircle className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
        <p className="text-base text-green-900 font-medium">
          All {total} checks are inside their limits right now.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
      <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
      <p className="text-base text-red-900 font-medium">
        {problems} of {total} {problems === 1 ? 'check needs' : 'checks need'} attention.
      </p>
    </div>
  );
}

/**
 * "No news is good news" is only true if news CAN arrive.
 *
 * If the Telegram token is missing, this page keeps rendering healthy-looking
 * cards, rows keep being written, and not one alert ever leaves — with nothing
 * to distinguish that from a genuinely quiet fortnight. So the screen states
 * plainly whether alerting is wired up and when a message last actually went
 * out. Same reason the metrics say 'unknown' instead of 0.
 */
function AlertingNote({
  alerting,
  historyAvailable,
}: {
  alerting: Alerting;
  historyAvailable: boolean;
}) {
  const notes: string[] = [];

  if (!alerting.configured) {
    notes.push(
      'Telegram alerting is NOT set up, so no message has ever been sent. Silence here means nothing.'
    );
  } else if (alerting.lookupFailed) {
    notes.push('Could not check when an alert was last delivered.');
  } else if (alerting.lastDeliveredAt === null) {
    notes.push('No alert has ever been delivered for this company yet.');
  } else {
    notes.push(`Last alert delivered ${describeAgo(alerting.lastDeliveredAt)}.`);
  }

  if (!historyAvailable) {
    notes.push(
      'Yesterday’s numbers could not be read, so nothing below has a trend and nothing can be called new.'
    );
  }

  const bad = !alerting.configured || !historyAvailable || alerting.lookupFailed;

  return (
    <div
      className={`rounded-2xl p-4 flex items-start gap-3 border ${
        bad ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
      }`}
    >
      <Activity
        className={`w-5 h-5 shrink-0 mt-0.5 ${bad ? 'text-amber-600' : 'text-gray-400'}`}
      />
      <p className={`text-sm ${bad ? 'text-amber-900' : 'text-gray-600'}`}>{notes.join(' ')}</p>
    </div>
  );
}

/** "3 days ago" / "today" — the same plain phrasing the alerts use. */
function describeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return `on ${new Date(iso).toLocaleDateString()}`;
}

function StatusPill({ metric }: { metric: Metric }) {
  if (metric.status === 'breach') {
    return (
      <span className="text-sm font-semibold px-2.5 py-1 rounded-lg bg-red-100 text-red-700 whitespace-nowrap">
        Needs attention
      </span>
    );
  }
  if (metric.status === 'ok') {
    return (
      <span className="text-sm font-semibold px-2.5 py-1 rounded-lg bg-green-100 text-green-700 whitespace-nowrap">
        Healthy
      </span>
    );
  }
  // The honest third state. NEVER rendered as a zero.
  return (
    <span className="text-sm font-semibold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 whitespace-nowrap">
      {metric.unknownReason === 'error' ? 'Check failed' : 'No data yet'}
    </span>
  );
}

function MetricCard({ metric, onGo }: { metric: Metric; onGo: () => void }) {
  const unmeasured = metric.status === 'unknown';
  const bad = metric.status === 'breach';

  return (
    <div
      className={`bg-white rounded-2xl border p-4 sm:p-5 ${
        bad ? 'border-red-200' : unmeasured ? 'border-amber-200' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900 text-base leading-tight">{metric.label}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{metric.why}</p>
        </div>
        <StatusPill metric={metric} />
      </div>

      <div className="flex items-baseline gap-2 flex-wrap mb-3">
        <span
          className={`text-2xl font-bold tabular-nums ${
            unmeasured ? 'text-amber-700' : bad ? 'text-red-600' : 'text-gray-900'
          }`}
        >
          {metric.display}
        </span>
        {metric.trendText && (
          <span
            className={`text-sm font-medium ${
              metric.trend === 'worse'
                ? 'text-red-600'
                : metric.trend === 'better'
                  ? 'text-green-600'
                  : 'text-gray-500'
            }`}
          >
            {metric.trendText}
          </span>
        )}
      </div>

      {/* THE SENTENCE. The entire reason this feature exists — what the number
          MEANS, in words a non-engineer can act on. Rendered server-side so it
          matches the Telegram message exactly. */}
      <p className="text-base text-gray-800 leading-relaxed">{metric.sentence}</p>

      {metric.status === 'unknown' && metric.error && (
        <p className="text-sm text-amber-800 bg-amber-50 rounded-xl p-3 mt-3 break-words">
          {metric.error}
        </p>
      )}

      <Sparkline points={metric.history} unit={metric.unit} />

      {bad && (
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            onClick={onGo}
            className="min-h-[44px] px-4 inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white rounded-xl text-sm font-semibold"
          >
            Go fix it
            <ArrowRight className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600 flex-1 min-w-[12rem]">{metric.action}</span>
        </div>
      )}
    </div>
  );
}

/**
 * A bare trend line. Deliberately unlabelled and decorative — the number and
 * the trend sentence above carry the meaning, and a chart with axes on a 375px
 * phone is unreadable anyway. Hidden entirely below two points, because a
 * single dot drawn as a "trend" implies history that does not exist.
 */
function Sparkline({ points, unit }: { points: HistoryPoint[]; unit: 'ratio' | 'count' }) {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length < 2) return null;

  const min = Math.min(...values, unit === 'ratio' ? 0 : Math.min(...values));
  const max = Math.max(...values, unit === 'ratio' ? 1 : Math.max(...values));
  const span = max - min || 1;
  const w = 100;
  const h = 24;
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="mt-3 flex items-center gap-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full h-6 text-gray-300"
        aria-hidden="true"
      >
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="text-sm text-gray-500 whitespace-nowrap">{values.length} runs</span>
    </div>
  );
}
