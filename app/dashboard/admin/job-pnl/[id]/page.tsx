'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isAdmin, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import UserAvatar from '@/components/UserAvatar';
import LaborCostBreakdown, { type LaborBreakdownDTO } from '@/components/LaborCostBreakdown';
import { formatDay } from '@/lib/dates';
import { quotedAmount, QUOTED_AMOUNT_LABEL } from '@/lib/job-quoted-amount';
import {
  ArrowLeft, Clock, DollarSign, Users, TrendingUp, TrendingDown,
  CheckCircle, AlertTriangle, BarChart3, Calendar, User as UserIcon,
  Briefcase, Moon, Factory, Link2Off
} from 'lucide-react';

interface JobDetail {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  status: string;
  scheduled_date: string;
  /** The RESOLVED quote the route already applied `quotedAmount` to. */
  job_quote: number;
  /**
   * The raw column the schedule form actually writes. The API has always sent
   * it; this page declared only `job_quote`, so the field was dropped on
   * arrival and the page quoted $0 with a blank margin on jobs the Completed
   * Jobs modal showed a real quote for. Same declare-nothing-and-drop-it shape
   * as the `attributed` flag. Read it through `quotedAmount`, never directly.
   */
  estimated_cost: number | null;
  estimated_hours: number | null;
  track_financials: boolean;
}

interface CostBreakdown {
  driveDistanceMiles: number;
  mileageRate: number;
  driveCost: number;
  totalNonLaborCost: number;
}

interface TimecardEntry {
  id: string;
  worker_name: string;
  role: string;
  hourly_rate: number | null;
  date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  /** Hours THIS JOB is charged (bounded), not the card's whole paid day. */
  total_hours: number | null;
  /** The card's own paid day, and what this job did not get. */
  raw_hours?: number;
  excluded_hours?: number;
  excluded_reason?: 'shop' | 'outside_job_window' | 'other_job' | null;
  labor_cost: number;
  hour_type: string;
  is_shop_hours: boolean;
  is_night_shift: boolean;
  is_approved: boolean;
  /**
   * TRUE = these hours are ATTRIBUTED, not recorded: the card carries no job
   * link and counts here because the office placed this person on this job that
   * day. The API has always sent this; the page declared no field for it, so it
   * was silently discarded and every row rendered as if it were clocked in
   * against the job. This screen is the primary admin cost screen — an inferred
   * hour must never wear the authority of a recorded one on it.
   */
  attributed?: boolean;
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
  avatar_url: string | null;
  role: string;
  hourly_rate: number | null;
  total_hours: number;
  /** Of `total_hours`, the part that rests on attribution rather than a clock-in. */
  attributed_hours?: number;
  labor_cost: number;
  type: string;
}

