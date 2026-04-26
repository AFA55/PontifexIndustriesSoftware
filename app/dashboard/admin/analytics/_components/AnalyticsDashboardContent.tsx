'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  DollarSign,
  Briefcase,
  CheckCircle2,
  Users,
  TrendingUp,
  TrendingDown,
  Clock,
  Activity,
  BarChart3,
  PieChart,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart as RechartsPie,
  Pie,
  Cell,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { TimeRange } from './types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtFull$(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function relTime(ts: string): string {
  const diff = Math.max(0, Date.now() - new Date(ts).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function formatMonthLabel(m: string): string {
  // m = "2025-04"
  const [y, mo] = m.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[parseInt(mo, 10) - 1] ?? m;
}

// ─── Status colours ─────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  scheduled:   { label: 'Scheduled',   color: '#3b82f6', bg: 'bg-blue-500',   ring: 'ring-blue-400' },
  in_progress: { label: 'In Progress', color: '#f59e0b', bg: 'bg-amber-500',  ring: 'ring-amber-400' },
  completed:   { label: 'Completed',   color: '#10b981', bg: 'bg-emerald-500', ring: 'ring-emerald-400' },
  cancelled:   { label: 'Cancelled',   color: '#ef4444', bg: 'bg-rose-500',   ring: 'ring-rose-400' },
  pending:     { label: 'Pending',     color: '#8b5cf6', bg: 'bg-violet-500', ring: 'ring-violet-400' },
  dispatched:  { label: 'Dispatched',  color: '#06b6d4', bg: 'bg-cyan-500',   ring: 'ring-cyan-400' },
  on_hold:     { label: 'On Hold',     color: '#6b7280', bg: 'bg-gray-500',   ring: 'ring-gray-400' },
};

const getMeta = (s: string) => STATUS_META[s] ?? { label: s, color: '#6b7280', bg: 'bg-gray-500', ring: 'ring-gray-400' };

// ─── Tiny components ─────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function PulseBar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-white/10 rounded ${className}`} />;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string;
  delta?: number | null;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  loading?: boolean;
}

