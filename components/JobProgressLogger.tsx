'use client';

/**
 * JobProgressLogger — operator end-of-day progress input against office-set targets.
 *
 * The office seeds job_scope_items (e.g. 1000 linear ft wall sawing) at job creation.
 * This panel shows each target with its running total + %, and lets the operator log
 * what they completed. Two input models, both stored as additive job_progress_entries:
 *   • Measured units (linear_ft, holes, sq_ft, …): "completed today" → posted as-is.
 *   • percent units (demo / unmeasurable): "% complete now" → posts the delta vs the
 *     current total so the running sum reflects the intended total.
 *
 * Renders nothing when the job has no scope targets, so operators never see an empty box.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toLocalYMD } from '@/lib/dates';
import { TrendingUp, Loader2, Check } from 'lucide-react';

type ScopeItem = {
  scope_item_id: string;
  description: string;
  work_type: string;
  unit: string;
  target_quantity: number;
  total_completed: number;
  pct_complete: number;
};

const UNIT_LABEL: Record<string, string> = {
  linear_ft: 'linear ft',
  holes: 'holes',
  sq_ft: 'sq ft',
  items: 'items',
  each: 'each',
  percent: '%',
};

export default function JobProgressLogger({ jobId }: { jobId: string }) {
  const [items, setItems] = useState<ScopeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const res = await fetch(`/api/jobs/${jobId}/progress`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setItems((json.data?.by_scope_item || []) as ScopeItem[]);
      }
    } catch {
      /* silent — progress logging is optional */
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setError(null);
    // Build one progress post per item the operator actually filled in.
    const posts: Array<{ scope_item_id: string; quantity_completed: number; work_type: string }> = [];
    for (const item of items) {
      const raw = inputs[item.scope_item_id];
      if (raw == null || raw === '') continue;
      const val = Number(raw);
      if (!Number.isFinite(val) || val < 0) continue;
      let quantity: number;
      if (item.unit === 'percent') {
        // "% complete now" → post the delta vs the running total (clamped ≥ 0).
        const target = Math.max(0, Math.min(100, val));
        quantity = Math.max(0, target - item.total_completed);
      } else {
        quantity = val; // measured units accumulate directly
      }
      if (quantity <= 0) continue;
      posts.push({ scope_item_id: item.scope_item_id, quantity_completed: quantity, work_type: item.work_type });
    }
    if (posts.length === 0) {
      setError('Enter what you completed on at least one item first.');
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSaving(false); return; }
      const localDate = toLocalYMD(new Date()); // avoid UTC off-by-one after ~7pm ET
      let failures = 0;
      for (const p of posts) {
        try {
          const res = await fetch(`/api/jobs/${jobId}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ ...p, date: localDate }),
          });
          if (!res.ok) failures += 1;
        } catch {
          failures += 1;
        }
      }
      setInputs({});
      await load();
      if (failures > 0) {
        setError(`Saved ${posts.length - failures} of ${posts.length}. Some items didn't save — try again.`);
      } else {
        setSavedAt(Date.now());
      }
    } catch {
      setError('Could not save progress. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || items.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-white/[0.04] p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <h3 className="text-base font-bold text-slate-800 dark:text-white">Update Job Progress</h3>
      </div>
      <p className="text-xs text-slate-500 dark:text-white/50 mb-4">
        Log what you completed toward the office&apos;s targets. Optional — it just keeps the progress bar current.
      </p>

      <div className="space-y-4">
        {items.map((item) => {
          const unitLabel = UNIT_LABEL[item.unit] || item.unit;
          const isPercent = item.unit === 'percent';
          const pct = Math.max(0, Math.min(100, item.pct_complete || 0));
          return (
            <div key={item.scope_item_id} className="bg-white dark:bg-white/[0.03] rounded-xl border border-slate-200 dark:border-white/10 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-slate-800 dark:text-white">{item.work_type}</span>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{pct}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-white/10 mb-2 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-white/50 mb-2">
                {isPercent
                  ? `${item.total_completed}% logged so far`
                  : `${item.total_completed} of ${item.target_quantity} ${unitLabel} done`}
              </p>
              <label className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-white/60 min-w-0 flex-shrink">
                  {isPercent ? '% complete now' : `Completed today (${unitLabel})`}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={isPercent ? 100 : undefined}
                  placeholder={isPercent ? String(pct) : '0'}
                  value={inputs[item.scope_item_id] ?? ''}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [item.scope_item_id]: e.target.value }))}
                  className="ml-auto w-24 px-3 py-2 rounded-lg border border-slate-300 dark:border-white/20 bg-white dark:bg-white/5 text-slate-900 dark:text-white text-base text-right focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                />
              </label>
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-4 w-full py-3 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white transition-all flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : savedAt ? <Check className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
        {saving ? 'Saving…' : savedAt ? 'Progress saved' : 'Save progress'}
      </button>
    </div>
  );
}
