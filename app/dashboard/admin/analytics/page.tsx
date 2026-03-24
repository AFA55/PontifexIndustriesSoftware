'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, TrendingUp, TrendingDown, DollarSign, Briefcase,
  Users, Clock, AlertTriangle, CheckCircle, RefreshCw, Loader2,
  ArrowUpRight, ArrowDownRight, Calendar, BarChart3, FileText,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

interface AnalyticsData {
  jobs: {
    thisMonth: number;
    lastMonth: number;
    completedThisMonth: number;
    completedLastMonth: number;
    scheduledThisMonth: number;
    ytdTotal: number;
    momChangePct: string | null;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  };
  revenue: {
    quotedThisMonth: number;
    quotedLastMonth: number;
    quotedMomChangePct: string | null;
    revenueYTD: number;
    outstandingAR: number;
    overdueAR: number;
    totalInvoicesYTD: number;
    paidInvoicesYTD: number;
    collectionRate: number;
  };
  operators: {
    total: number;
    operatorCount: number;
    helperCount: number;
    weeklyStats: { id: string; name: string; role: string; hoursThisWeek: number }[];
    totalHoursThisWeek: number;
  };
  trend: { date: string; jobs: number; quoted: number; completed: number }[];
  asOf: string;
}

function fmt$(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function MomBadge({ pct }: { pct: string | null }) {
  if (!pct) return <span className="text-xs text-gray-400">vs last month</span>;
  const n = parseFloat(pct);
  const up = n >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-bold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(n)}% vs last mo
    </span>
  );
}

