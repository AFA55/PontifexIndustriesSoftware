'use client';

/**
 * LaborCostBreakdown — the click-through modal behind every "Labor Cost"
 * number. Shows the FULL math per worker line: raw clock span, bounded job
 * hours (with what was excluded and why), wage, burden %, base, burden, and
 * line total — plus the grand total. Data comes from GET /api/admin/job-pnl/[id]
 * (`data.labor`), which is the single source of labor-cost truth
 * (lib/labor-cost.ts + lib/labor-cost-server.ts).
 *
 * Used by: job P&L detail page + completed-jobs archive modal.
 */

import { Modal } from '@/components/ui/Modal';
import { AlertTriangle, Clock, DollarSign, Factory, HardHat, Link2Off, User } from 'lucide-react';

export interface LaborBreakdownLineDTO {
  id: string;
  source: 'timecard' | 'helper';
  worker_name: string;
  role: string | null;
  date: string | null;
  span_start: string | null;
  span_end: string | null;
  raw_hours: number;
  bounded_hours: number;
  excluded_hours: number;
  excluded_reason: 'shop' | 'outside_job_window' | 'other_job' | null;
  /** true = inferred from the office's placement, not tagged by the operator. */
  attributed?: boolean;
  hourly_rate: number | null;
  rate_missing: boolean;
  burden_pct: number;
  base_cost: number;
  burden_amount: number;
  total_cost: number;
}

