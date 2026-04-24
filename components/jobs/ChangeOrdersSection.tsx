'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Plus, Check, X, ChevronDown, ChevronUp,
  DollarSign, Loader2, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface WorkItem {
  work_type: string;
  description: string;
  quantity: number;
  unit: string;
}

interface ChangeOrder {
  id: string;
  job_order_id: string;
  version: number;
  scope_description: string;
  additional_work_items: WorkItem[];
  additional_cost: number;
  additional_hours?: number;
  status: 'pending' | 'approved' | 'rejected';
  requested_by_name: string;
  approved_at?: string;
  notes?: string;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

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

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const WORK_TYPES = [
  { value: 'trench_cutting', label: 'Trench Cutting' },
  { value: 'core_drilling', label: 'Core Drilling' },
  { value: 'flat_sawing', label: 'Flat Sawing' },
  { value: 'wall_sawing', label: 'Wall Sawing' },
  { value: 'wire_sawing', label: 'Wire Sawing' },
  { value: 'demo', label: 'Demo' },
  { value: 'other', label: 'Other' },
];

const UNITS = [
  { value: 'linear_ft', label: 'Linear Ft' },
  { value: 'sq_ft', label: 'Sq Ft' },
  { value: 'holes', label: 'Holes' },
  { value: 'each', label: 'Each' },
  { value: 'lf', label: 'LF' },
];

// ─── Status Badge ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ChangeOrder['status'] }) {
  const cfg = {
    pending:  { label: 'Pending',  classes: 'bg-amber-100 text-amber-800 border-amber-200' },
    approved: { label: 'Approved', classes: 'bg-green-100 text-green-800 border-green-200' },
    rejected: { label: 'Rejected', classes: 'bg-red-100 text-red-800 border-red-200' },
  }[status];
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

// ─── Add Change Order Form ───────────────────────────────────────────────────────

function AddChangeOrderModal({
  jobId,
  onClose,
  onSuccess,
}: {
  jobId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [scopeDescription, setScopeDescription] = useState('');
  const [workItems, setWorkItems] = useState<WorkItem[]>([
    { work_type: 'other', description: '', quantity: 1, unit: 'each' },
  ]);
  const [additionalCost, setAdditionalCost] = useState('');
  const [additionalHours, setAdditionalHours] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addWorkItem = () => {
    setWorkItems(prev => [...prev, { work_type: 'other', description: '', quantity: 1, unit: 'each' }]);
  };

  const removeWorkItem = (idx: number) => {
    setWorkItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateWorkItem = (idx: number, field: keyof WorkItem, value: string | number) => {
    setWorkItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scopeDescription.trim()) { setError('Scope description is required.'); return; }
    if (!additionalCost || isNaN(Number(additionalCost))) { setError('Additional cost is required.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/change-orders`, {
        method: 'POST',
        body: JSON.stringify({
          scope_description: scopeDescription.trim(),
          additional_work_items: workItems.filter(wi => wi.description.trim()),
          additional_cost: parseFloat(additionalCost),
          additional_hours: additionalHours ? parseFloat(additionalHours) : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to submit change order');
      }
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-amber-700" />
            </div>
            <h2 className="text-base font-bold text-gray-900">Add Change Order</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Scope description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              What scope is being added? <span className="text-red-500">*</span>
            </label>
            <textarea
              value={scopeDescription}
              onChange={e => setScopeDescription(e.target.value)}
              rows={3}
              placeholder="e.g. Trench length doubled from 50 LF to 100 LF due to revised plan..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-400"
              required
            />
          </div>

          {/* Work Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Work Items</label>
              <button
                type="button"
                onClick={addWorkItem}
                className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>
            <div className="space-y-3">
              {workItems.map((item, idx) => (
                <div key={idx} className="bg-amber-50/50 rounded-xl border border-amber-100 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-700">Item {idx + 1}</span>
                    {workItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeWorkItem(idx)}
                        className="p-1 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        <X className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Work Type</label>
                      <select
                        value={item.work_type}
                        onChange={e => updateWorkItem(idx, 'work_type', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        {WORK_TYPES.map(wt => (
                          <option key={wt.value} value={wt.value}>{wt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Unit</label>
                      <select
                        value={item.unit}
                        onChange={e => updateWorkItem(idx, 'unit', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        {UNITS.map(u => (
                          <option key={u.value} value={u.value}>{u.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Description</label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={e => updateWorkItem(idx, 'description', e.target.value)}
                        placeholder="Brief description of this work item"
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Quantity</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={e => updateWorkItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cost & Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Additional Cost ($) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  value={additionalCost}
                  onChange={e => setAdditionalCost(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Additional Hours (est.)
              </label>
              <input
                type="number"
                value={additionalHours}
                onChange={e => setAdditionalHours(e.target.value)}
                placeholder="0.0"
                min="0"
                step="0.5"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional context or instructions..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-400"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              Submit Change Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────────

export default function ChangeOrdersSection({
  jobId,
  jobStatus,
  isAdmin,
}: {
  jobId: string;
  jobStatus: string;
  isAdmin: boolean;
}) {
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Reject state per change order
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchChangeOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/change-orders`);
      if (!res.ok) throw new Error('Failed to load change orders');
      const json = await res.json();
      const list = Array.isArray(json.data) ? json.data : (json.data?.change_orders ?? []);
      setChangeOrders(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading change orders');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchChangeOrders();
  }, [fetchChangeOrders]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleAction = async (coId: string, action: 'approve' | 'reject') => {
    if (action === 'reject' && !rejectReason.trim()) {
      showToast('Please enter a rejection reason.');
      return;
    }
    setActionInProgress(coId);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/change-orders/${coId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action,
          rejection_reason: action === 'reject' ? rejectReason.trim() : undefined,
        }),
      });
      if (!res.ok) throw new Error('Action failed');
      showToast(action === 'approve' ? 'Change order approved.' : 'Change order rejected.');
      setRejectingId(null);
      setRejectReason('');
      await fetchChangeOrders();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDelete = async (coId: string) => {
    if (!confirm('Delete this change order?')) return;
    setActionInProgress(coId);
    try {
      const res = await apiFetch(`/api/admin/jobs/${jobId}/change-orders/${coId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      showToast('Change order deleted.');
      await fetchChangeOrders();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setActionInProgress(null);
    }
  };

  const pendingCount = changeOrders.filter(co => co.status === 'pending').length;

  return (
    <>
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        {/* Section Header */}
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-amber-400" />
            </div>
            <h3 className="text-sm font-bold text-white">Change Orders</h3>
            {changeOrders.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {changeOrders.length}
              </span>
            )}
            {pendingCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                {pendingCount} pending
              </span>
            )}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {open && (
          <div className="px-6 pb-6 space-y-4">
            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && changeOrders.length === 0 && (
              <div className="text-center py-8 text-gray-500 text-sm">
                No change orders yet.
              </div>
            )}

            {/* Change Order Cards */}
            {!loading && changeOrders.map(co => (
              <div key={co.id} className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                      v{co.version}
                    </span>
                    <StatusBadge status={co.status} />
                    <span className="text-xs text-gray-500">by {co.requested_by_name}</span>
                    <span className="text-xs text-gray-500">&bull; {formatDate(co.created_at)}</span>
                  </div>
                  {isAdmin && co.status === 'pending' && (
                    <button
                      onClick={() => handleDelete(co.id)}
                      disabled={actionInProgress === co.id}
                      className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors flex-shrink-0"
                      title="Delete"
                    >
                      <X className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  )}
                </div>

                {/* Scope */}
                <p className="text-sm text-gray-200 leading-relaxed">{co.scope_description}</p>

                {/* Work Items */}
                {co.additional_work_items && co.additional_work_items.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Work Items</p>
                    {co.additional_work_items.map((wi, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-gray-300 pl-2">
                        <span className="w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
                        <span className="font-semibold">{wi.work_type.replace(/_/g, ' ')}</span>
                        {wi.description && <span className="text-gray-400">— {wi.description}</span>}
                        <span className="ml-auto text-gray-400 flex-shrink-0">{wi.quantity} {wi.unit}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cost / Hours row */}
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-sm font-bold text-green-300">+{formatCurrency(co.additional_cost)}</span>
                  </div>
                  {co.additional_hours != null && co.additional_hours > 0 && (
                    <span className="text-xs text-gray-400">+{co.additional_hours}h est.</span>
                  )}
                </div>

                {/* Notes */}
                {co.notes && (
                  <p className="text-xs text-gray-400 italic">{co.notes}</p>
                )}

                {/* Admin Actions */}
                {isAdmin && co.status === 'pending' && (
                  <div className="pt-1 space-y-2 border-t border-white/10">
                    {rejectingId === co.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                          placeholder="Reason for rejection..."
                          className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(co.id, 'reject')}
                            disabled={actionInProgress === co.id}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            {actionInProgress === co.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            Confirm Reject
                          </button>
                          <button
                            onClick={() => { setRejectingId(null); setRejectReason(''); }}
                            className="px-3 py-2 border border-white/10 rounded-lg text-xs font-semibold text-gray-300 hover:bg-white/5 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction(co.id, 'approve')}
                          disabled={actionInProgress === co.id}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                        >
                          {actionInProgress === co.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectingId(co.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-600/80 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Add button */}
            {isAdmin && jobStatus !== 'completed' && (
              <button
                onClick={() => setShowAddModal(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-amber-500/40 rounded-xl text-sm font-semibold text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/60 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Change Order
              </button>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-gray-900 text-white text-sm font-semibold rounded-xl shadow-2xl border border-white/10">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          {toast}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddChangeOrderModal
          jobId={jobId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            showToast('Change order submitted successfully.');
            fetchChangeOrders();
          }}
        />
      )}
    </>
  );
}
