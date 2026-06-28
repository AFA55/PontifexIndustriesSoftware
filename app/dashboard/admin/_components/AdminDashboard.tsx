'use client';

/**
 * AdminDashboard — back-office / operations layout for the `admin` role.
 *
 * Admins are NOT salespeople: they don't create jobs and have no commission,
 * so this layout drops the "New Job" actions and the Revenue/commission tiles
 * (which are always $0 for an admin's personal scope anyway). Instead it
 * surfaces the things admins actually own: timecards, time-off, active jobs,
 * completed jobs, and billing.
 *
 * It reuses the dashData + activeJobs already fetched by the parent dashboard
 * page (passed as props) — no extra API calls, no architecture change.
 */

import Link from 'next/link';
import {
  Activity, Clock, Umbrella, DollarSign, Receipt, ClipboardList,
  CheckCircle2, ChevronRight, AlertCircle, Briefcase, CalendarDays, ListChecks,
} from 'lucide-react';
import CommandCenterLaunch from '@/components/command-center/CommandCenterLaunch';

interface ActiveJob {
  id: string;
  job_number: string;
  customer_name: string;
  operator_name: string | null;
  status: string;
  work_items_count: number;
}
interface JobToday {
  id: string;
  job_number: string;
  scheduled_time: string | null;
  customer_name: string;
  operator_name: string | null;
  status: string;
}
interface ActivityItem {
  id: string;
  type: string;
  description: string;
  created_at: string;
  link: string | null;
}
interface DashData {
  jobs_today: { count: number; jobs: JobToday[] };
  open_items: { pending_timecards: number; unassigned_jobs: number; overdue_invoices: number };
  operational_alerts?: { late_clockins_today: number; open_maintenance_requests: number; pending_time_off: number };
  recent_activity: ActivityItem[];
}
interface AdminDashboardProps {
  user: { name?: string; role: string } | null;
  dashData: DashData | null;
  dashLoading: boolean;
  activeJobs: ActiveJob[];
  activeJobsLoading: boolean;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function statusPill(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('progress') || s.includes('route') || s.includes('active')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
  if (s.includes('complete') || s.includes('done')) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (s.includes('standby') || s.includes('hold')) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
}

export default function AdminDashboard({ user, dashData, dashLoading, activeJobs, activeJobsLoading }: AdminDashboardProps) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const initials = (user?.name || 'A').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const pendingTimecards = dashData?.open_items.pending_timecards ?? 0;
  const timeOff = dashData?.operational_alerts?.pending_time_off ?? 0;
  const overdueInvoices = dashData?.open_items.overdue_invoices ?? 0;
  const activeCount = activeJobs.length;
  const allClear = pendingTimecards === 0 && timeOff === 0 && overdueInvoices === 0;

