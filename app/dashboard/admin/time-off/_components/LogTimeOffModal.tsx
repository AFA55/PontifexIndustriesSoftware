'use client';

import { useState, useEffect } from 'react';
import { X, CalendarOff, Loader2, Bell, ToggleLeft, ToggleRight } from 'lucide-react';

interface Operator {
  id: string;
  full_name: string;
  role: string;
}

interface LogTimeOffModalProps {
  token: string;
  defaultOperatorId?: string;
  defaultDate?: string;
  onSuccess: () => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

interface TypeOption {
  value: string;
  label: string;
  description: string;
  paidDefault: boolean;
  isCallout: boolean;
  color: string;
}

const TYPE_OPTIONS: TypeOption[] = [
  { value: 'pto',           label: 'PTO',             description: 'Paid time off',              paidDefault: true,  isCallout: false, color: 'ring-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' },
  { value: 'vacation',      label: 'Vacation',         description: 'Planned vacation days',      paidDefault: true,  isCallout: false, color: 'ring-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300' },
  { value: 'sick',          label: 'Sick Leave',       description: 'Illness / medical',          paidDefault: false, isCallout: true,  color: 'ring-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' },
  { value: 'callout',       label: 'Callout',          description: 'Last-minute absence',        paidDefault: false, isCallout: true,  color: 'ring-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' },
  { value: 'no_show',       label: 'No Show',          description: 'Did not show / no call',     paidDefault: false, isCallout: true,  color: 'ring-red-500 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200' },
  { value: 'bereavement',   label: 'Bereavement',      description: 'Family bereavement leave',   paidDefault: true,  isCallout: false, color: 'ring-violet-400 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300' },
  { value: 'personal',      label: 'Personal',         description: 'Personal / family day',      paidDefault: false, isCallout: false, color: 'ring-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' },
  { value: 'unpaid',        label: 'Unpaid Leave',     description: 'Unpaid leave of absence',    paidDefault: false, isCallout: false, color: 'ring-gray-400 bg-gray-50 dark:bg-gray-700/30 text-gray-600 dark:text-gray-300' },
  { value: 'worked_last_night', label: 'Worked Last Night', description: 'Previous night shift', paidDefault: false, isCallout: false, color: 'ring-purple-400 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300' },
  { value: 'other',         label: 'Other',            description: 'Other / miscellaneous',      paidDefault: false, isCallout: false, color: 'ring-gray-300 bg-gray-50 dark:bg-gray-700/20 text-gray-500 dark:text-gray-400' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LogTimeOffModal({
  token,
  defaultOperatorId = '',
  defaultDate = '',
  onSuccess,
  onClose,
}: LogTimeOffModalProps) {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loadingOps, setLoadingOps] = useState(true);

  // Form state
  const [operatorId, setOperatorId] = useState(defaultOperatorId);
  const [type, setType] = useState('pto');
  const [startDate, setStartDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));
  const [isPaid, setIsPaid] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync isPaid when type changes
  useEffect(() => {
    const opt = TYPE_OPTIONS.find(o => o.value === type);
    if (opt) setIsPaid(opt.paidDefault);
  }, [type]);

  // Fetch operators using the active-operators endpoint
  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/operators/active', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(json => {
        const all = (json.data ?? json ?? []) as any[];
        setOperators(
          all
            .filter((p: any) => ['operator', 'apprentice'].includes(p.role))
            .map((p: any) => ({ id: p.id, full_name: p.full_name ?? p.name ?? 'Unknown', role: p.role }))
            .sort((a: Operator, b: Operator) => a.full_name.localeCompare(b.full_name))
        );
      })
      .catch(() => {})
      .finally(() => setLoadingOps(false));
  }, [token]);

  const selectedType = TYPE_OPTIONS.find(o => o.value === type);

  const handleSubmit = async () => {
    if (!operatorId) { setError('Please select an operator'); return; }
    if (!startDate) { setError('Please select a date'); return; }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/time-off', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          operator_id: operatorId,
          date: startDate,
          end_date: endDate > startDate ? endDate : startDate,
          type,
          is_paid: isPaid,
          notes: notes.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to save entry');
        return;
      }
      onSuccess();
    } catch {
      setError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  };

  const dayCount = (() => {
    if (!startDate || !endDate) return 1;
    const s = new Date(startDate);
    const e = new Date(endDate < startDate ? startDate : endDate);
    return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
  })();

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70]" onClick={onClose} />

      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white dark:bg-[#13082a] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-white/10 animate-in zoom-in-95 duration-200">

          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <CalendarOff className="w-5 h-5" />
                  Log Time Off / Callout
                </h2>
                <p className="text-white/70 text-sm mt-0.5">Record an absence or block operator availability</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Error */}
            {error && (
              <div className="px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded-xl text-sm text-red-700 dark:text-red-300 font-medium">
                {error}
              </div>
            )}

            {/* Operator selector */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-white/70 mb-1.5">
                Operator <span className="text-red-400">*</span>
              </label>
              {loadingOps ? (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 text-sm text-gray-400 dark:text-white/30">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading operators...
                </div>
              ) : (
                <select
                  value={operatorId}
                  onChange={e => setOperatorId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900/50 text-sm font-medium bg-white dark:bg-white/[0.06] text-gray-900 dark:text-white transition-all"
                >
                  <option value="">Select operator...</option>
                  {operators.map(op => (
                    <option key={op.id} value={op.id}>
                      {op.full_name} ({op.role})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Type selector */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-white/70 mb-2">
                Type <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={`text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                      type === opt.value
                        ? `${opt.color} ring-2 ring-offset-1 ring-current border-transparent`
                        : 'bg-gray-50 dark:bg-white/[0.03] text-gray-500 dark:text-white/40 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/[0.08]'
                    }`}
                  >
                    <p className="text-xs font-bold leading-tight">{opt.label}</p>
                    <p className="text-[10px] opacity-70 leading-tight mt-0.5">{opt.description}</p>
                  </button>
                ))}
              </div>

              {/* Callout warning */}
              {selectedType?.isCallout && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-lg">
                  <Bell className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-600 dark:text-red-400">
                    This type counts as an attendance incident and will notify supervisors.
                  </p>
                </div>
              )}
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-white/70 mb-1.5">
                  Start Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value);
                    if (endDate < e.target.value) setEndDate(e.target.value);
                  }}
                  className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900/50 text-sm font-medium bg-white dark:bg-white/[0.06] text-gray-900 dark:text-white transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-white/70 mb-1.5">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900/50 text-sm font-medium bg-white dark:bg-white/[0.06] text-gray-900 dark:text-white transition-all"
                />
              </div>
            </div>
            {dayCount > 1 && (
              <p className="text-xs text-purple-600 dark:text-purple-400 font-medium -mt-2">
                {dayCount} days will be blocked
              </p>
            )}

            {/* Paid toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/10">
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-white/70">Is this paid?</p>
                <p className="text-xs text-gray-400 dark:text-white/35 mt-0.5">
                  Auto-set based on type — override if needed
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPaid(!isPaid)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  isPaid
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-white/50'
                }`}
              >
                {isPaid
                  ? <ToggleRight className="w-5 h-5" />
                  : <ToggleLeft className="w-5 h-5" />}
                {isPaid ? 'Paid' : 'Unpaid'}
              </button>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-white/70 mb-1.5">
                Reason / Notes <span className="text-gray-400 dark:text-white/30 font-normal">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Additional details about this absence..."
                rows={2}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900/50 text-sm font-medium bg-white dark:bg-white/[0.06] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 transition-all resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-gray-700 dark:text-white rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !operatorId || !startDate}
                className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving...' : selectedType?.isCallout ? 'Log & Notify' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
