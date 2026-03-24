'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isAdmin, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, TrendingUp, TrendingDown, DollarSign, Clock,
  Users, Search, Download, ChevronRight, BarChart3,
  CheckCircle, AlertTriangle, Minus, Filter, RefreshCw
} from 'lucide-react';

interface JobPnl {
  job_order_id: string;
  job_number: string;
  title: string;
  customer_name: string;
  status: string;
  scheduled_date: string;
  job_quote: number | null;
  estimated_hours: number | null;
  total_labor_hours: number;
  total_labor_cost: number;
  worker_count: number;
  helper_hours: number;
  helper_labor_cost: number;
  helper_count: number;
  combined_labor_hours: number;
  combined_labor_cost: number;
  gross_profit: number | null;
  gross_margin_pct: number | null;
}

interface Totals {
  totalQuoted: number;
  totalLaborCost: number;
  totalLaborHours: number;
  totalGrossProfit: number;
  overallMarginPct: number | null;
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  scheduled: 'bg-slate-50 text-slate-600 border-slate-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
  in_route: 'bg-amber-50 text-amber-700 border-amber-200',
  assigned: 'bg-purple-50 text-purple-700 border-purple-200',
};

function marginColor(pct: number | null): string {
  if (pct === null) return 'text-slate-400';
  if (pct >= 40) return 'text-emerald-600';
  if (pct >= 20) return 'text-amber-600';
  return 'text-red-600';
}

