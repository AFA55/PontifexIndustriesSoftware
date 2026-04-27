'use client';

import { useState, useEffect } from 'react';
import { X, CalendarOff, Loader2, ToggleLeft, ToggleRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface AddTimeOffModalProps {
  operators: { id: string; name: string }[];
  defaultDate: string;
  onSuccess: () => void;
  onClose: () => void;
}

interface TypeOption {
  value: string;
  label: string;
  paidDefault: boolean;
  color: string;
}

const TIME_OFF_TYPES: TypeOption[] = [
  { value: 'pto',             label: 'PTO',              paidDefault: true,  color: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700' },
  { value: 'vacation',        label: 'Vacation',         paidDefault: true,  color: 'bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700' },
  { value: 'sick',            label: 'Sick',             paidDefault: false, color: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700' },
  { value: 'callout',         label: 'Callout',          paidDefault: false, color: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700' },
  { value: 'no_show',         label: 'No Show',          paidDefault: false, color: 'bg-red-200 text-red-800 border-red-400 dark:bg-red-900/50 dark:text-red-200 dark:border-red-600' },
  { value: 'bereavement',     label: 'Bereavement',      paidDefault: true,  color: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700' },
  { value: 'personal',        label: 'Personal',         paidDefault: false, color: 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700' },
  { value: 'unpaid',          label: 'Unpaid Leave',     paidDefault: false, color: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-700/40 dark:text-gray-300 dark:border-gray-600' },
  { value: 'worked_last_night', label: 'Worked Last Night', paidDefault: false, color: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700' },
  { value: 'other',           label: 'Other',            paidDefault: false, color: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-700/40 dark:text-gray-300 dark:border-gray-600' },
];

export default function AddTimeOffModal({ operators, defaultDate, onSuccess, onClose }: AddTimeOffModalProps) {
  const [operatorId, setOperatorId] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [type, setType] = useState('pto');
  const [isPaid, setIsPaid] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync paid toggle when type changes
  useEffect(() => {
    const opt = TIME_OFF_TYPES.find(t => t.value === type);
    if (opt) setIsPaid(opt.paidDefault);
  }, [type]);

  const handleSubmit = async () => {
    if (!operatorId) { setError('Please select an operator'); return; }
    if (!date) { setError('Please select a date'); return; }

    setSaving(true);
    setError(null);

    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      // Use the new unified API route
      const res = await fetch('/api/admin/time-off', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ operator_id: operatorId, date, type, is_paid: isPaid, notes: notes || null }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Failed to create time-off entry');
        return;
      }

      onSuccess();
    } catch {
      setError('Network error occurred');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />

      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white dark:bg-[#1a0f35] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-white/10 animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <CalendarOff className="w-5 h-5" />
                  Add Time Off
                </h2>
                <p className="text-white/70 text-sm mt-0.5">Block operator on schedule board</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Error banner */}
            {error && (
              <div className="px-3 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded-lg text-sm text-red-700 dark:text-red-300 font-medium">
                {error}
              </div>
            )}

            {/* Operator dropdown */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-white/70 mb-1.5">Operator</label>
              <select
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm font-medium bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white transition-all"
              >
                <option value="">Select Operator...</option>
                {operators.map(op => (
                  <option key={op.id} value={op.id}>{op.name}</option>
                ))}
              </select>
            </div>

            {/* Date picker */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-white/70 mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm font-medium bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white transition-all"
              />
            </div>

            {/* Type radio buttons */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-white/70 mb-2">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {TIME_OFF_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                      type === t.value
                        ? `${t.color} ring-2 ring-offset-1 ring-current border-transparent`
                        : 'bg-gray-50 dark:bg-white/[0.03] text-gray-500 dark:text-white/40 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/[0.08]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Paid toggle */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/10">
              <span className="text-sm font-semibold text-gray-700 dark:text-white/70">Paid?</span>
              <button
                type="button"
                onClick={() => setIsPaid(!isPaid)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isPaid
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-white/50'
                }`}
              >
                {isPaid ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                {isPaid ? 'Paid' : 'Unpaid'}
              </button>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-white/70 mb-1.5">
                Notes <span className="font-normal text-gray-400 dark:text-white/30">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional details..."
                rows={2}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm font-medium bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-white/30 transition-all resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-gray-700 dark:text-white rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !operatorId}
                className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? 'Saving...' : 'Add Time Off'}
              </button>
            </div>

            {/* Link to full management page */}
            <div className="text-center pt-1">
              <Link
                href="/dashboard/admin/time-off"
                className="inline-flex items-center gap-1 text-xs text-purple-500 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 transition-colors"
                onClick={onClose}
              >
                <ExternalLink className="w-3 h-3" />
                View full Time Off management
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
