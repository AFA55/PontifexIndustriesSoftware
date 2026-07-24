'use client';

import { useState, useEffect, useCallback } from 'react';
import { Megaphone, AlertCircle, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDisplayDate } from './helpers';

interface DispatchInfo {
  total: number;
  dispatched: number;
  undispatched: number;
  jobs?: {
    id: string;
    job_number: string;
    customer_name: string;
    scheduled_date: string;
    end_date: string | null;
    arrival_time: string | null;
    operator_name: string;
  }[];
}

interface DispatchConfirmationModalProps {
  selectedDate: string;
  dispatchInfo: DispatchInfo | null;
  dispatchLoading: boolean;
  onDispatch: () => void;
  onClose: () => void;
}

export default function DispatchConfirmationModal({
  selectedDate,
  dispatchInfo,
  dispatchLoading,
  onDispatch,
  onClose,
}: DispatchConfirmationModalProps) {
  // Auto-dispatch daily toggle (tenants.features.auto_dispatch).
  const [autoOn, setAutoOn] = useState<boolean | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s.session?.access_token;
        if (!token) return;
        const res = await fetch('/api/admin/schedule-board/auto-dispatch', { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        if (res.ok) setAutoOn(!!json.enabled);
      } catch { /* leave null → toggle stays disabled */ }
    })();
  }, []);

  const toggleAuto = useCallback(async () => {
    if (autoOn === null || autoSaving) return;
    const next = !autoOn;
    setAutoSaving(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s.session?.access_token;
      const res = await fetch('/api/admin/schedule-board/auto-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: next }),
      });
      const json = await res.json();
      if (res.ok) setAutoOn(!!json.enabled);
    } catch { /* ignore */ } finally { setAutoSaving(false); }
  }, [autoOn, autoSaving]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={() => !dispatchLoading && onClose()} />
      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
          <div className="bg-gradient-to-r from-orange-500 to-red-500 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Megaphone className="w-5 h-5" />
                  Push Job Tickets
                </h2>
                <p className="text-orange-100 text-sm">Dispatch tickets for {formatDisplayDate(selectedDate)}</p>
              </div>
              <button onClick={() => !dispatchLoading && onClose()} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {dispatchInfo ? (
              <>
                <div className="flex justify-center">
                  <div className="text-center p-4 bg-gray-50 dark:bg-slate-700 rounded-xl min-w-[120px]">
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">{dispatchInfo.total}</div>
                    <div className="text-xs text-gray-500 dark:text-white/60 font-medium mt-1">Assigned Jobs</div>
                  </div>
                </div>

                {/* Exactly WHICH tickets are about to go out (founder Jul 13:
                    "let me see the tickets that are about to be dispatched").
                    A stale/wrong job here gets fixed on the board (cancel or
                    reschedule) BEFORE pushing — crews only get real tickets. */}
                {(dispatchInfo.jobs?.length ?? 0) > 0 && (
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-white/10 divide-y divide-gray-100 dark:divide-white/5">
                    {dispatchInfo.jobs!.map((j) => (
                      <div key={j.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{j.customer_name}</p>
                          <p className="truncate text-xs text-gray-500 dark:text-white/50">
                            {j.job_number} · {j.operator_name}
                            {j.end_date && j.end_date !== j.scheduled_date ? ` · ${j.scheduled_date} → ${j.end_date}` : ` · ${j.scheduled_date}`}
                          </p>
                        </div>
                        {j.arrival_time && (
                          <span className="shrink-0 text-xs font-semibold text-gray-500 dark:text-white/50">{j.arrival_time.slice(0, 5)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {dispatchInfo.total === 0 ? (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-white/10 rounded-xl">
                    <AlertCircle className="w-6 h-6 text-gray-400 dark:text-white/50 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-gray-700 dark:text-white/70">No assigned jobs for this date</p>
                      <p className="text-xs text-gray-500 dark:text-white/60">Assign operators to jobs on the board first.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-xl">
                    <Megaphone className="w-6 h-6 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-orange-800 dark:text-orange-400">{dispatchInfo.total} job(s) will be dispatched</p>
                      <p className="text-xs text-orange-600 dark:text-orange-500">All assigned operators and helpers will be notified.</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            )}

            {/* Auto-dispatch daily toggle */}
            <button
              onClick={toggleAuto}
              disabled={autoOn === null || autoSaving}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 dark:border-white/10 text-left disabled:opacity-60"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">Auto-dispatch daily at 7:05 AM</p>
                <p className="text-xs text-gray-500 dark:text-white/50">Tickets go out automatically each morning (Eastern). Off = you push manually.</p>
              </div>
              <span className={`shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoOn ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-white/20'}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${autoOn ? 'translate-x-5' : 'translate-x-1'}`} />
              </span>
            </button>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                disabled={dispatchLoading}
                className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-white/10 rounded-xl text-gray-700 dark:text-white/70 font-semibold hover:bg-gray-50 dark:hover:bg-white/10 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onDispatch}
                disabled={dispatchLoading || !dispatchInfo || dispatchInfo.total === 0}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {dispatchLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Dispatching...</>
                ) : (
                  <><Megaphone className="w-4 h-4" /> Push {dispatchInfo?.total || 0} Tickets</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
