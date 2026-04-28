'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Wallet,
  Pencil,
  Check,
  X as XIcon,
  ChevronRight,
} from 'lucide-react';

interface BreakdownRow {
  job_id: string;
  job_number: string;
  job_status: string;
  customer_name: string;
  scheduled_date: string;
  total_quoted: number;
  total_invoiced: number;
  total_paid: number;
  commission_rate: number;
  commission_pending: number;
  commission_earned: number;
}

interface Props {
  pending: number;
  earnedMtd: number;
  earnedYtd: number;
  breakdown: BreakdownRow[];
  defaultRate: number;
  onUpdateDefaultRate: (rate: number) => Promise<void>;
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function StatusBadge({ row }: { row: BreakdownRow }) {
  // Earned trumps everything else
  if (row.commission_earned > 0 && row.commission_pending === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30">
        Earned
      </span>
    );
  }
  if (row.commission_pending > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30">
        Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-white/10 dark:text-white/70 dark:ring-white/10">
      No invoice
    </span>
  );
}

export default function CommissionsCard({
  pending,
  earnedMtd,
  earnedYtd,
  breakdown,
  defaultRate,
  onUpdateDefaultRate,
}: Props) {
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState(String(defaultRate ?? 0));
  const [saving, setSaving] = useState(false);

  const handleSaveRate = async () => {
    const parsed = parseFloat(rateInput);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
      setRateInput(String(defaultRate ?? 0));
      setEditingRate(false);
      return;
    }
    setSaving(true);
    try {
      await onUpdateDefaultRate(parsed);
      setEditingRate(false);
    } catch {
      // keep editor open; caller should surface errors
    } finally {
      setSaving(false);
    }
  };

  const handleCancelRate = () => {
    setRateInput(String(defaultRate ?? 0));
    setEditingRate(false);
  };

  return (
    <div className="
      relative overflow-hidden rounded-2xl shadow-sm
      bg-white border border-slate-200
      dark:bg-gradient-to-br dark:from-[#180c2c]/80 dark:to-[#0e0720]/80
      dark:border-white/10 dark:backdrop-blur
    ">
      {/* Top accent stripe */}
      <span
        className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-500"
        aria-hidden
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <span className="
            inline-flex items-center justify-center w-9 h-9 rounded-xl
            bg-emerald-50 text-emerald-600
            dark:bg-emerald-500/15 dark:text-emerald-300
          ">
            <Wallet className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Commissions
            </h2>
            <p className="text-xs text-slate-500 dark:text-white/60">
              Per-job earnings tied to your quotes &amp; payments
            </p>
          </div>
        </div>

        {/* Default rate editor */}
        <div className="flex items-center gap-2">
          {editingRate ? (
            <>
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max="100"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  className="w-16 bg-transparent text-sm font-semibold text-slate-900 dark:text-white outline-none tabular-nums"
                  autoFocus
                />
                <span className="text-xs text-slate-500 dark:text-white/60">%</span>
              </div>
              <button
                onClick={handleSaveRate}
                disabled={saving}
                className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                title="Save"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleCancelRate}
                disabled={saving}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/70 transition-colors disabled:opacity-50"
                title="Cancel"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setRateInput(String(defaultRate ?? 0));
                setEditingRate(true);
              }}
              className="
                inline-flex items-center gap-1.5 text-xs font-medium
                px-2.5 py-1.5 rounded-lg border
                bg-white border-slate-200 text-slate-700 hover:bg-slate-50
                dark:bg-white/5 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/10
                transition-colors
              "
              title="Edit default rate"
            >
              Default rate: <span className="font-semibold tabular-nums">{(defaultRate ?? 0).toFixed(2)}%</span>
              <Pencil className="w-3 h-3 text-slate-400 dark:text-white/40" />
            </button>
          )}
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-2 px-5 pb-4">
        <div className="rounded-xl px-3 py-2.5 bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-400/30">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-amber-700 dark:text-amber-300">
            Pending
          </p>
          <p className="text-lg font-bold text-amber-900 dark:text-amber-100 tabular-nums mt-0.5">
            {fmtMoney(pending)}
          </p>
        </div>
        <div className="rounded-xl px-3 py-2.5 bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-400/30">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700 dark:text-emerald-300">
            Earned MTD
          </p>
          <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100 tabular-nums mt-0.5">
            {fmtMoney(earnedMtd)}
          </p>
        </div>
        <div className="rounded-xl px-3 py-2.5 bg-slate-50 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-600 dark:text-white/70">
            Earned YTD
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
            {fmtMoney(earnedYtd)}
          </p>
        </div>
      </div>

      {/* Breakdown */}
      {breakdown.length === 0 ? (
        <div className="px-5 py-10 text-center border-t border-slate-100 dark:border-white/5">
          <Wallet className="w-10 h-10 text-slate-300 dark:text-white/20 mx-auto mb-2" />
          <p className="text-sm text-slate-500 dark:text-white/60">
            No jobs yet — quote and schedule jobs to start earning commissions
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border-t border-slate-100 dark:border-white/5">
            <div className={breakdown.length > 10 ? 'max-h-[480px] overflow-y-auto' : ''}>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-white/5 sticky top-0 backdrop-blur">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/60">
                    <th className="px-3 py-2 font-semibold">Job #</th>
                    <th className="px-3 py-2 font-semibold">Customer</th>
                    <th className="px-3 py-2 font-semibold">Scheduled</th>
                    <th className="px-3 py-2 font-semibold text-right">Quoted</th>
                    <th className="px-3 py-2 font-semibold text-right">Invoiced</th>
                    <th className="px-3 py-2 font-semibold text-right">Paid</th>
                    <th className="px-3 py-2 font-semibold text-right">Rate</th>
                    <th className="px-3 py-2 font-semibold text-right">Pending</th>
                    <th className="px-3 py-2 font-semibold text-right">Earned</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <tr
                      key={row.job_id}
                      className="border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/dashboard/admin/jobs/${row.job_id}`}
                          className="font-mono text-xs text-violet-700 dark:text-violet-300 hover:underline"
                        >
                          {row.job_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-white/80 truncate max-w-[180px]">
                        {row.customer_name}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-white/50 text-xs">
                        {fmtDate(row.scheduled_date)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-white/80">
                        {fmtMoney(row.total_quoted)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-white/80">
                        {fmtMoney(row.total_invoiced)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-white/80">
                        {fmtMoney(row.total_paid)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-white/50 text-xs">
                        {(row.commission_rate ?? 0).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-amber-700 dark:text-amber-300">
                        {fmtMoney(row.commission_pending)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                        {fmtMoney(row.commission_earned)}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge row={row} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden border-t border-slate-100 dark:border-white/5">
            <div className={breakdown.length > 6 ? 'max-h-[520px] overflow-y-auto' : ''}>
              {breakdown.map((row) => (
                <Link
                  key={row.job_id}
                  href={`/dashboard/admin/jobs/${row.job_id}`}
                  className="block px-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-0 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[11px] text-violet-700 dark:text-violet-300 flex-shrink-0">
                        {row.job_number}
                      </span>
                      <StatusBadge row={row} />
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 dark:text-white/30 flex-shrink-0" />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {row.customer_name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-white/50 mt-0.5">
                    {fmtDate(row.scheduled_date)} · Quoted {fmtMoney(row.total_quoted)} · Paid {fmtMoney(row.total_paid)}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] text-slate-500 dark:text-white/50">
                      Rate <span className="font-semibold tabular-nums text-slate-700 dark:text-white/80">{(row.commission_rate ?? 0).toFixed(2)}%</span>
                    </span>
                    <span className="text-[10px] text-amber-700 dark:text-amber-300">
                      Pending <span className="font-semibold tabular-nums">{fmtMoney(row.commission_pending)}</span>
                    </span>
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-300">
                      Earned <span className="font-semibold tabular-nums">{fmtMoney(row.commission_earned)}</span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