export interface LaborBreakdownDTO {
  burden_pct: number;
  lines: LaborBreakdownLineDTO[];
  totals: {
    bounded_hours: number;
    base: number;
    burden: number;
    total: number;
    any_rate_missing: boolean;
    line_count: number;
    linked_hours?: number;
    attributed_hours?: number;
    attributed_total?: number;
    attributed_line_count?: number;
  };
}

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSpanTime(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtLineDate(d: string | null): string {
  if (!d) return '';
  // Bare YYYY-MM-DD must be parsed LOCAL (lib/dates.ts rule) or it renders a day early.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00') : new Date(d);
  if (!Number.isFinite(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function LaborCostBreakdown({
  open,
  onClose,
  jobNumber,
  labor,
  unattributableDates,
  reportedTotalHours,
}: {
  open: boolean;
  onClose: () => void;
  jobNumber?: string | null;
  labor: LaborBreakdownDTO | null;
  /**
   * Days somebody split across jobs, so their card could be given to nobody.
   * `/api/admin/job-pnl/[id]` has always returned these; the completed-jobs
   * archive did not pass them, so on JOB-2026-124747 and JOB-2026-364026 a real
   * 7.74h card was excluded as split and this modal presented the remainder as
   * the complete picture.
   */
  unattributableDates?: string[];
  /**
   * The "Total Hours" the surrounding screen shows (job_orders.total_hours_worked,
   * i.e. what the operators FILED on their daily logs). It is a different
   * measurement from bounded crew-hours — one job-elapsed, one per-person — and
   * on JOB-2026-343888 the tile read 4.9h beside a breakdown of 18.27h. Pass it
   * and the modal reconciles the two in words instead of leaving the office to
   * guess which is the billable one.
   */
  reportedTotalHours?: number | null;
}) {
  const lines = labor?.lines || [];
  const totals = labor?.totals || null;
  const splitDates = unattributableDates || [];
  const reported =
    reportedTotalHours != null && Number.isFinite(reportedTotalHours) && reportedTotalHours > 0
      ? reportedTotalHours
      : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-500" />
          Labor Cost Breakdown{jobNumber ? ` — ${jobNumber}` : ''}
        </span>
      }
      description={
        labor
          ? `Bounded job hours × wage, plus ${labor.burden_pct}% labor burden (taxes, comp, insurance).`
          : undefined
      }
    >
      {!labor || lines.length === 0 ? (
        <div className="py-10 text-center">
          <Clock className="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-white/20" />
          <p className="text-sm font-semibold text-slate-600 dark:text-white/70">
            No hours could be tied to this job
          </p>
          {/* The old copy — "No time entries LINKED to this job… clock in with
              this job selected" — described the query, not the world. It was
              shown on jobs the crew had demonstrably worked, because the cost
              path only ever asked for cards carrying a job_order_id. Now that
              the day cards are attributed too, an empty modal really does mean
              nobody's day can be tied here, and the copy says why. */}
          <p className="text-xs text-slate-400 dark:text-white/40 mt-1 max-w-xs mx-auto">
            Nobody was clocked in on this job, and no crew member&apos;s day card could be
            attributed to it — either they were placed elsewhere that day, or they split
            the day across jobs.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {(totals?.attributed_line_count ?? 0) > 0 && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm bg-sky-50 ring-1 ring-sky-200 text-sky-800 dark:bg-sky-500/10 dark:ring-sky-400/30 dark:text-sky-300">
              <Link2Off className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                <strong>
                  {(totals?.attributed_hours ?? 0).toFixed(2)}h of{' '}
                  {(totals?.bounded_hours ?? 0).toFixed(2)}h are attributed
                </strong>{' '}
                — those cards carry no job link, and count here because the office placed
                that person on this job (and only this job) that day. Lines marked{' '}
                <span className="font-semibold">(day card)</span> below. The rest were
                clocked in against this job directly.
              </span>
            </div>
          )}

          {splitDates.length > 0 && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm bg-amber-50 ring-1 ring-amber-200 text-amber-800 dark:bg-amber-500/10 dark:ring-amber-400/30 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Somebody split {splitDates.map((d) => fmtLineDate(d) || d).join(', ')} across more
                than one job, so their hours could not be given to this one. This total is an{' '}
                <strong>undercount</strong> for {splitDates.length === 1 ? 'that day' : 'those days'}.
              </span>
            </div>
          )}

          {totals?.any_rate_missing && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm bg-amber-50 ring-1 ring-amber-200 text-amber-800 dark:bg-amber-500/10 dark:ring-amber-400/30 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Some workers have no wage on file — their hours are listed but cost $0 here, so
                the total is an <strong>undercount</strong>. Set wages in Operator Profiles.
              </span>
            </div>
          )}

          {/* Line items */}
          <div className="rounded-xl ring-1 ring-slate-200 dark:ring-white/10 divide-y divide-slate-100 dark:divide-white/[0.06] overflow-hidden">
            {lines.map((l) => (
              <div key={`${l.source}-${l.id}`} className="p-3.5 bg-white dark:bg-white/[0.02]">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {l.source === 'helper' ? (
                      <HardHat className="w-4 h-4 text-indigo-500 dark:text-indigo-300 flex-shrink-0" />
                    ) : (
                      <User className="w-4 h-4 text-violet-500 dark:text-violet-300 flex-shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {l.worker_name}
                    </span>
                    {l.role && (
                      <span className="text-[11px] text-slate-400 dark:text-white/40 capitalize">
                        {String(l.role).replace(/_/g, ' ')}
                      </span>
                    )}
                    {/* Same wording as the printed work ticket's crew grouping,
                        deliberately: one label for one idea across every sheet
                        the office reads. */}
                    {l.attributed && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap bg-sky-100 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/20 dark:text-sky-200 dark:ring-sky-400/30">
                        <Link2Off className="w-2.5 h-2.5" />
                        day card
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                    {l.rate_missing ? (
                      <span className="text-amber-600 dark:text-amber-300 text-xs font-semibold">
                        rate not set
                      </span>
                    ) : (
                      `$${money(l.total_cost)}`
                    )}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-white/50">
                  <span>{fmtLineDate(l.date)}</span>
                  <span className="tabular-nums">
                    {fmtSpanTime(l.span_start)} → {l.span_end ? fmtSpanTime(l.span_end) : 'active'}
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-white/80 tabular-nums">
                    {l.bounded_hours.toFixed(2)}h {l.attributed ? 'attributed' : 'on job'}
                  </span>
                  {l.excluded_hours > 0 && (
                    <span className="inline-flex items-center gap-1 text-slate-400 dark:text-white/40">
                      {l.excluded_reason === 'shop' && <Factory className="w-3 h-3" />}
                      excluded {l.excluded_hours.toFixed(2)}h{' '}
                      {l.excluded_reason === 'shop'
                        ? '(shop)'
                        : l.excluded_reason === 'other_job'
                          ? '(another job that day + lunch)'
                          : '(outside job window)'}
                    </span>
                  )}
                </div>

                {/* The math, spelled out */}
                {!l.rate_missing && l.bounded_hours > 0 && (
                  <p className="mt-1.5 text-xs tabular-nums text-slate-500 dark:text-white/50">
                    {l.bounded_hours.toFixed(2)}h × ${money(l.hourly_rate || 0)}/hr = $
                    {money(l.base_cost)}
                    <span className="text-slate-400 dark:text-white/40">
                      {' '}
                      + {l.burden_pct}% burden ${money(l.burden_amount)}
                    </span>{' '}
                    = <span className="font-semibold text-slate-700 dark:text-white/80">${money(l.total_cost)}</span>
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Grand total */}
          {totals && (
            <div className="rounded-xl p-4 bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-400/30">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
                    Job Hours
                  </p>
                  <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                    {totals.bounded_hours.toFixed(2)}
                  </p>
                  {(totals.attributed_line_count ?? 0) > 0 && (
                    <p className="text-[10px] font-medium text-sky-700 dark:text-sky-300 tabular-nums mt-0.5">
                      {(totals.linked_hours ?? 0).toFixed(2)} clocked ·{' '}
                      {(totals.attributed_hours ?? 0).toFixed(2)} attributed
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
                    Base Wages
                  </p>
                  <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                    ${money(totals.base)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
                    Burden ({labor.burden_pct}%)
                  </p>
                  <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                    ${money(totals.burden)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Total Labor
                  </p>
                  <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                    ${money(totals.total)}
                  </p>
                </div>
              </div>

              {/* TWO DIFFERENT MEASUREMENTS, NAMED. The tile behind this modal
                  shows what the operators filed on their daily logs — elapsed
                  time on the job. This shows crew-hours: every person's paid
                  time, added up. Three people for four hours is 4 filed and 12
                  billable, so the numbers SHOULD differ; what they must not do
                  is sit on one screen unlabelled, which is how 4.9h and 18.27h
                  appeared together on JOB-2026-343888 with nothing to say which
                  one an invoice takes. */}
              {reported != null && Math.abs(reported - totals.bounded_hours) >= 0.05 && (
                <p className="mt-3 pt-3 border-t border-emerald-200/70 dark:border-emerald-400/20 text-[11px] leading-relaxed text-slate-600 dark:text-white/60">
                  The job&apos;s <span className="font-semibold">{reported.toFixed(2)}h</span>{' '}
                  &quot;total hours&quot; is what the crew FILED on their daily logs — how long the
                  job ran. The{' '}
                  <span className="font-semibold">{totals.bounded_hours.toFixed(2)}h</span> above is
                  CREW-hours, every person&apos;s paid time added together. Labor cost is built from
                  the crew-hours.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
