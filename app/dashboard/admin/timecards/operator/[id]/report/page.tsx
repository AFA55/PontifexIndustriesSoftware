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
import { useBranding } from '@/lib/branding-context';
import { ratingBand, type OperatorRatingResult } from '@/lib/operator-rating';

const ADMIN_ROLES = ['admin', 'super_admin', 'operations_manager'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TIME_OFF_LABELS: Record<string, string> = {
  vacation: 'Vacation', sick: 'Sick', personal: 'Personal', unpaid: 'Unpaid', other: 'Other',
};

interface MonthRow {
  month: number; daysWorked: number; totalHours: number; regularHours: number;
  overtimeHours: number; lateDays: number; lateMinutes: number; shopDays: number;
  subsistenceNights: number; timeOffDays: Record<string, number>;
  attendanceCodes?: Record<string, number>;
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
  helperReviews?: {
    count: number; averageRating: number | null;
    items: Array<{ createdAt: string; rating: number | null; comment: string | null; reviewer: string; jobNumber?: string; customer?: string }>;
  };
  supervisorVisits?: {
    count: number; averageRating: number | null;
    items: Array<{
      id: string; visitDate: string; supervisor: string | null; jobNumber: string | null; customer: string | null;
      performance: number | null; safety: number | null; cleanliness: number | null;
      observations: string | null; issuesFlagged: string | null;
      followUpRequired: boolean; followUpNotes: string | null;
    }>;
  };
  compositeRating?: OperatorRatingResult | null;
  /** Names the sources that failed to load; when set, no composite is shown. */
  compositeUnavailable?: string[] | null;
}

export default function OperatorAnnualReportPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const operatorId = params.id as string;
  const { branding } = useBranding();
  const accent = branding.primary_color || '#1E40AF';

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
  const allCodes = data
    ? [...new Set(data.months.flatMap((m) => Object.keys(m.attendanceCodes ?? {})))]
    : [];

  const companyLocation = [branding.company_city, branding.company_state, branding.company_zip]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="annual-report-print mx-auto w-full max-w-5xl px-4 py-6 print:max-w-none print:p-0">
      {/* Print-safe colors: dark-mode classes would otherwise print white text
          on the (unprinted) white page. Only `color`/background are forced —
          inline accent styles on borders/`.print-accent` keep the brand color. */}
      <style>{`
        @media print {
          .annual-report-print { background: #fff !important; }
          .annual-report-print, .annual-report-print * { color: #000 !important; }
          .annual-report-print .print-accent { color: ${accent} !important; }
        }
      `}</style>

      {/* Branded header (print only — same pattern as completed-print) */}
      <div
        className="hidden border-b-4 pb-3 mb-4 print:flex items-start justify-between"
        style={{ borderColor: accent }}
      >
        <div className="flex items-center gap-3">
          {branding.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo_url} alt="" className="h-14 w-auto object-contain" />
          )}
          <div>
            <h1 className="text-xl font-extrabold tracking-wide leading-tight">{branding.company_name}</h1>
            {(branding.company_address || companyLocation) && (
              <p className="text-[11px] text-gray-600 leading-tight">
                {[branding.company_address, companyLocation].filter(Boolean).join(' · ')}
              </p>
            )}
            {branding.support_phone && (
              <p className="text-[11px] text-gray-600 leading-tight">{branding.support_phone}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Annual Report</p>
          <p className="print-accent text-2xl font-extrabold font-mono leading-none" style={{ color: accent }}>
            {year}
          </p>
        </div>
      </div>

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
                  {allCodes.map((c) => (
                    <th key={c} className="px-3 py-3 text-right">{c}</th>
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
                    {allCodes.map((c) => (
                      <td key={c} className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-white/50">{m.attendanceCodes?.[c] || '—'}</td>
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
                  {allCodes.map((c) => (
                    <td key={c} className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-white/80">{(data.totals as any).attendanceCodes?.[c] ?? 0}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Overall standing — the canonical composite across every grading
              source (lib/operator-rating.ts). Computed on read, so it can never
              drift from the reviews below it. */}
          {data.compositeUnavailable && data.compositeUnavailable.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-700/40 dark:bg-amber-900/15 print:border-slate-300">
              <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">Overall Standing unavailable</h3>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                Could not load {data.compositeUnavailable.join(' + ')}. A score computed from the
                remaining sources would be wrong, so none is shown. Reload to try again.
              </p>
            </div>
          )}

          {data.compositeRating && data.compositeRating.totalReviews > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03] print:border-slate-300">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Overall Standing</h3>
                <span className="text-xs text-slate-500 dark:text-white/50">
                  {data.compositeRating.totalReviews} review{data.compositeRating.totalReviews === 1 ? '' : 's'} · all time
                </span>
              </div>
              {data.compositeRating.provisional ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <p className="text-sm font-semibold text-slate-700 dark:text-white/80">
                    Provisional — based on {data.compositeRating.totalReviews} review
                    {data.compositeRating.totalReviews === 1 ? '' : 's'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                    {data.compositeRating.provisionalReason === 'single_source'
                      ? 'Only one kind of reviewer has weighed in so far, so no overall score is published yet. The individual reviews are below.'
                      : 'Too few reviews to publish an overall score yet. The individual reviews are below.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-end gap-4">
                    <p className="font-mono text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                      {data.compositeRating.composite?.toFixed(2) ?? '—'}
                      <span className="text-base font-semibold text-slate-500 dark:text-white/50"> / 5</span>
                    </p>
                    <span className="pb-1 text-sm font-semibold text-slate-600 dark:text-white/70">
                      {ratingBand(data.compositeRating.composite).label}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(['supervisor', 'customer', 'helper'] as const)
                      .filter((k) => data.compositeRating!.sources[k].average !== null)
                      .map((k) => {
                        const s = data.compositeRating!.sources[k];
                        return (
                          <span
                            key={k}
                            className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-white/75"
                          >
                            {s.label}: {s.average?.toFixed(2)} ({Math.round(s.weight * 100)}%)
                          </span>
                        );
                      })}
                  </div>
                  {data.compositeRating.weakest && (
                    <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                      Lowest area: <strong>{data.compositeRating.weakest.label}</strong> ({data.compositeRating.weakest.average}/5)
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Supervisor site visits — how management graded them in the field.
              When the query itself failed, a bare "(0)" reads as "this employee
              was never visited", which is a different and much worse claim than
              "we couldn't load it". Say which one it is. */}
          {(() => {
            const visitsFailed = !!data.compositeUnavailable?.includes('supervisor visits');
            return (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03] print:border-slate-300">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Supervisor Visits{visitsFailed ? '' : ` (${data.supervisorVisits?.count ?? 0})`}
              </h3>
              {!visitsFailed && data.supervisorVisits?.averageRating != null && (
                <span className="flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1 text-sm font-bold text-violet-700">
                  <Star className="h-4 w-4 fill-violet-400 text-violet-400" /> {data.supervisorVisits.averageRating} / 5 average
                </span>
              )}
            </div>
            {visitsFailed ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Could not load supervisor visits — this is <strong>not</strong> a count of zero. Reload to try again.
              </p>
            ) : !data.supervisorVisits || data.supervisorVisits.items.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-white/50">No supervisor site visits logged for {data.year}.</p>
            ) : (
              <ul className="space-y-3">
                {data.supervisorVisits.items.map((v) => (
                  <li key={v.id} className="rounded-xl border border-slate-100 p-3.5 dark:border-white/5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white/85">
                        {v.supervisor ?? 'Supervisor'}{v.jobNumber ? ` · ${v.jobNumber}` : ''}
                      </p>
                      <span className="text-xs text-slate-400">
                        {new Date(v.visitDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-white/55">
                      {v.performance != null && <span>Performance <strong className="text-slate-700 dark:text-white/80">{v.performance}/5</strong></span>}
                      {v.safety != null && <span>Safety <strong className="text-slate-700 dark:text-white/80">{v.safety}/5</strong></span>}
                      {v.cleanliness != null && <span>Cleanliness <strong className="text-slate-700 dark:text-white/80">{v.cleanliness}/5</strong></span>}
                    </div>
                    {v.observations && (
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-white/60">“{v.observations}”</p>
                    )}
                    {v.issuesFlagged && (
                      <p className="mt-1.5 text-sm leading-relaxed text-amber-700 dark:text-amber-300">
                        Issues: {v.issuesFlagged}
                      </p>
                    )}
                    {v.followUpRequired && (
                      <p className="mt-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        Follow-up required{v.followUpNotes ? ` — ${v.followUpNotes}` : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
            );
          })()}

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

          {/* Helper → operator reviews (crew feedback) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03] print:border-slate-300">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Crew Reviews ({data.helperReviews?.count ?? 0})</h3>
              {data.helperReviews?.averageRating != null && (
                <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-sm font-bold text-indigo-700">
                  <Star className="h-4 w-4 fill-indigo-400 text-indigo-400" /> {data.helperReviews.averageRating} / 5 average
                </span>
              )}
            </div>
            {!data.helperReviews || data.helperReviews.items.length === 0 ? (
              <p className="text-sm text-slate-400">No crew reviews for {data.year} yet.</p>
            ) : (
              <ul className="space-y-3">
                {data.helperReviews.items.map((r, i) => (
                  <li key={i} className="rounded-xl border border-slate-100 p-3.5 dark:border-white/5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white/85">
                        {r.reviewer}{r.jobNumber ? ` · ${r.jobNumber}` : ''}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        {r.rating != null && (
                          <span className="flex items-center gap-0.5 font-bold text-indigo-600">
                            <Star className="h-3.5 w-3.5 fill-indigo-400 text-indigo-400" />{r.rating}/5
                          </span>
                        )}
                        {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    {r.comment && <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-white/60">“{r.comment}”</p>}
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
