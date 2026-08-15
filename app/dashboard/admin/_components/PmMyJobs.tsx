'use client';

/**
 * "FOR PROJECT MANAGERS DASHBOARD LETS HAVE SOMETHING THAT SHOWS UPCOMING JOBS,
 *  ACTIVE JOBS AND COMPLETED JOBS RIGHT ON THERE DASHBOARD" — founder, Aug 15.
 *
 * Tabs rather than three columns: at 375px three columns is three squashed
 * lists nobody reads, and a PM looks at one pile at a time anyway.
 *
 * The split rule lives in lib/pm-job-buckets.ts (and is tested there) — this
 * component only renders what /api/sales/my-jobs already bucketed. The one
 * thing it adds is the "not worked today" note, which is the visible half of
 * the weekend rule: a Monday–Friday job is still ACTIVE on a Saturday, it just
 * is not being worked, and saying so beats silently dropping it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Moon,
  User as UserIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDay } from '@/lib/dates';
import { getCardPermission, type PermissionLevel } from '@/lib/rbac';
import type { PmActiveJob, PmJob } from '@/lib/pm-job-buckets';

const ROW_CAP = 5;

type TabId = 'upcoming' | 'active' | 'completed';

interface ApiShape {
  today: string;
  upcoming: PmJob[];
  active: PmActiveJob[];
  completed: PmJob[];
  counts: { upcoming: number; active: number; completed: number };
}

const STATUS_LABELS: Record<string, string> = {
  pending_approval: 'Awaiting approval',
  on_hold: 'On hold',
  scheduled: 'Scheduled',
  assigned: 'Assigned',
  in_route: 'En route',
  on_site: 'On site',
  in_progress: 'In progress',
  completed: 'Completed',
};

const STATUS_PILLS: Record<string, string> = {
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  on_hold: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  scheduled: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  in_route: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  on_site: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  in_progress: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

function StatusPill({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
  const pill =
    STATUS_PILLS[status] ?? 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300';
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${pill}`}>
      {label}
    </span>
  );
}

/** "Mon, Aug 17" · "Aug 17 – Aug 21" for a span. Bare dates parsed LOCAL (lib/dates). */
function dateLabel(job: PmJob): string {
  if (!job.scheduled_date) return 'No date set';
  const start = formatDay(job.scheduled_date);
  if (job.end_date && job.end_date !== job.scheduled_date) {
    return `${start} – ${formatDay(job.end_date, { month: 'short', day: 'numeric' })}`;
  }
  return start;
}

