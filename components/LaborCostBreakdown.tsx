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
import { AlertTriangle, Clock, DollarSign, Factory, HardHat, User } from 'lucide-react';

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
  excluded_reason: 'shop' | 'outside_job_window' | null;
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
}: {
  open: boolean;
  onClose: () => void;
  jobNumber?: string | null;
  labor: LaborBreakdownDTO | null;
}) {
  const lines = labor?.lines || [];
  const totals = labor?.totals || null;

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
            No time entries linked to this job
          </p>
          <p className="text-xs text-slate-400 dark:text-white/40 mt-1">
            Labor cost appears once operators clock in with this job selected.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
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
                    {l.bounded_hours.toFixed(2)}h on job
                  </span>
                  {l.excluded_hours > 0 && (
                    <span className="inline-flex items-center gap-1 text-slate-400 dark:text-white/40">
                      {l.excluded_reason === 'shop' && <Factory className="w-3 h-3" />}
                      excluded {l.excluded_hours.toFixed(2)}h{' '}
                      {l.excluded_reason === 'shop' ? '(shop)' : '(outside job window)'}
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
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
