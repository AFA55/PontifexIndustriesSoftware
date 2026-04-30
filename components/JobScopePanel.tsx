'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Plus,
  Edit3,
  Trash2,
  X,
  Check,
  Loader2,
  Drill,
  Scissors,
  Hammer,
  Zap,
  CalendarClock,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScopeItem {
  id: string;
  work_type: string;
  description: string | null;
  unit: string;
  target_quantity: number;
  completed_quantity: number;
  pct_complete: number;
}

export interface JobScopePanelProps {
  jobId: string;
  jobNumber?: string;
  readOnly?: boolean;
  onScopeChange?: () => void;
}

const WORK_TYPE_OPTIONS = [
  { value: 'wall_sawing', label: 'Wall Sawing' },
  { value: 'core_drilling', label: 'Core Drilling' },
  { value: 'wire_sawing', label: 'Wire Sawing' },
  { value: 'flat_sawing', label: 'Flat Sawing' },
  { value: 'cleanup', label: 'Cleanup' },
  { value: 'mobilization', label: 'Mobilization' },
  { value: 'other', label: 'Other' },
];

const UNIT_OPTIONS = [
  { value: 'linear_ft', label: 'Linear Ft' },
  { value: 'sq_ft', label: 'Sq Ft' },
  { value: 'holes', label: 'Holes' },
  { value: 'hours', label: 'Hours' },
  { value: 'items', label: 'Items' },
];

const WORK_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  WORK_TYPE_OPTIONS.map((o) => [o.value, o.label])
);

const UNIT_LABELS: Record<string, string> = Object.fromEntries(
  UNIT_OPTIONS.map((o) => [o.value, o.label])
);

// ─── Popular Items Quick-Add Taxonomy ────────────────────────────────────────
// Each preset maps a real-world work item -> a sensible work_type + default unit.
// The values must match WORK_TYPE_OPTIONS / UNIT_OPTIONS above so the form save
// path stays unchanged.
type IconKey = 'drill' | 'scissors' | 'hammer' | 'zap';

interface PopularItem {
  label: string;
  description: string;   // pre-filled into the Description field
  work_type: string;     // matches WORK_TYPE_OPTIONS value
  unit: string;          // matches UNIT_OPTIONS value
  icon: IconKey;
}

const POPULAR_ITEMS: PopularItem[] = [
  { label: 'CORE DRILL',          description: 'Core Drilling',           work_type: 'core_drilling', unit: 'holes',     icon: 'drill' },
  { label: 'ELECTRIC CORE DRILL', description: 'Electric Core Drilling',  work_type: 'core_drilling', unit: 'holes',     icon: 'zap' },
  { label: 'WALL SAW',            description: 'Wall Sawing',             work_type: 'wall_sawing',   unit: 'linear_ft', icon: 'scissors' },
  { label: 'SLAB SAW',            description: 'Slab / Track Sawing',     work_type: 'flat_sawing',   unit: 'linear_ft', icon: 'scissors' },
  { label: 'ELECTRIC SLAB SAW',   description: 'Electric Slab Sawing',    work_type: 'flat_sawing',   unit: 'linear_ft', icon: 'zap' },
  { label: 'HAND SAW',            description: 'Hand Sawing',             work_type: 'flat_sawing',   unit: 'linear_ft', icon: 'scissors' },
  { label: 'CHAIN SAW',           description: 'Chain Sawing',            work_type: 'flat_sawing',   unit: 'linear_ft', icon: 'scissors' },
  { label: 'WIRE SAW',            description: 'Wire Sawing',             work_type: 'wire_sawing',   unit: 'linear_ft', icon: 'scissors' },
  { label: 'RING SAW',            description: 'Ring Sawing',             work_type: 'flat_sawing',   unit: 'linear_ft', icon: 'scissors' },
  { label: 'JACK HAMMERING',      description: 'Jack Hammering',          work_type: 'other',         unit: 'hours',     icon: 'hammer' },
  { label: 'BREAK & REMOVE',      description: 'Break & Remove',          work_type: 'other',         unit: 'items',     icon: 'hammer' },
  { label: 'CHIPPING',            description: 'Chipping',                work_type: 'other',         unit: 'hours',     icon: 'hammer' },
];

function PopularIcon({ name, className }: { name: IconKey; className?: string }) {
  const cls = className || 'w-4 h-4';
  if (name === 'drill') return <Drill className={cls} />;
  if (name === 'scissors') return <Scissors className={cls} />;
  if (name === 'hammer') return <Hammer className={cls} />;
  return <Zap className={cls} />;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function apiFetch(url: string, opts?: RequestInit) {
  const token = await getToken();
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...opts?.headers,
    },
  });
}

