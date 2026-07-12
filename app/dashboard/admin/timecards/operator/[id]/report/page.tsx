'use client';

export const dynamic = 'force-dynamic';

/**
 * Annual Employee Report — /dashboard/admin/timecards/operator/[id]/report
 * (founder Jul 12, digitizing Patriot's paper attendance tracker): per-month
 * attendance + hours, year totals, and customer survey reviews for the
 * operator. Print button = instant PDF via the browser (clean print CSS).
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Printer, Loader2, Star, FileBarChart } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

const ADMIN_ROLES = ['admin', 'super_admin', 'operations_manager'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TIME_OFF_LABELS: Record<string, string> = {
  vacation: 'Vacation', sick: 'Sick', personal: 'Personal', unpaid: 'Unpaid', other: 'Other',
};

interface MonthRow {
  month: number; daysWorked: number; totalHours: number; regularHours: number;
  overtimeHours: number; lateDays: number; lateMinutes: number; shopDays: number;
  subsistenceNights: number; timeOffDays: Record<string, number>;
}
interface ReportData {
  year: number;
  employee: { name: string; role: string; email: string };
  months: MonthRow[];
  totals: Omit<MonthRow, 'month' | 'shopDays'> & { timeOffDays: Record<string, number> };
  surveys: {
    count: number; averageRating: number | null;
    items: Array<{ submittedAt: string; overall: number | null; communication: number | null; cleanliness: number | null; wouldRecommend: boolean | null; feedback: string | null; jobNumber?: string; customer?: string }>;
  };
}

export default function OperatorAnnualReportPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const operatorId = params.id as string;

  const [year, setYear] = useState(() => {
    const y = search.get('year');
    return /^\d{4}$/.test(y ?? '') ? Number(y) : new Date().getFullYear();
  });
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) { router.push('/login'); return; }
    if (!ADMIN_ROLES.includes(u.role)) { router.push('/dashboard'); }
  }, [router]);

  const load = useCallback(async (y: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Session expired — sign in again.'); return; }
      const res = await fetch(`/api/admin/operator-report/${operatorId}?year=${y}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json?.error || 'Failed to load report'); return; }
      setData(json.data);
    } catch {
      setError('Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [operatorId]);

  useEffect(() => { load(year); }, [year, load]);

  const yearOptions = (() => {
    const now = new Date().getFullYear();
    return [now, now - 1, now - 2];
  })();

  const allTimeOffTypes = data
    ? [...new Set(data.months.flatMap((m) => Object.keys(m.timeOffDays)))]
    : [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 print:max-w-none print:p-0">
      {/* Toolbar (hidden in print) */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/admin/timecards/operator/${operatorId}`}
            aria-label="Back to timecards"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <FileBarChart className="h-5 w-5 text-brand" /> Annual Report
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:opacity-90"
          >
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
      ) : error || !data ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error ?? 'No data'}</p>
      ) : (
        <div className="space-y-6 print:space-y-4">
          {/* Header */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03] print:border-slate-300">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Employee Annual Report · {data.year}</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{data.employee.name}</h2>
                <p className="text-sm capitalize text-slate-500 dark:text-white/50">{data.employee.role} · {data.employee.email}</p>
              </div>
              <div className="flex gap-6 text-right">
                <Stat label="Hours" value={data.totals.totalHours.toLocaleString()} />
                <Stat label="OT hrs" value={data.totals.overtimeHours.toLocaleString()} />
                <Stat label="Days worked" value={String(data.totals.daysWorked)} />
                <Stat label="Late" value={`${data.totals.lateDays}× · ${data.totals.lateMinutes}m`} accent={data.totals.lateDays > 0} />
              </div>
            </div>
          </div>

          {/* Monthly grid — the paper tracker, digitized */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03] print:border-slate-300">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:border-white/10">
                  <th className="px-4 py-3">Month</th>
                  <th className="px-3 py-3 text-right">Days</th>
                  <th className="px-3 py-3 text-right">Hours</th>
                  <th className="px-3 py-3 text-right">Reg</th>
                  <th className="px-3 py-3 text-right">OT</th>
                  <th className="px-3 py-3 text-right">Late</th>
                  <th className="px-3 py-3 text-right">Late min</th>
                  <th className="px-3 py-3 text-right">Subsist.</th>
                  {allTimeOffTypes.map((t) => (
                    <th key={t} className="px-3 py-3 text-right">{TIME_OFF_LABELS[t] ?? t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.month} className="border-b border-slate-100 last:border-0 dark:border-white/5">
                    <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-white/80">{MONTHS[m.month - 1]}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-white/70">{m.daysWorked || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-white/70">{m.totalHours || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-white/50">{m.regularHours || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-white/50">{m.overtimeHours || '—'}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${m.lateDays ? 'text-rose-600' : 'text-slate-400 dark:text-white/40'}`}>{m.lateDays || '—'}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${m.lateMinutes ? 'text-rose-500' : 'text-slate-400 dark:text-white/40'}`}>{m.lateMinutes || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-white/50">{m.subsistenceNights || '—'}</td>
                    {allTimeOffTypes.map((t) => (
                      <td key={t} className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-white/50">{m.timeOffDays[t] || '—'}</td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold dark:bg-white/[0.04]">
                  <td className="px-4 py-3 text-slate-900 dark:text-white">Year total</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-900 dark:text-white">{data.totals.daysWorked}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-900 dark:text-white">{data.totals.totalHours}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-white/80">{data.totals.regularHours}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-white/80">{data.totals.overtimeHours}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${data.totals.lateDays ? 'text-rose-600' : 'text-slate-700'}`}>{data.totals.lateDays}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${data.totals.lateMinutes ? 'text-rose-500' : 'text-slate-700'}`}>{data.totals.lateMinutes}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-white/80">{data.totals.subsistenceNights}</td>
                  {allTimeOffTypes.map((t) => (
                    <td key={t} className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-white/80">{data.totals.timeOffDays[t] ?? 0}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Customer surveys */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03] print:border-slate-300">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Customer Reviews ({data.surveys.count})</h3>
              {data.surveys.averageRating != null && (
                <span className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {data.surveys.averageRating} / 5 average
                </span>
              )}
            </div>
            {data.surveys.items.length === 0 ? (
              <p className="text-sm text-slate-400">No customer surveys for {data.year} yet.</p>
            ) : (
              <ul className="space-y-3">
                {data.surveys.items.map((s, i) => (
                  <li key={i} className="rounded-xl border border-slate-100 p-3.5 dark:border-white/5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white/85">
                        {s.customer ?? 'Customer'}{s.jobNumber ? ` · ${s.jobNumber}` : ''}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        {s.overall != null && (
                          <span className="flex items-center gap-0.5 font-bold text-amber-600">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{s.overall}/5
                          </span>
                        )}
                        {new Date(s.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    {s.feedback && <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-white/60">“{s.feedback}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`font-mono text-lg font-bold tabular-nums ${accent ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>{value}</p>
    </div>
  );
}
