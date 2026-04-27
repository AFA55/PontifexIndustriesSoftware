'use client';

import { useState } from 'react';
import { X, UserX, Loader2 } from 'lucide-react';

const UNAVAILABLE_REASONS = [
  { value: 'sick', label: 'Sick' },
  { value: 'personal_day', label: 'Personal Day' },
  { value: 'no_show', label: 'No-Show' },
  { value: 'vacation', label: 'Vacation' },
  { value: 'unavailable', label: 'Other / Unavailable' },
];

interface MarkOutModalProps {
  operatorName: string;
  date: string;
  onConfirm: (reason: string, notes?: string) => Promise<void>;
  onClose: () => void;
}

export default function MarkOutModal({ operatorName, date, onConfirm, onClose }: MarkOutModalProps) {
  const [reason, setReason] = useState('unavailable');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayDate = (() => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  })();

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(reason, notes || undefined);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to mark operator as unavailable');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70]" onClick={onClose} />

      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white dark:bg-[#1a0f35] rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-rose-600 to-red-600 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <UserX className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Mark Unavailable</h2>
                  <p className="text-rose-200 text-sm">{operatorName}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {error && (
              <div className="px-3 py-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg text-sm text-red-700 dark:text-red-300 font-medium">
                {error}
              </div>
            )}

            {/* Date display */}
            <div className="px-4 py-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl">
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide mb-0.5">Date</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{displayDate}</p>
            </div>

            {/* Reason selector */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-white/70 mb-2">Reason</label>
              <div className="grid grid-cols-1 gap-2">
                {UNAVAILABLE_REASONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setReason(r.value)}
                    className={`text-left px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                      reason === r.value
                        ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-400 dark:border-rose-400/60 text-rose-700 dark:text-rose-300'
                        : 'bg-gray-50 dark:bg-white/[0.03] text-gray-600 dark:text-white/50 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional notes */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-white/70 mb-1.5">
                Notes <span className="font-normal text-gray-400 dark:text-white/30">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional details..."
                rows={2}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 dark:focus:ring-rose-500/20 text-sm font-medium bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-white/30 transition-all resize-none"
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
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
                {saving ? 'Marking...' : 'Mark Unavailable'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