interface Totals {
  totalLaborHours: number;
  totalLaborCost: number;
  totalNonLaborCost: number;
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

/**
 * A DB `date` column arrives as a bare 'YYYY-MM-DD'. `new Date('2026-08-05')`
 * is UTC midnight and renders as Aug 4 in every US timezone — the rule
 * CLAUDE.md forbids and lib/dates.ts exists to enforce. It was wrong here
 * already; attribution now feeds this row a whole new class of dates.
 */
function fmtDate(d: string): string {
  if (!d) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? formatDay(d)
    : new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown | null>(null);
  const [labor, setLabor] = useState<LaborBreakdownDTO | null>(null);
  /**
   * Days somebody split across jobs, so their card could be given to nobody.
   * The API has always returned this and the page never read it, which is the
   * worst of both worlds: the hours below are an undercount and the screen
   * presented them as complete.
   */
  const [unattributableDates, setUnattributableDates] = useState<string[]>([]);
  const [showLaborModal, setShowLaborModal] = useState(false);
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
        setCostBreakdown(result.data.costBreakdown);
        setLabor(result.data.labor || null);
        setUnattributableDates(result.data.unattributableDates || []);
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
  // The quoted figure, by the ONE shared rule the Completed Jobs modal uses.
  // The route's gross profit / margin are computed from the same function, so
  // the two can never quote different numbers for the same job.
  const quoted = quotedAmount(job);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
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
                    {/* Same rule and same words as the Completed Jobs modal —
                        `estimated_cost` first, `job_quote` as the fallback. */}
                    <p className="opacity-60 mb-0.5">{QUOTED_AMOUNT_LABEL}</p>
                    <p className="font-bold">{quoted != null && quoted > 0 ? `$${fmt(quoted)}` : '—'}</p>
                  </div>
                  <div>
                    <p className="opacity-60 mb-0.5">Labor Cost</p>
                    {/* Clickable — opens the full who/hours/rate/burden breakdown */}
                    <button
                      type="button"
                      onClick={() => setShowLaborModal(true)}
                      className="font-bold underline decoration-dotted underline-offset-2 hover:opacity-80 transition-opacity text-left min-h-[28px]"
                      title="View labor cost breakdown"
                    >
                      {labor && labor.totals.line_count > 0 && labor.totals.any_rate_missing
                        ? 'rates not set'
                        : `$${fmt(totals.totalLaborCost)}`}
                    </button>
                  </div>
                  {job.track_financials && (
                    <div>
                      <p className="opacity-60 mb-0.5">Other Costs</p>
                      <p className="font-bold">${fmt(totals.totalNonLaborCost)}</p>
                    </div>
                  )}
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

            {/* Cost Breakdown (only for jobs with financial tracking enabled) */}
            {job.track_financials && costBreakdown && (
              <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-4">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800">Cost Breakdown</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Labor + mileage vs. quote — financial tracking enabled</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100">
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cost Category</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      <tr>
                        <td className="px-4 py-3 text-sm text-slate-700">Labor</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-slate-800">${fmt(totals.totalLaborCost)}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          Drive
                          {costBreakdown.driveDistanceMiles > 0 && (
                            <span className="text-xs text-slate-400"> ({costBreakdown.driveDistanceMiles} mi @ ${costBreakdown.mileageRate}/mi)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-slate-800">${fmt(costBreakdown.driveCost)}</td>
                      </tr>
                      <tr className="bg-slate-50/60">
                        <td className="px-4 py-3 text-sm font-bold text-slate-800">Total Cost</td>
                        <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-slate-900">
                          ${fmt(totals.totalLaborCost + costBreakdown.totalNonLaborCost)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-sm text-slate-700">{QUOTED_AMOUNT_LABEL}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-slate-800">
                          {totals.jobQuote > 0 ? `$${fmt(totals.jobQuote)}` : '—'}
                        </td>
                      </tr>
                      <tr className={profitPositive ? 'bg-emerald-50/60' : 'bg-red-50/60'}>
                        <td className={`px-4 py-3 text-sm font-bold ${profitPositive ? 'text-emerald-700' : 'text-red-700'}`}>
                          Gross Profit{totals.grossMarginPct != null ? ` (${totals.grossMarginPct}% margin)` : ''}
                        </td>
                        <td className={`px-4 py-3 text-right text-sm font-bold tabular-nums ${profitPositive ? 'text-emerald-700' : 'text-red-700'}`}>
                          {profitPositive ? '+' : ''}${fmt(totals.grossProfit)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Worker Summary */}
            {workerSummary.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-4">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800">Workers on This Job</h3>
                  {/* This panel merged attributed and clocked hours into one
                      per-person figure with nothing to tell them apart. The
                      split is now shown under each total. */}
                  <p className="text-xs text-slate-400 mt-0.5">
                    Job hours and cost per person — attributed day-card hours called out separately
                  </p>
                </div>
                <div className="divide-y divide-slate-50">
                  {workerSummary.map((w, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <UserAvatar src={w.avatar_url} name={w.name} size={36} />
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
                          {(w.attributed_hours ?? 0) > 0 && (
                            <p className="text-[10px] font-medium text-sky-700 tabular-nums">
                              {(w.attributed_hours ?? 0).toFixed(2)} attributed
                            </p>
                          )}
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
            {timecardEntries.length > 0 && (() => {
              const attributedCount = timecardEntries.filter((e) => e.attributed).length;
              const linkedCount = timecardEntries.length - attributedCount;
              return (
              <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-4">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800">Operator Time Entries</h3>
                  {/* This line used to read "N timecard entries LINKED to this
                      job" for every N, including the jobs where zero cards are
                      linked and all N reached the job by attribution
                      (JOB-2026-343888 read "2 … linked" with 0 linked). It now
                      counts the two classes separately, because the office
                      writes invoices off this page. */}
                  <p className="text-xs text-slate-400 mt-0.5">
                    {linkedCount > 0 && `${linkedCount} clocked in against this job`}
                    {linkedCount > 0 && attributedCount > 0 && ' · '}
                    {attributedCount > 0 && `${attributedCount} attributed from unlinked day cards`}
                  </p>
                </div>

                {attributedCount > 0 && (
                  <div className="mx-5 mt-4 flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm bg-sky-50 ring-1 ring-sky-200 text-sky-800">
                    <Link2Off className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      Rows marked <span className="font-semibold">(day card)</span> carry no job
                      link — they count here because the office placed that person on this job, and
                      only this job, that day. Inferred, not clocked.
                    </span>
                  </div>
                )}

                {unattributableDates.length > 0 && (
                  <div className="mx-5 mt-4 flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm bg-amber-50 ring-1 ring-amber-200 text-amber-800">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      Somebody split{' '}
                      {unattributableDates.map((d) => fmtDate(d)).join(', ')} across more than one
                      job, so their hours could not be given to this one. The hours below are an{' '}
                      <strong>undercount</strong> for{' '}
                      {unattributableDates.length === 1 ? 'that day' : 'those days'}.
                    </span>
                  </div>
                )}
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
                              {/* Same wording as the labor-cost modal, the
                                  completed-jobs tile and the printed ticket:
                                  one label for one idea on every sheet the
                                  office reads. */}
                              {entry.attributed && (
                                <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap bg-sky-100 text-sky-700 ring-1 ring-sky-200">
                                  <Link2Off size={10} />
                                  day card
                                </span>
                              )}
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
                            {/* Hours THIS JOB is charged. When the card's own
                                paid day was larger, say so and why, rather than
                                quoting a smaller number with no explanation. */}
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              <span className="text-sm font-bold tabular-nums text-slate-800">
                                {entry.total_hours != null ? entry.total_hours.toFixed(2) : '—'}
                              </span>
                              {(entry.excluded_hours ?? 0) > 0 && (
                                <span className="block text-[10px] text-slate-400 tabular-nums">
                                  of {(entry.raw_hours ?? 0).toFixed(2)} paid
                                  {entry.excluded_reason === 'shop'
                                    ? ' (shop)'
                                    : entry.excluded_reason === 'other_job'
                                      ? ' (another job)'
                                      : ' (off job)'}
                                </span>
                              )}
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
              );
            })()}

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

      <LaborCostBreakdown
        open={showLaborModal}
        onClose={() => setShowLaborModal(false)}
        jobNumber={job?.job_number}
        labor={labor}
        unattributableDates={unattributableDates}
      />
    </div>
  );
}