function StatCard({
  label, value, sub, icon: Icon, color, pct,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
  pct?: string | null;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {pct !== undefined && <MomBadge pct={pct} />}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm font-semibold text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { router.push('/login'); return; }
    if (!['admin', 'super_admin', 'operations_manager', 'salesman'].includes(user.role || '')) {
      router.push('/dashboard');
    }
  }, [router]);

  const fetchData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const res = await fetch('/api/admin/analytics', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setError(null);
      } else {
        setError(json.error || 'Failed to load analytics');
      }
    } catch {
      setError('Network error — could not load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const now = new Date();
  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  // ── Trend bar chart (last 30 days, max bars = width) ──
  const trendBars = data?.trend.slice(-30) || [];
  const maxJobs = Math.max(...trendBars.map(d => d.jobs), 1);

  // Top job types
  const topTypes = Object.entries(data?.jobs.byType || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const totalTypes = topTypes.reduce((s, [, n]) => s + n, 0);

  const STATUS_COLORS: Record<string, string> = {
    completed:  'bg-emerald-500',
    scheduled:  'bg-blue-500',
    dispatched: 'bg-indigo-500',
    in_progress:'bg-amber-500',
    en_route:   'bg-cyan-500',
    cancelled:  'bg-red-400',
    on_hold:    'bg-gray-400',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/admin" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-600" />
                Analytics
              </h1>
              <p className="text-xs text-gray-500">{monthName} · as of {data ? new Date(data.asOf).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {data && (
          <>
            {/* ── KPI Row ────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Jobs This Month"
                value={String(data.jobs.thisMonth)}
                sub={`${data.jobs.completedThisMonth} completed`}
                icon={Briefcase}
                color="bg-blue-600"
                pct={data.jobs.momChangePct}
              />
              <StatCard
                label="Quoted This Month"
                value={fmt$(data.revenue.quotedThisMonth)}
                sub={`YTD: ${fmt$(data.revenue.revenueYTD)} collected`}
                icon={DollarSign}
                color="bg-emerald-600"
                pct={data.revenue.quotedMomChangePct}
              />
              <StatCard
                label="Outstanding AR"
                value={fmt$(data.revenue.outstandingAR)}
                sub={data.revenue.overdueAR > 0 ? `${fmt$(data.revenue.overdueAR)} overdue` : 'All current'}
                icon={data.revenue.overdueAR > 0 ? AlertTriangle : CheckCircle}
                color={data.revenue.overdueAR > 0 ? 'bg-red-500' : 'bg-teal-600'}
              />
              <StatCard
                label="Collection Rate"
                value={`${data.revenue.collectionRate}%`}
                sub={`${data.revenue.paidInvoicesYTD} / ${data.revenue.totalInvoicesYTD} invoices paid`}
                icon={FileText}
                color="bg-purple-600"
              />
            </div>

            {/* ── Operator Hours + Jobs by Status ──────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Operator Week Summary */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    Operator Hours (7 days)
                  </h3>
                  <span className="text-sm font-bold text-indigo-600">{data.operators.totalHoursThisWeek}h total</span>
                </div>
                <div className="space-y-2">
                  {data.operators.weeklyStats.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No clock-in data this week</p>
                  ) : (
                    data.operators.weeklyStats.slice(0, 6).map(op => (
                      <div key={op.id} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {op.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{op.name}</p>
                          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-0.5">
                            <div
                              className="bg-indigo-500 h-1.5 rounded-full"
                              style={{ width: `${Math.min((op.hoursThisWeek / 50) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm font-bold text-gray-700 flex-shrink-0">{op.hoursThisWeek}h</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                  <span>{data.operators.operatorCount} operators · {data.operators.helperCount} helpers</span>
                  <Link href="/dashboard/admin/timecards" className="text-indigo-600 font-semibold hover:underline">
                    View all →
                  </Link>
                </div>
              </div>

              {/* Jobs by Status */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  Jobs by Status (YTD)
                </h3>
                <div className="space-y-2.5">
                  {Object.entries(data.jobs.byStatus)
                    .sort(([, a], [, b]) => b - a)
                    .map(([status, count]) => {
                      const total = data.jobs.ytdTotal || 1;
                      const pct = Math.round(count / total * 100);
                      return (
                        <div key={status}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gray-600 capitalize">{status.replace('_', ' ')}</span>
                            <span className="text-xs font-bold text-gray-900">{count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${STATUS_COLORS[status] || 'bg-gray-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 font-semibold">{data.jobs.ytdTotal} jobs YTD · {data.jobs.completedThisMonth} completed this month</p>
                </div>
              </div>

              {/* Job Types */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Top Job Types (YTD)
                </h3>
                <div className="space-y-2.5">
                  {topTypes.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No data yet</p>
                  ) : (
                    topTypes.map(([type, count]) => {
                      const pct = totalTypes > 0 ? Math.round(count / totalTypes * 100) : 0;
                      return (
                        <div key={type}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gray-600 truncate">{type}</span>
                            <span className="text-xs font-bold text-gray-900">{count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className="bg-emerald-500 h-2 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <Link href="/dashboard/admin/job-pnl" className="text-sm text-emerald-600 font-semibold hover:underline flex items-center gap-1">
                    View full P&L report <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>

            {/* ── 30-Day Job Trend ──────────────────────────── */}
            {trendBars.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-purple-600" />
                    Job Volume — Last 30 Days
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Scheduled</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Completed</span>
                  </div>
                </div>
                <div className="flex items-end gap-0.5 h-32 w-full">
                  {trendBars.map((d, i) => {
                    const barHeight = maxJobs > 0 ? (d.jobs / maxJobs) * 100 : 0;
                    const compRatio = d.jobs > 0 ? d.completed / d.jobs : 0;
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                        <div className="w-full rounded-sm overflow-hidden" style={{ height: `${barHeight}%`, minHeight: d.jobs > 0 ? '4px' : '0' }}>
                          <div className="w-full bg-blue-200 h-full relative">
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-emerald-500"
                              style={{ height: `${compRatio * 100}%` }}
                            />
                          </div>
                        </div>
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] rounded px-1.5 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                          {new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {d.jobs} jobs
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>{trendBars[0] ? new Date(trendBars[0].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                  <span>Today</span>
                </div>
              </div>
            )}

            {/* ── Quick Links ───────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Job P&L Report', href: '/dashboard/admin/job-pnl', icon: TrendingUp, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                { label: 'Timecards', href: '/dashboard/admin/timecards', icon: Clock, color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
                { label: 'Billing & AR', href: '/dashboard/admin/billing', icon: DollarSign, color: 'text-amber-700 bg-amber-50 border-amber-200' },
                { label: 'Operator Profiles', href: '/dashboard/admin/operator-profiles', icon: Users, color: 'text-purple-700 bg-purple-50 border-purple-200' },
              ].map(({ label, href, icon: Icon, color }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-sm ${color}`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-semibold">{label}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
