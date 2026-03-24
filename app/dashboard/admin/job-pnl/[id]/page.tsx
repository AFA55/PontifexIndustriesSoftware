'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isAdmin, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, Clock, DollarSign, Users, TrendingUp, TrendingDown,
  CheckCircle, AlertTriangle, BarChart3, Calendar, User as UserIcon,
  Briefcase, Moon, Factory
} from 'lucide-react';

interface JobDetail {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  status: string;
  scheduled_date: string;
  job_quote: number;
  estimated_hours: number | null;
}

interface TimecardEntry {
  id: string;
  worker_name: string;
  role: string;
  hourly_rate: number | null;
  date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  total_hours: number | null;
  labor_cost: number;
  hour_type: string;
  is_shop_hours: boolean;
  is_night_shift: boolean;
  is_approved: boolean;
}

interface HelperEntry {
  id: string;
  worker_name: string;
  role: string;
  hourly_rate: number | null;
  date: string;
  started_at: string | null;
  completed_at: string | null;
  total_hours: number;
  labor_cost: number;
}

interface WorkerSummary {
  name: string;
  role: string;
  hourly_rate: number | null;
  total_hours: number;
  labor_cost: number;
  type: string;
}

interface Totals {
  totalLaborHours: number;
  totalLaborCost: number;
  jobQuote: number;
  grossProfit: number;
  grossMarginPct: number | null;
  workerCount: number;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function marginColor(pct: number | null): string {
  if (pct === null) return 'text-slate-400';
  if (pct >= 40) return 'text-emerald-600';
  if (pct >= 20) return 'text-amber-600';
  return 'text-red-600';
}

const HOUR_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  regular:            { label: 'Regular',      color: 'bg-slate-50 text-slate-600 border-slate-200' },
  night_shift:        { label: 'Night Shift',  color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  mandatory_overtime: { label: 'Weekend OT',   color: 'bg-red-50 text-red-700 border-red-200' },
};

export default function JobPnlDetailPage() {
  const [user, setUser] = useState<User | null>(null);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [timecardEntries, setTimecardEntries] = useState<TimecardEntry[]>([]);
  const [helperEntries, setHelperEntries] = useState<HelperEntry[]>([]);
  const [workerSummary, setWorkerSummary] = useState<WorkerSummary[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || !isAdmin()) {
      router.push('/login');
      return;
    }
    setUser(currentUser);
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!user || !jobId) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const res = await fetch(`/api/admin/job-pnl/${jobId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await res.json();
      if (result.success) {
        setJob(result.data.job);
        setTimecardEntries(result.data.timecardEntries);
        setHelperEntries(result.data.helperEntries);
        setWorkerSummary(result.data.workerSummary);
        setTotals(result.data.totals);
      }
    } catch (err) {
      console.error('Job P&L detail fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, jobId, router]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  if (!user) return null;

  const profitPositive = (totals?.grossProfit || 0) >= 0;

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center gap-4">
          <Link
            href="/dashboard/admin/job-pnl"
            className="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all text-sm font-medium"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">P&amp;L Report</span>
          </Link>
          <div className="h-6 w-px bg-slate-200" />
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shadow-sm">
              <BarChart3 size={16} className="text-white" />
            </div>
            {loading ? 'Loading...' : `${job?.job_number} — P&L`}
          </h1>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-6 py-6">
        {loading ? (
          <div className="p-20 text-center">
            <div className="w-10 h-10 mx-auto mb-3 relative">
              <div className="absolute inset-0 rounded-full border-[3px] border-slate-100" />
              <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-emerald-600 animate-spin" />
            </div>
            <p className="text-slate-400 text-sm">Loading job data...</p>
          </div>
        ) : job && totals ? (
          <>
            {/* Job Info + P&L Hero */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              {/* Job card */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/60 shadow-sm p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">{job.job_number}</p>
                    <h2 className="text-xl font-bold text-slate-900">{job.title}</h2>
                    <p className="text-slate-500 mt-0.5">{job.customer_name}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-[11px] font-bold border ${
                    job.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    job.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-slate-50 text-slate-600 border-slate-200'
                  }`}>
                    {job.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-slate-600 pt-3 border-t border-slate-100">
                  {job.scheduled_date && (
                    <div className="flex items-center gap-1.5">
                      <Calendar size={14} className="text-slate-400" />
                      {new Date(job.scheduled_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}
                  {job.estimated_hours && (
                    <div className="flex items-center gap-1.5">
                      <Clock size={14} className="text-slate-400" />
                      Est. {job.estimated_hours}h
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Users size={14} className="text-slate-400" />
                    {totals.workerCount} worker{totals.workerCount !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {/* P&L hero */}
              <div className={`rounded-xl p-5 border shadow-sm ${profitPositive ? 'bg-gradient-to-br from-emerald-600 to-teal-700' : 'bg-gradient-to-br from-red-600 to-rose-700'} text-white`}>
                <div className="flex items-center gap-2 mb-3">
                  {profitPositive ? <TrendingUp size={16} className="text-emerald-200" /> : <TrendingDown size={16} className="text-red-200" />}
                  <span className="text-xs font-bold uppercase tracking-wider opacity-80">Gross Profit</span>
                </div>
                <p className="text-3xl font-bold mb-1">
                  {profitPositive ? '+' : ''}{`$${fmt(totals.grossProfit)}`}
                </p>
                <p className="text-sm opacity-70 mb-4">
                  {totals.grossMarginPct != null ? `${totals.grossMarginPct}% margin` : 'No quote on file'}
                </p>
                <div className="pt-3 border-t border-white/20 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="opacity-60 mb-0.5">Quoted</p>
                    <p className="font-bold">{totals.jobQuote > 0 ? `$${fmt(totals.jobQuote)}` : '—'}</p>
                  </div>
                  <div>
                    <p className="opacity-60 mb-0.5">Labor Cost</p>
                    <p className="font-bold">${fmt(totals.totalLaborCost)}</p>
                  </div>
                  <div>
                    <p className="opacity-60 mb-0.5">Total Hours</p>
                    <p className="font-bold">{totals.totalLaborHours.toFixed(1)}h</p>
                  </div>
                  <div>
                    <p className="opacity-60 mb-0.5">Workers</p>
                    <p className="font-bold">{totals.workerCount}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Worker Summary */}
            {workerSummary.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-4">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800">Workers on This Job</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Combined hours and cost per person</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {workerSummary.map((w, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {w.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{w.name}</p>
                          <p className="text-xs text-slate-400 capitalize">
                            {w.role} · {w.type === 'helper' ? 'Helper' : 'Operator'}
                            {w.hourly_rate ? ` · $${w.hourly_rate}/hr` : ' · rate not set'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <p className="text-xs text-slate-400">Hours</p>
                          <p className="text-sm font-bold text-slate-800 tabular-nums">{w.total_hours.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Labor Cost</p>
                          <p className="text-sm font-bold text-slate-800 tabular-nums">
                            {w.labor_cost > 0 ? `$${fmt(w.labor_cost)}` : '—'}
                          </p>
                        </div>
                        {totals.jobQuote > 0 && (
                          <div className="hidden sm:block">
                            <p className="text-xs text-slate-400">% of Quote</p>
                            <p className="text-sm font-bold text-slate-800 tabular-nums">
                              {((w.labor_cost / totals.jobQuote) * 100).toFixed(1)}%
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Operator Timecard Entries */}
            {timecardEntries.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-4">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800">Operator Time Entries</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{timecardEntries.length} timecard entries linked to this job</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100">
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Operator</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Clock In</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Clock Out</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Hours</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rate</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cost</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {timecardEntries.map(entry => {
                        const badge = HOUR_TYPE_BADGE[entry.is_shop_hours ? 'shop' : entry.hour_type] || HOUR_TYPE_BADGE.regular;
                        return (
                          <tr key={entry.id} className="hover:bg-blue-50/30 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="text-sm font-medium text-slate-800">{entry.worker_name}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="text-sm text-slate-600">{fmtDate(entry.date)}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="text-sm tabular-nums text-slate-700">{fmtTime(entry.clock_in_time)}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {entry.clock_out_time
                                ? <span className="text-sm tabular-nums text-slate-700">{fmtTime(entry.clock_out_time)}</span>
                                : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />Active
                                  </span>}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              <span className="text-sm font-bold tabular-nums text-slate-800">
                                {entry.total_hours != null ? entry.total_hours.toFixed(2) : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              <span className="text-xs text-slate-500">
                                {entry.hourly_rate ? `$${entry.hourly_rate}/hr` : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              <span className="text-sm font-semibold text-slate-800">
                                {entry.labor_cost > 0 ? `$${fmt(entry.labor_cost)}` : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badge.color}`}>
                                {entry.is_shop_hours ? 'Shop' : badge.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
                              {entry.is_approved
                                ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><CheckCircle size={10} />Approved</span>
                                : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500"><Clock size={10} />Pending</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Helper Work Log Entries */}
            {helperEntries.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-4">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800">Helper / Apprentice Entries</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{helperEntries.length} work log entries</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100">
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Helper</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">End</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Hours</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rate</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {helperEntries.map(entry => (
                        <tr key={entry.id} className="hover:bg-purple-50/30 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm font-medium text-slate-800">{entry.worker_name}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-slate-600">{fmtDate(entry.date)}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm tabular-nums text-slate-700">
                              {entry.started_at ? fmtTime(entry.started_at) : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm tabular-nums text-slate-700">
                              {entry.completed_at ? fmtTime(entry.completed_at) : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <span className="text-sm font-bold tabular-nums text-slate-800">
                              {entry.total_hours.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <span className="text-xs text-slate-500">
                              {entry.hourly_rate ? `$${entry.hourly_rate}/hr` : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <span className="text-sm font-semibold text-slate-800">
                              {entry.labor_cost > 0 ? `$${fmt(entry.labor_cost)}` : '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {timecardEntries.length === 0 && helperEntries.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-12 text-center">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Clock className="text-slate-300" size={24} />
                </div>
                <p className="text-slate-600 font-semibold">No time entries yet</p>
                <p className="text-slate-400 text-sm mt-1">Time entries will appear here once operators clock in with this job selected</p>
              </div>
            )}
          </>
        ) : (
          <div className="p-12 text-center">
            <p className="text-slate-500">Job not found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