function pctColor(pct: number) {
  if (pct >= 100) return 'text-green-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function pctBarColor(pct: number) {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function ScopeSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="flex justify-between">
            <div className="h-4 bg-gray-200 rounded w-48" />
            <div className="h-4 bg-gray-200 rounded w-16" />
          </div>
          <div className="h-2 bg-gray-200 rounded-full w-full" />
        </div>
      ))}
    </div>
  );
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────

interface AddItemForm {
  work_type: string;
  description: string;
  unit: string;
  target_quantity: string;
}

const DEFAULT_FORM: AddItemForm = {
  work_type: 'wall_sawing',
  description: '',
  unit: 'linear_ft',
  target_quantity: '',
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function JobScopePanel({
  jobId,
  jobNumber,
  readOnly = false,
  onScopeChange,
}: JobScopePanelProps) {
  const [items, setItems] = useState<ScopeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddItemForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ScopeItem | null>(null);

  // Quick-add: tracks which popular preset the admin tapped (visual state only)
  const [selectedPopular, setSelectedPopular] = useState<string | null>(null);

  // Push-forward workflow: extend the job's end date when the new work pushes
  // the schedule out a day (or more).
  const [pushForward, setPushForward] = useState(false);
  const [pushDate, setPushDate] = useState<string>('');
  const [pushReason, setPushReason] = useState<string>('');

  // Lightweight inline toast (no toast lib in JobScopePanel today). Auto-clears.
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const fetchScope = useCallback(async () => {
    try {
      setError(null);
      const res = await apiFetch(`/api/admin/jobs/${jobId}/scope`);
      if (!res.ok) throw new Error('Failed to load scope');
      const json = await res.json();
      setItems(json.data || []);
    } catch {
      setError('Could not load scope items.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchScope();
  }, [fetchScope]);

  // Compute overall progress
  const totalTarget = items.reduce((s, i) => s + i.target_quantity, 0);
  const totalCompleted = items.reduce((s, i) => s + i.completed_quantity, 0);
  const overallPct =
    totalTarget > 0 ? Math.min(100, Math.round((totalCompleted / totalTarget) * 100)) : 0;

  // Find a dominant unit for overall display
  const dominantUnit =
    items.length > 0 ? UNIT_LABELS[items[0].unit] || items[0].unit : '';

  const resetAddModal = () => {
    setAddForm(DEFAULT_FORM);
    setSelectedPopular(null);
    setPushForward(false);
    setPushDate('');
    setPushReason('');
  };

  const applyPopularItem = (item: PopularItem) => {
    setSelectedPopular(item.label);
    setAddForm((f) => ({
      ...f,
      work_type: item.work_type,
      unit: item.unit,
      // Only overwrite description if user hasn't typed something custom yet
      description: f.description.trim() === '' ? item.description : f.description,
    }));
  };

  // Best-effort schedule extension. We need the job's current scheduled_date
  // (the PUT requires it). Fetch it on demand from the summary endpoint so we
  // don't have to change JobScopePanel's prop contract.
  const extendJobSchedule = async (newEndDate: string): Promise<boolean> => {
    try {
      const summaryRes = await apiFetch(`/api/admin/jobs/${jobId}/summary`);
      if (!summaryRes.ok) return false;
      const summaryJson = await summaryRes.json();
      const job = summaryJson?.data?.job ?? summaryJson?.job ?? summaryJson?.data ?? null;
      const currentScheduled: string | null =
        job?.scheduled_date ?? job?.scheduledDate ?? null;
      if (!currentScheduled) return false;

      const putRes = await apiFetch(`/api/admin/jobs/${jobId}/schedule`, {
        method: 'PUT',
        body: JSON.stringify({
          scheduled_date: currentScheduled,
          end_date: newEndDate,
        }),
      });
      return putRes.ok;
    } catch {
      return false;
    }
  };

  const handleAddSave = async () => {
    if (!addForm.work_type || !addForm.unit || !addForm.target_quantity) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/scope`, {
        method: 'POST',
        body: JSON.stringify({
          work_type: addForm.work_type,
          description: addForm.description || null,
          unit: addForm.unit,
          target_quantity: Number(addForm.target_quantity),
        }),
      });
      if (!res.ok) throw new Error('Save failed');

      // After scope item is safely persisted, optionally extend the schedule.
      let extendedTo: string | null = null;
      let extendFailed = false;
      if (pushForward && pushDate) {
        const ok = await extendJobSchedule(pushDate);
        if (ok) extendedTo = pushDate;
        else extendFailed = true;
      }

      setShowAddModal(false);
      resetAddModal();
      await fetchScope();
      onScopeChange?.();

      if (extendedTo) {
        setFlash({ kind: 'success', msg: `Schedule extended to ${extendedTo}` });
      } else if (extendFailed) {
        setFlash({
          kind: 'error',
          msg: 'Work item saved, but schedule extension failed. Update the schedule manually.',
        });
      } else {
        setFlash({ kind: 'success', msg: 'Work item added.' });
      }
    } catch {
      setFlash({ kind: 'error', msg: 'Could not save work item.' });
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async () => {
    if (!editingItem) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/scope`, {
        method: 'PUT',
        body: JSON.stringify({
          itemId: editingItem.id,
          work_type: editingItem.work_type,
          description: editingItem.description,
          unit: editingItem.unit,
          target_quantity: editingItem.target_quantity,
        }),
      });
      if (!res.ok) throw new Error('Update failed');
      setEditingItem(null);
      await fetchScope();
      onScopeChange?.();
    } catch {
      // noop
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    setDeletingId(itemId);
    try {
      await apiFetch(`/api/admin/jobs/${jobId}/scope?itemId=${itemId}`, {
        method: 'DELETE',
      });
      await fetchScope();
      onScopeChange?.();
    } catch {
      // noop
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">Job Scope &amp; Progress</h2>
          {jobNumber && (
            <span className="text-xs text-gray-400 font-mono ml-1">{jobNumber}</span>
          )}
        </div>
        {!readOnly && (
          <button
            onClick={() => {
              resetAddModal();
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Work Item
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && <ScopeSkeleton />}

      {/* Error */}
      {!loading && error && (
        <p className="text-sm text-red-600 text-center py-4">{error}</p>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div className="text-center py-8">
          <BarChart3 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No scope defined yet.</p>
          {!readOnly && (
            <p className="text-sm text-gray-400 mt-1">
              Add work items to track progress.
            </p>
          )}
          {!readOnly && (
            <button
              onClick={() => { resetAddModal(); setShowAddModal(true); }}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Work Item
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-5">
          {/* Overall progress bar */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-blue-900">
                Overall: {overallPct}% Complete
              </span>
              <span className="text-xs text-blue-700">
                {totalCompleted} of {totalTarget} {dominantUnit}
              </span>
            </div>
            <div className="w-full bg-blue-100 rounded-full h-3">
              <div
                className="bg-blue-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>

          {/* Scope item rows */}
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="group relative rounded-xl border border-gray-100 bg-gray-50/40 p-4 hover:border-gray-200 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        {WORK_TYPE_LABELS[item.work_type] || item.work_type}
                      </span>
                      {item.description && (
                        <span className="text-sm text-gray-700 font-medium truncate">
                          {item.description}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-500">
                      {item.completed_quantity} / {item.target_quantity}{' '}
                      {UNIT_LABELS[item.unit] || item.unit}
                    </span>
                    <span
                      className={`text-sm font-bold tabular-nums ${pctColor(item.pct_complete)}`}
                    >
                      {item.pct_complete}%
                    </span>

                    {/* Admin actions */}
                    {!readOnly && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingItem({ ...item })}
                          className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"
                          title="Edit"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id}
                          className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Per-item progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${pctBarColor(item.pct_complete)}`}
                    style={{ width: `${item.pct_complete}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add Work Item Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col border border-slate-200 dark:border-white/10">
            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-4 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                  <Plus className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-tight">
                    Add Work Item
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Pick a popular item or build one manually below.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-slate-500 dark:text-slate-300" />
              </button>
            </div>

            {/* Scroll body */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
              {/* ─── Section A: Popular Quick-Add ─── */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Popular Items — Quick Add
                  </h4>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {POPULAR_ITEMS.map((p) => {
                    const active = selectedPopular === p.label;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => applyPopularItem(p)}
                        className={`min-h-[64px] rounded-xl border-2 px-3 py-2.5 text-left transition-all duration-150 group ${
                          active
                            ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-400 dark:border-indigo-400/60 shadow-sm'
                            : 'bg-white dark:bg-white/[0.04] border-slate-200 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-400/40 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              active
                                ? 'bg-indigo-500 text-white'
                                : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/20 group-hover:text-indigo-600 dark:group-hover:text-indigo-300'
                            }`}
                          >
                            <PopularIcon name={p.icon} className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div
                              className={`text-[11px] font-bold leading-tight tracking-wide ${
                                active
                                  ? 'text-indigo-800 dark:text-indigo-200'
                                  : 'text-slate-800 dark:text-white'
                              }`}
                            >
                              {p.label}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {UNIT_LABELS[p.unit] || p.unit}
                            </div>
                          </div>
                          {active && (
                            <Check className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ─── Section B: Manual fields ─── */}
              <section>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                  Or type manually
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Work Type
                    </label>
                    <select
                      value={addForm.work_type}
                      onChange={(e) => {
                        setAddForm((f) => ({ ...f, work_type: e.target.value }));
                        setSelectedPopular(null);
                      }}
                      className="w-full rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {WORK_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={addForm.description}
                      onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder='e.g. North Wall, 8" slab'
                      className="w-full rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Unit
                      </label>
                      <select
                        value={addForm.unit}
                        onChange={(e) => {
                          setAddForm((f) => ({ ...f, unit: e.target.value }));
                          setSelectedPopular(null);
                        }}
                        className="w-full rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {UNIT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Target Quantity
                      </label>
                      <input
                        type="number"
                        min="0"
                        inputMode="decimal"
                        value={addForm.target_quantity}
                        onChange={(e) =>
                          setAddForm((f) => ({ ...f, target_quantity: e.target.value }))
                        }
                        placeholder="150"
                        className="w-full rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* ─── Section C: Push job forward ─── */}
              <section className="rounded-2xl border border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-400/10 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pushForward}
                    onChange={(e) => setPushForward(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-white/20 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
                      <CalendarClock className="w-4 h-4" />
                      Push job forward?
                    </span>
                    <span className="block text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
                      Check this if the new work pushes the job to a new date.
                    </span>
                  </span>
                </label>

                {pushForward && (
                  <div className="mt-4 space-y-3 pl-7">
                    <div>
                      <label className="block text-xs font-medium text-amber-900 dark:text-amber-200 mb-1">
                        New scheduled end date
                      </label>
                      <input
                        type="date"
                        value={pushDate}
                        onChange={(e) => setPushDate(e.target.value)}
                        className="w-full rounded-lg border border-amber-300 dark:border-amber-400/40 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-amber-900 dark:text-amber-200 mb-1">
                        Reason (optional)
                      </label>
                      <input
                        type="text"
                        value={pushReason}
                        onChange={(e) => setPushReason(e.target.value)}
                        placeholder="e.g. Customer added a third opening"
                        className="w-full rounded-lg border border-amber-300 dark:border-amber-400/40 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-white placeholder-amber-700/40 dark:placeholder-amber-200/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                )}
              </section>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-5 sm:px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] rounded-b-none sm:rounded-b-3xl">
              <button
                onClick={handleAddSave}
                disabled={saving || !addForm.target_quantity || (pushForward && !pushDate)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Item
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inline flash toast ── */}
      {flash && (
        <div
          className={`fixed bottom-6 right-6 z-[60] max-w-sm rounded-xl shadow-lg border px-4 py-3 text-sm font-medium flex items-start gap-2 ${
            flash.kind === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-400/40 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-400/40 text-rose-800 dark:text-rose-200'
          }`}
          role="status"
        >
          {flash.kind === 'success' ? (
            <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
          ) : (
            <X className="w-4 h-4 mt-0.5 flex-shrink-0" />
          )}
          <span className="flex-1">{flash.msg}</span>
          <button
            onClick={() => setFlash(null)}
            className="opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Edit Work Item Modal ── */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-900">Edit Work Item</h3>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work Type</label>
                <select
                  value={editingItem.work_type}
                  onChange={(e) =>
                    setEditingItem((prev) => prev ? { ...prev, work_type: e.target.value } : prev)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {WORK_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={editingItem.description || ''}
                  onChange={(e) =>
                    setEditingItem((prev) => prev ? { ...prev, description: e.target.value } : prev)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <select
                    value={editingItem.unit}
                    onChange={(e) =>
                      setEditingItem((prev) => prev ? { ...prev, unit: e.target.value } : prev)
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {UNIT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Qty</label>
                  <input
                    type="number"
                    min="0"
                    value={editingItem.target_quantity}
                    onChange={(e) =>
                      setEditingItem((prev) =>
                        prev ? { ...prev, target_quantity: Number(e.target.value) } : prev
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-6">
              <button
                onClick={handleEditSave}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Changes
              </button>
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