  // KPI tiles — admin-relevant only (no revenue/commission, no job creation)
  const tiles = [
    { label: 'Active Jobs',       value: activeCount,      href: '/dashboard/admin/active-jobs',  Icon: Activity,    accent: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30', loading: activeJobsLoading },
    { label: 'Pending Timecards', value: pendingTimecards, href: '/dashboard/admin/timecards',     Icon: Clock,       accent: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-900/30',   loading: dashLoading, pulse: pendingTimecards > 0 },
    { label: 'Time-Off Requests', value: timeOff,          href: '/dashboard/admin/time-off',      Icon: Umbrella,    accent: 'text-sky-600 dark:text-sky-400',       bg: 'bg-sky-50 dark:bg-sky-900/30',       loading: dashLoading },
    { label: 'Overdue Invoices',  value: overdueInvoices,  href: '/dashboard/admin/billing',       Icon: DollarSign,  accent: 'text-rose-600 dark:text-rose-400',     bg: 'bg-rose-50 dark:bg-rose-900/30',     loading: dashLoading, pulse: overdueInvoices > 0 },
  ];

  // Quick actions — admin areas (NO "New Job")
  const quickActions = [
    { label: 'Timecards',      href: '/dashboard/admin/timecards',       Icon: Clock,        cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40' },
    { label: 'Time Off',       href: '/dashboard/admin/time-off',        Icon: Umbrella,     cls: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/40' },
    { label: 'Active Jobs',    href: '/dashboard/admin/active-jobs',     Icon: Briefcase,    cls: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800/40' },
    { label: 'Completed Jobs', href: '/dashboard/admin/completed-jobs',  Icon: CheckCircle2, cls: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40' },
    { label: 'Billing',        href: '/dashboard/admin/billing',         Icon: Receipt,      cls: 'bg-fuchsia-50 dark:bg-fuchsia-900/20 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800/40' },
  ];

  const actionItems = [
    { label: 'Pending Timecards', count: pendingTimecards, href: '/dashboard/admin/timecards', Icon: Clock,      tone: 'text-amber-600 dark:text-amber-400' },
    { label: 'Time-Off Requests', count: timeOff,          href: '/dashboard/admin/time-off',  Icon: Umbrella,   tone: 'text-sky-600 dark:text-sky-400' },
    { label: 'Overdue Invoices',  count: overdueInvoices,  href: '/dashboard/admin/billing',   Icon: DollarSign, tone: 'text-rose-600 dark:text-rose-400' },
  ].filter((i) => i.count > 0);

  const todayJobs = dashData?.jobs_today.jobs ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-gray-50 dark:bg-slate-900 min-h-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Your Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400">{today}</p>
      </div>

      {/* Identity banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand to-brand-accent text-white flex items-center justify-center font-bold">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white truncate">{user?.name || 'Admin'}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400">Admin · Operations &amp; back-office</p>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-brand/10 text-brand dark:bg-brand/40 dark:text-brand">
          Admin
        </span>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="group relative rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-5 hover:shadow-md hover:border-gray-300 dark:hover:border-slate-600 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`w-10 h-10 rounded-xl ${t.bg} flex items-center justify-center`}>
                <t.Icon className={`w-5 h-5 ${t.accent}`} />
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 group-hover:text-gray-400" />
            </div>
            {t.loading ? (
              <div className="h-9 w-12 rounded bg-gray-100 dark:bg-slate-700 animate-pulse" />
            ) : (
              <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {t.value}
                {t.pulse && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
              </p>
            )}
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{t.label}</p>
          </Link>
        ))}
      </div>

      {/* Two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Active jobs + today's schedule */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Jobs */}
          <section className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-violet-500" />
                <h2 className="font-semibold text-gray-900 dark:text-white">Active Jobs</h2>
              </div>
              <Link href="/dashboard/admin/active-jobs" className="text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1">
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {activeJobsLoading ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
              ) : activeJobs.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <Briefcase className="w-8 h-8 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-slate-400">No active jobs right now.</p>
                </div>
              ) : (
                activeJobs.slice(0, 6).map((j) => (
                  <Link key={j.id} href={`/dashboard/admin/active-jobs`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                    <span className="text-xs font-bold px-2 py-1 rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 flex-shrink-0">
                      {j.job_number}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{j.customer_name}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                        {j.operator_name || 'Unassigned'} · {j.work_items_count} item{j.work_items_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-1 rounded-full ${statusPill(j.status)}`}>{j.status}</span>
                  </Link>
                ))
              )}
              {activeJobs.length > 6 && (
                <Link href="/dashboard/admin/active-jobs" className="block px-5 py-3 text-center text-sm font-semibold text-violet-600 dark:text-violet-400 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  View {activeJobs.length - 6} more active jobs
                </Link>
              )}
            </div>
          </section>

          {/* Today's Schedule (read-only) */}
          <section className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-500" />
                <h2 className="font-semibold text-gray-900 dark:text-white">Today&apos;s Schedule</h2>
              </div>
              <Link href="/dashboard/admin/schedule-board" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                Schedule Board <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            {todayJobs.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <CalendarDays className="w-8 h-8 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-slate-400">No jobs scheduled today.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {todayJobs.slice(0, 5).map((j) => (
                  <div key={j.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="text-xs font-mono text-gray-500 dark:text-slate-400 w-16 flex-shrink-0">{j.scheduled_time || '—'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{j.job_number} · {j.customer_name}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{j.operator_name || 'Unassigned'}</p>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-1 rounded-full ${statusPill(j.status)}`}>{j.status}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: Action required + quick actions */}
        <div className="space-y-6">
          {/* Action Required */}
          <section className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-rose-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Action Required</h2>
            </div>
            {allClear ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 py-2">
                <CheckCircle2 className="w-5 h-5" /> You&apos;re all caught up.
              </div>
            ) : (
              <div className="space-y-1">
                {actionItems.map((a) => (
                  <Link key={a.label} href={a.href} className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                    <a.Icon className={`w-4 h-4 ${a.tone}`} />
                    <span className="flex-1 text-sm text-gray-700 dark:text-slate-200">{a.label}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200">{a.count}</span>
                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Quick Actions */}
          <section className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
            <div className="flex items-center gap-2 mb-3">
              <ListChecks className="w-5 h-5 text-brand" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Quick Actions</h2>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {quickActions.map((q) => (
                <Link key={q.label} href={q.href} className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border ${q.cls} hover:shadow-sm transition-all text-center`}>
                  <q.Icon className="w-5 h-5" />
                  <span className="text-xs font-semibold">{q.label}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Recent Activity */}
      <section className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="w-5 h-5 text-slate-500" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Recent Activity</h2>
        </div>
        {dashLoading ? (
          <div className="text-sm text-gray-400 py-4">Loading…</div>
        ) : !dashData?.recent_activity?.length ? (
          <p className="text-sm text-gray-500 dark:text-slate-400 py-2">No recent activity.</p>
        ) : (
          <div className="space-y-1">
            {dashData.recent_activity.slice(0, 8).map((a) => {
              const Row = (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />
                  <span className="flex-1 text-sm text-gray-700 dark:text-slate-200 truncate">{a.description}</span>
                  <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">{relativeTime(a.created_at)}</span>
                </>
              );
              return a.link ? (
                <Link key={a.id} href={a.link} className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">{Row}</Link>
              ) : (
                <div key={a.id} className="flex items-center gap-3 py-2">{Row}</div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Command Center launch ──────────────────────────────────────────── */}
      <CommandCenterLaunch />
    </div>
  );
}