function completedLabel(job: PmJob): string {
  if (job.completed_at) {
    // A timestamp, not a bare date — safe to hand to Date directly.
    return new Date(job.completed_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
  return job.scheduled_date ? formatDay(job.scheduled_date, { month: 'short', day: 'numeric' }) : '—';
}

function JobRow({ job, tab }: { job: PmJob | PmActiveJob; tab: TabId }) {
  const pausedToday = tab === 'active' && (job as PmActiveJob).runs_today === false;

  return (
    <Link
      href={`/dashboard/admin/jobs/${job.id}`}
      className="flex items-start gap-3 px-3 py-3 -mx-1 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {job.customer_name || job.title || 'Unnamed job'}
          </p>
          <StatusPill status={job.status} />
        </div>

        <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[11px] text-gray-500 dark:text-slate-400">
          <span className="font-mono">{job.job_number || '—'}</span>
          <span aria-hidden>·</span>
          <span>{tab === 'completed' ? completedLabel(job) : dateLabel(job)}</span>
          {job.operator_name && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
                <UserIcon className="w-3 h-3 flex-shrink-0" />
                {job.operator_name}
              </span>
            </>
          )}
        </div>

        {pausedToday && (
          <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
            <Moon className="w-3 h-3" />
            Running, but not worked today
          </p>
        )}
      </div>

      <ChevronRight className="w-4 h-4 mt-1 text-gray-300 dark:text-slate-600 group-hover:text-brand transition-colors flex-shrink-0" />
    </Link>
  );
}

export default function PmMyJobs({
  role,
  permissions,
}: {
  role: string;
  permissions: Record<string, PermissionLevel> | null;
}) {
  const [data, setData] = useState<ApiShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<TabId>('active');

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setFailed(true);
        return;
      }
      const res = await fetch('/api/sales/my-jobs', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const json = await res.json();
      setData(json.data as ApiShape);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The Completed tab links out to a page the role must be permitted to open.
  const canSeeCompletedPage = getCardPermission(permissions, 'completed_jobs', role) !== 'none';

  const tabs: Array<{ id: TabId; label: string; count: number; icon: typeof Briefcase }> = useMemo(
    () => [
      { id: 'upcoming', label: 'Upcoming', count: data?.counts.upcoming ?? 0, icon: CalendarClock },
      { id: 'active', label: 'Active', count: data?.counts.active ?? 0, icon: Briefcase },
      { id: 'completed', label: 'Completed', count: data?.counts.completed ?? 0, icon: CheckCircle2 },
    ],
    [data]
  );

  const rows: Array<PmJob | PmActiveJob> = data ? data[tab] : [];
  const shown = rows.slice(0, ROW_CAP);
  const total = data?.counts[tab] ?? 0;

  const viewAll =
    tab === 'completed'
      ? canSeeCompletedPage
        ? { href: '/dashboard/admin/completed-jobs', label: 'View all completed jobs' }
        : null
      : { href: '/dashboard/admin/active-jobs', label: 'View all jobs' };

  const EMPTY: Record<TabId, { title: string; body: string }> = {
    upcoming: {
      title: 'Nothing scheduled ahead',
      body: 'A job you create lands here as soon as it has a start date later than today — including one still waiting on approval.',
    },
    active: {
      title: 'Nothing running right now',
      body: 'A job moves here the day its start date arrives and stays until it is completed. Multi-day jobs skip weekends unless the job is marked as able to work them.',
    },
    completed: {
      title: 'No completed jobs yet',
      body: 'A job lands here once the crew finishes it and the office closes it out.',
    },
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">My Jobs</h2>
        <span className="text-[11px] text-gray-400 dark:text-slate-500">Jobs you created</span>
      </div>

      {/* Tabs — scrollable strip so three pills never overflow at 375px */}
      <div
        role="tablist"
        aria-label="My jobs"
        className="flex gap-1 px-3 pb-3 overflow-x-auto no-scrollbar"
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selected
                  ? 'bg-brand/10 dark:bg-brand/20 text-brand ring-1 ring-brand/30'
                  : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              {t.label}
              <span
                className={`tabular-nums px-1.5 py-0.5 rounded-full text-[10px] ${
                  selected
                    ? 'bg-brand/20 text-brand'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
                }`}
              >
                {loading ? '–' : t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="px-3 pb-2 border-t border-gray-50 dark:border-slate-700/60">
        {loading ? (
          <div className="py-3 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-3 px-1">
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-200 dark:bg-slate-700 rounded w-2/5" />
                  <div className="h-2.5 bg-gray-100 dark:bg-slate-700/60 rounded w-3/5" />
                </div>
              </div>
            ))}
          </div>
        ) : failed ? (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Could not load your jobs just now.
            </p>
            <button
              onClick={load}
              className="mt-2 min-h-[44px] px-4 text-xs font-semibold text-brand hover:underline"
            >
              Try again
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="py-8 px-2 text-center">
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">
              {EMPTY[tab].title}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
              {EMPTY[tab].body}
            </p>
            {tab !== 'completed' && (
              <Link
                href="/dashboard/admin/schedule-form"
                className="mt-3 inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg bg-brand/10 dark:bg-brand/20 text-brand text-xs font-semibold hover:bg-brand/20 transition-colors"
              >
                Start a new quote
              </Link>
            )}
          </div>
        ) : (
          <div className="py-1 divide-y divide-gray-50 dark:divide-slate-700/60">
            {shown.map((job) => (
              <JobRow key={job.id} job={job} tab={tab} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {!loading && !failed && shown.length > 0 && viewAll && (
        <Link
          href={viewAll.href}
          className="flex items-center justify-center gap-1 min-h-[44px] border-t border-gray-100 dark:border-slate-700 text-xs font-semibold text-brand hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
        >
          {total > shown.length ? `${viewAll.label} (${total})` : viewAll.label}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}