function marginBg(pct: number | null): string {
  if (pct === null) return 'bg-slate-50 border-slate-200';
  if (pct >= 40) return 'bg-emerald-50 border-emerald-200';
  if (pct >= 20) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function JobPnlPage() {
  const [user, setUser] = useState<User | null>(null);
  const [jobs, setJobs] = useState<JobPnl[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || !isAdmin()) {
      router.push('/login');
      return;
    }
    setUser(currentUser);
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const params = new URLSearchParams({ limit: '500' });
      if (startDate) params.set('startDate', startDate);
      if (endDate)   params.set('endDate', endDate);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/admin/job-pnl?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await res.json();
      if (result.success) {
        setJobs(result.data.jobs);
        setTotals(result.data.totals);
      }
    } catch (err) {
      console.error('P&L fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, startDate, endDate, statusFilter, router]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const filtered = jobs.filter(j => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      j.job_number?.toLowerCase().includes(q) ||
      j.customer_name?.toLowerCase().includes(q) ||
      j.title?.toLowerCase().includes(q)
    );
  });

  const exportCsv = () => {
    const headers = ['Job #', 'Customer', 'Title', 'Status', 'Date', 'Quote ($)', 'Labor Hours', 'Labor Cost ($)', 'Gross Profit ($)', 'Margin %'];
    const rows = filtered.map(j => [
      j.job_number,
      j.customer_name,
      j.title,
      j.status,
      j.scheduled_date || '',
      j.job_quote?.toFixed(2) || '',
      j.combined_labor_hours?.toFixed(2) || '0',
      j.combined_labor_cost?.toFixed(2) || '0',
      j.gross_profit?.toFixed(2) || '',
      j.gross_margin_pct != null ? `${j.gross_margin_pct}%` : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-pnl-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/admin"
              className="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Admin</span>
            </Link>
            <div className="h-6 w-px bg-slate-200" />
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shadow-sm">
                <BarChart3 size={16} className="text-white" />
              </div>
              Job P&amp;L Report
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {/* Summary Cards */}
        {totals && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-5 text-white shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={15} className="text-blue-200" />
                <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Total Quoted</span>
              </div>
              <p className="text-2xl font-bold">${fmt(totals.totalQuoted)}</p>
              <p className="text-xs text-blue-300 mt-1">{filtered.length} jobs</p>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200/60 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={15} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Labor Cost</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">${fmt(totals.totalLaborCost)}</p>
              <p className="text-xs text-slate-400 mt-1">{totals.totalLaborHours.toFixed(1)} hrs total</p>
            </div>

            <div className={`rounded-xl p-5 border shadow-sm ${totals.totalGrossProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {totals.totalGrossProfit >= 0
                  ? <TrendingUp size={15} className="text-emerald-600" />
                  : <TrendingDown size={15} className="text-red-600" />}
                <span className={`text-xs font-semibold uppercase tracking-wider ${totals.totalGrossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  Gross Profit
                </span>
              </div>
              <p className={`text-2xl font-bold ${totals.totalGrossProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                ${fmt(totals.totalGrossProfit)}
              </p>
              <p className={`text-xs mt-1 ${totals.totalGrossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                Labor only (excl. materials)
              </p>
            </div>

            <div className={`rounded-xl p-5 border shadow-sm ${marginBg(totals.overallMarginPct)}`}>
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 size={15} className={marginColor(totals.overallMarginPct)} />
                <span className={`text-xs font-semibold uppercase tracking-wider ${marginColor(totals.overallMarginPct)}`}>
                  Avg Margin
                </span>
              </div>
              <p className={`text-2xl font-bold ${marginColor(totals.overallMarginPct)}`}>
                {totals.overallMarginPct != null ? `${totals.overallMarginPct}%` : '—'}
              </p>
              <p className={`text-xs mt-1 ${marginColor(totals.overallMarginPct)}`}>
                ≥40% healthy · ≥20% ok · &lt;20% review
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4 mb-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search job #, customer, title..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
              <option value="scheduled">Scheduled</option>
              <option value="assigned">Assigned</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Job Profitability</h2>
              <p className="text-xs text-slate-400 mt-0.5">{filtered.length} jobs · click a row for full labor breakdown</p>
            </div>
            <Filter size={15} className="text-slate-400" />
          </div>

          {loading ? (
            <div className="p-16 text-center">
              <div className="w-10 h-10 mx-auto mb-3 relative">
                <div className="absolute inset-0 rounded-full border-[3px] border-slate-100" />
                <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-emerald-600 animate-spin" />
              </div>
              <p className="text-slate-400 text-sm">Loading P&amp;L data...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="text-slate-300" size={28} />
              </div>
              <p className="text-slate-600 font-semibold">No jobs found</p>
              <p className="text-slate-400 text-sm mt-1">Adjust your filters or date range</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Job</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">Customer</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Date</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quote</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Labor Hrs</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Labor Cost</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Gross Profit</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Margin</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Workers</th>
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(job => {
                    const hasCost = job.combined_labor_cost > 0;
                    const profitPositive = (job.gross_profit || 0) >= 0;
                    return (
                      <tr
                        key={job.job_order_id}
                        className="group hover:bg-slate-50/60 transition-colors cursor-pointer"
                        onClick={() => router.push(`/dashboard/admin/job-pnl/${job.job_order_id}`)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-sm font-bold text-slate-800">{job.job_number}</p>
                          <p className="text-xs text-slate-400 truncate max-w-[160px]">{job.title}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap hidden md:table-cell">
                          <span className="text-sm text-slate-700">{job.customer_name}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap hidden lg:table-cell">
                          <span className="text-sm text-slate-500">
                            {job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${STATUS_COLORS[job.status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {job.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {job.job_quote != null
                            ? <span className="text-sm font-semibold text-slate-800">${fmt(job.job_quote)}</span>
                            : <span className="text-sm text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <span className="text-sm tabular-nums text-slate-700">
                            {hasCost ? job.combined_labor_hours.toFixed(1) : '0.0'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <span className="text-sm font-semibold tabular-nums text-slate-800">
                            {hasCost ? `$${fmt(job.combined_labor_cost)}` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {job.gross_profit != null ? (
                            <span className={`text-sm font-bold tabular-nums ${profitPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                              {profitPositive ? '+' : ''}{`$${fmt(job.gross_profit)}`}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {job.gross_margin_pct != null ? (
                            <span className={`text-sm font-bold ${marginColor(job.gross_margin_pct)}`}>
                              {job.gross_margin_pct}%
                            </span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          {(job.worker_count + job.helper_count) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                              <Users size={12} />
                              {job.worker_count + job.helper_count}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 px-2 text-[11px] text-slate-500">
          {[
            { color: 'bg-emerald-500', label: 'Margin ≥40% — healthy' },
            { color: 'bg-amber-500',   label: 'Margin 20–39% — ok' },
            { color: 'bg-red-500',     label: 'Margin <20% — review' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 ${color} rounded-full`} />
              <span>{label}</span>
            </div>
          ))}
          <span className="text-slate-400">* Gross profit = quoted price − labor cost only (materials not included)</span>
        </div>
      </div>
    </div>
  );
}