function KPICard({ label, value, delta, icon: Icon, iconBg, iconColor, loading }: KPICardProps) {
  return (
    <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40 mb-0.5">{label}</p>
        {loading ? (
          <PulseBar className="h-7 w-24 mt-1" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{value}</span>
            {delta != null && delta !== 0 && (
              <span className={`text-xs font-semibold flex items-center gap-0.5 ${delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {Math.abs(delta)}%
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Custom tooltip for area chart ───────────────────────────────────────────

function RevenueTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-[#1a0f3a] border border-gray-100 dark:border-white/10 rounded-xl shadow-xl px-3 py-2 text-sm">
      <p className="text-gray-500 dark:text-white/50 text-xs mb-1">{label}</p>
      <p className="font-bold text-gray-900 dark:text-white">{fmtFull$(payload[0].value)}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['admin', 'super_admin', 'operations_manager', 'salesman', 'supervisor'];

export default function AnalyticsDashboardContent({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('monthly');
  const [data, setData] = useState<Record<string, any>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [token, setToken] = useState('');
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auth
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      setToken(session.access_token);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (!ALLOWED_ROLES.includes(profile?.role ?? '')) {
        router.push('/dashboard');
        return;
      }
      setLoading(false);
    })();
  }, [router]);

  // Data fetch
  const fetchData = useCallback(async () => {
    if (!token) return;
    setDataLoading(true);
    try {
      const res = await fetch(`/api/admin/dashboard-stats?timeRange=${timeRange}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json.data ?? {});
      }
    } catch { /* silent */ }
    setDataLoading(false);
  }, [token, timeRange]);

  useEffect(() => {
    if (!token) return;
    fetchData();
    refreshRef.current = setInterval(fetchData, 60_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [fetchData, token]);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const kpi = data.kpi ?? {};
  const revenue = data.revenue ?? {};
  const jobStatus = data.job_status ?? {};
  const operators = data.operators ?? {};
  const schedule = data.schedule ?? {};
  const crews = data.crews ?? {};

  const revenueTrend: { month: string; revenue: number }[] = revenue.revenue_trend ?? [];
  const statusList: { status: string; count: number }[] = jobStatus.statuses ?? [];
  const totalStatusJobs = statusList.reduce((s, x) => s + x.count, 0);

  const operatorList: { name: string; jobs_completed: number; revenue: number }[] =
    (operators.operators ?? []).slice(0, 6);

  const recentJobs: { id: string; job_number: string; customer: string; status: string; time: string; location: string }[] =
    (schedule.todays_jobs ?? []).slice(0, 8);

  const crewStats = [
    { label: 'Active Crews', value: crews.total_active ?? 0, color: 'text-gray-700 dark:text-white/80' },
    { label: 'Clocked In',   value: crews.clocked_in  ?? 0, color: 'text-blue-600 dark:text-blue-400' },
    { label: 'En Route',     value: crews.en_route    ?? 0, color: 'text-amber-600 dark:text-amber-400' },
    { label: 'On Site',      value: crews.on_site     ?? 0, color: 'text-emerald-600 dark:text-emerald-400' },
  ];

  // ─── Loading screen ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500 dark:text-white/50 font-medium">Loading analytics…</p>
        </div>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className={embedded ? '' : 'min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]'}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {!embedded && (
        <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 dark:from-[#0b0618] dark:via-[#120a2e] dark:to-[#0e0720] border-b border-purple-800/40 dark:border-white/10 sticky top-0 z-20 shadow-xl">
          <div className="container mx-auto px-4 py-3 max-w-7xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/admin"
                className="p-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/20 transition-all"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </Link>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-purple-300" />
                  Analytics Dashboard
                </h1>
                <p className="text-xs text-purple-200/70">{today}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Time range toggle */}
              <div className="flex bg-white/10 rounded-xl p-0.5 border border-white/20">
                {(['daily', 'weekly', 'monthly'] as TimeRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      timeRange === r
                        ? 'bg-white text-purple-900 shadow-sm'
                        : 'text-purple-200 hover:text-white'
                    }`}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>

              <button
                onClick={fetchData}
                disabled={dataLoading}
                className="p-2 bg-white/10 border border-white/20 rounded-xl text-purple-200 hover:bg-white/20 hover:text-white transition-all disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Embedded header ─────────────────────────────────────────────────── */}
      {embedded && (
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">Analytics Overview</h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 dark:bg-white/10 rounded-lg p-0.5">
              {(['daily', 'weekly', 'monthly'] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    timeRange === r
                      ? 'bg-white text-blue-600 shadow-sm dark:bg-white/20 dark:text-white'
                      : 'text-gray-500 hover:text-gray-700 dark:text-white/50'
                  }`}
                >
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
            <button onClick={fetchData} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white">
              <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="container mx-auto px-4 py-6 max-w-7xl space-y-5">

        {/* ── KPI Row ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Total Revenue"
            value={fmt$(kpi.total_revenue ?? 0)}
            icon={DollarSign}
            iconBg="bg-purple-100 dark:bg-purple-500/20"
            iconColor="text-purple-600 dark:text-purple-400"
            loading={dataLoading}
          />
          <KPICard
            label="Active Jobs"
            value={String(kpi.active_jobs ?? 0)}
            icon={Briefcase}
            iconBg="bg-blue-100 dark:bg-blue-500/20"
            iconColor="text-blue-600 dark:text-blue-400"
            loading={dataLoading}
          />
          <KPICard
            label="Completion Rate"
            value={`${kpi.completion_rate ?? 0}%`}
            icon={CheckCircle2}
            iconBg="bg-emerald-100 dark:bg-emerald-500/20"
            iconColor="text-emerald-600 dark:text-emerald-400"
            loading={dataLoading}
          />
          <KPICard
            label="Active Crews"
            value={String(kpi.active_crews ?? 0)}
            icon={Users}
            iconBg="bg-orange-100 dark:bg-orange-500/20"
            iconColor="text-orange-600 dark:text-orange-400"
            loading={dataLoading}
          />
        </div>

        {/* ── Row 2: Revenue Chart + Job Status ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Revenue Chart — 60% */}
          <div className="lg:col-span-3 bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-500" />
                <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Revenue Trend</h3>
              </div>
              <span className="text-xs text-gray-400 dark:text-white/40">Last 12 months</span>
            </div>
            {/* Sub-stats row */}
            <div className="flex gap-4 mb-4 mt-2">
              <div>
                <p className="text-[11px] text-gray-400 dark:text-white/40 uppercase tracking-wide">YTD Revenue</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {dataLoading ? '–' : fmtFull$(revenue.total_revenue ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400 dark:text-white/40 uppercase tracking-wide">Outstanding AR</p>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {dataLoading ? '–' : fmtFull$(revenue.outstanding ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400 dark:text-white/40 uppercase tracking-wide">This Period</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {dataLoading ? '–' : fmtFull$(revenue.paid_this_period ?? 0)}
                </p>
              </div>
            </div>
            {dataLoading ? (
              <div className="h-44 flex items-center justify-center">
                <Spinner />
              </div>
            ) : revenueTrend.length === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-gray-400 dark:text-white/30">
                <BarChart3 className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">No revenue data yet</p>
              </div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueTrend.map((d) => ({ ...d, month: formatMonthLabel(d.month) }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" className="dark:stroke-white/5" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={44} />
                    <Tooltip content={<RevenueTooltip />} />
                    <Area type="monotone" dataKey="revenue" stroke="#7c3aed" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: '#7c3aed' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Job Status Donut — 40% */}
          <div className="lg:col-span-2 bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <PieChart className="w-4 h-4 text-blue-500" />
              <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Job Status</h3>
            </div>

            {dataLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Spinner />
              </div>
            ) : (
              <>
                {/* Donut */}
                <div className="relative h-40 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={statusList.map((s) => ({ ...s, name: getMeta(s.status).label, color: getMeta(s.status).color }))}
                        cx="50%"
                        cy="50%"
                        innerRadius="55%"
                        outerRadius="80%"
                        paddingAngle={3}
                        dataKey="count"
                        startAngle={90}
                        endAngle={-270}
                      >
                        {statusList.map((s, i) => (
                          <Cell key={i} fill={getMeta(s.status).color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [value, name]}
                        contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
                      />
                    </RechartsPie>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalStatusJobs}</p>
                      <p className="text-[11px] text-gray-400 dark:text-white/40">Total</p>
                    </div>
                  </div>
                </div>

                {/* Progress bars legend */}
                <div className="space-y-2 mt-2 flex-1 overflow-auto">
                  {statusList
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5)
                    .map((s) => {
                      const meta = getMeta(s.status);
                      const pct = totalStatusJobs > 0 ? Math.round((s.count / totalStatusJobs) * 100) : 0;
                      return (
                        <div key={s.status}>
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} />
                              <span className="text-gray-600 dark:text-white/60">{meta.label}</span>
                            </div>
                            <span className="text-xs font-semibold text-gray-800 dark:text-white/80 ml-2">
                              {s.count} <span className="text-gray-400 dark:text-white/30 font-normal">({pct}%)</span>
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, backgroundColor: meta.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Row 3: Top Operators + Recent Jobs ───────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Top Operators */}
          <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-orange-500" />
                <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Crew Performance</h3>
              </div>
              <div className="flex items-center gap-4">
                {crewStats.slice(1).map((s) => (
                  <div key={s.label} className="text-center">
                    <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-gray-400 dark:text-white/30">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {dataLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <PulseBar className="w-9 h-9 rounded-full flex-shrink-0" />
                    <div className="flex-1">
                      <PulseBar className="h-3 w-32 mb-2" />
                      <PulseBar className="h-2 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : operatorList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-white/30">
                <Users className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">No operator data yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {operatorList.map((op, i) => {
                  const maxRev = Math.max(...operatorList.map((o) => o.revenue), 1);
                  const pct = Math.round((op.revenue / maxRev) * 100);
                  const rankColors = ['text-yellow-500', 'text-gray-400', 'text-amber-600'];
                  return (
                    <div key={op.name} className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">{initials(op.name)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-800 dark:text-white truncate">{op.name}</span>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            <span className={`text-xs font-bold ${rankColors[i] ?? 'text-gray-400'}`}>#{i + 1}</span>
                            <span className="text-xs text-gray-400 dark:text-white/40">{op.jobs_completed} jobs</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 dark:text-white/50 whitespace-nowrap">{fmt$(op.revenue)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Jobs */}
          <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Today&apos;s Jobs</h3>
              </div>
              <Link
                href="/dashboard/admin/jobs"
                className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5"
              >
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {dataLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <PulseBar className="h-8 w-16 rounded-lg flex-shrink-0" />
                    <div className="flex-1">
                      <PulseBar className="h-3 w-28 mb-2" />
                      <PulseBar className="h-2.5 w-20" />
                    </div>
                    <PulseBar className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-white/30">
                <Clock className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">No jobs scheduled today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentJobs.map((job) => {
                  const meta = getMeta(job.status);
                  return (
                    <div
                      key={job.id}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors group"
                    >
                      {/* Job number badge */}
                      <div className="w-16 px-2 py-1.5 bg-gray-100 dark:bg-white/10 rounded-lg flex-shrink-0 text-center">
                        <p className="text-[10px] font-bold text-gray-600 dark:text-white/60 truncate">{job.job_number}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{job.customer}</p>
                        {job.time && (
                          <p className="text-xs text-gray-400 dark:text-white/30 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {job.time}
                          </p>
                        )}
                      </div>
                      {/* Status badge */}
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 text-white"
                        style={{ backgroundColor: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 4: Quick stats strip ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              label: 'Outstanding AR',
              value: fmtFull$(revenue.outstanding ?? 0),
              sub: 'Unpaid invoices',
              color: 'text-amber-600 dark:text-amber-400',
              icon: DollarSign,
              iconBg: 'bg-amber-50 dark:bg-amber-500/10',
            },
            {
              label: "Today's Jobs",
              value: String(kpi.today_jobs ?? 0),
              sub: 'Scheduled today',
              color: 'text-blue-600 dark:text-blue-400',
              icon: Briefcase,
              iconBg: 'bg-blue-50 dark:bg-blue-500/10',
            },
            {
              label: 'Jobs This Period',
              value: String(kpi.active_jobs ?? 0),
              sub: timeRange.charAt(0).toUpperCase() + timeRange.slice(1) + ' view',
              color: 'text-purple-600 dark:text-purple-400',
              icon: BarChart3,
              iconBg: 'bg-purple-50 dark:bg-purple-500/10',
            },
            {
              label: 'Crew Utilization',
              value: crews.total_active > 0
                ? `${Math.round(((crews.clocked_in ?? 0) / crews.total_active) * 100)}%`
                : '0%',
              sub: `${crews.clocked_in ?? 0} of ${crews.total_active ?? 0} clocked in`,
              color: 'text-emerald-600 dark:text-emerald-400',
              icon: Users,
              iconBg: 'bg-emerald-50 dark:bg-emerald-500/10',
            },
          ].map((card) => (
            <div
              key={card.label}
              className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm p-4 flex items-center gap-3"
            >
              <div className={`w-10 h-10 ${card.iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-gray-400 dark:text-white/40 font-medium">{card.label}</p>
                {dataLoading ? (
                  <PulseBar className="h-5 w-16 mt-1" />
                ) : (
                  <p className={`text-base font-bold ${card.color}`}>{card.value}</p>
                )}
                <p className="text-[10px] text-gray-300 dark:text-white/20 truncate">{card.sub}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
