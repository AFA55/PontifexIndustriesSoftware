'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Plus, Edit3, Trash2, X, Check, Loader2 } from 'lucide-react';
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
      setShowAddModal(false);
      setAddForm(DEFAULT_FORM);
      await fetchScope();
      onScopeChange?.();
    } catch {
      // noop — could show an inline error
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
              setAddForm(DEFAULT_FORM);
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
              onClick={() => { setAddForm(DEFAULT_FORM); setShowAddModal(true); }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-900">Add Work Item</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Work Type
                </label>
                <select
                  value={addForm.work_type}
                  onChange={(e) => setAddForm((f) => ({ ...f, work_type: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {WORK_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={addForm.description}
                  onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. North Wall, 8&quot; slab"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit
                  </label>
                  <select
                    value={addForm.unit}
                    onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {UNIT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={addForm.target_quantity}
                    onChange={(e) =>
                      setAddForm((f) => ({ ...f, target_quantity: e.target.value }))
                    }
                    placeholder="150"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-6">
              <button
                onClick={handleAddSave}
                disabled={saving || !addForm.target_quantity}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Item
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
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
