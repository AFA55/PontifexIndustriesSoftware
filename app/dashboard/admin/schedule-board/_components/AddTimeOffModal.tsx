'use client';

import { useState } from 'react';
import { X, CalendarOff, Loader2 } from 'lucide-react';

interface AddTimeOffModalProps {
  operators: { id: string; name: string }[];
  defaultDate: string;
  onSuccess: () => void;
  onClose: () => void;
}

const TIME_OFF_TYPES = [
  { value: 'pto', label: 'PTO', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'unpaid', label: 'Unpaid', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'worked_last_night', label: 'Worked Last Night', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'sick', label: 'Sick', color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'other', label: 'Other', color: 'bg-amber-100 text-amber-700 border-amber-300' },
];

export default function AddTimeOffModal({ operators, defaultDate, onSuccess, onClose }: AddTimeOffModalProps) {
  const [operatorId, setOperatorId] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [type, setType] = useState('pto');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!operatorId) {
      setError('Please select an operator');
      return;
    }
    if (!date) {
      setError('Please select a date');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const res = await fetch('/api/admin/schedule-board/time-off', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ operator_id: operatorId, date, type, notes: notes || null }),
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
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-600 to-slate-700 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <CalendarOff className="w-5 h-5" />
                  Add Time Off
                </h2>
                <p className="text-slate-300 text-sm">Mark an operator as unavailable</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Error banner */}
            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
                {error}
              </div>
            )}

            {/* Operator dropdown */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Operator</label>
              <select
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm font-medium bg-white text-gray-900 transition-all"
              >
                <option value="">Select Operator...</option>
                {operators.map(op => (
                  <option key={op.id} value={op.id}>{op.name}</option>
                ))}
              </select>
            </div>

            {/* Date picker */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm font-medium bg-white text-gray-900 transition-all"
              />
            </div>

            {/* Type radio buttons */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {TIME_OFF_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={`px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                      type === t.value
                        ? `${t.color} ring-2 ring-offset-1 ring-slate-400`
                        : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Notes <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional details..."
                rows={2}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm font-medium bg-white text-gray-900 transition-all resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !operatorId}
                className="flex-1 py-2.5 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? 'Saving...' : 'Add Time Off'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
