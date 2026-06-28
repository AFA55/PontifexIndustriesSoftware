'use client';

import { useState } from 'react';
import { Settings, X } from 'lucide-react';

interface CapacitySettingsModalProps {
  currentMax: number;
  currentWarning: number;
  onSave: (maxSlots: number, warningThreshold: number) => void;
  onClose: () => void;
}

export default function CapacitySettingsModal({
  currentMax,
  currentWarning,
  onSave,
  onClose,
}: CapacitySettingsModalProps) {
  const [maxSlots, setMaxSlots] = useState(currentMax);
  const [warningThreshold, setWarningThreshold] = useState(currentWarning);
  const isValid = maxSlots >= 1 && maxSlots <= 50 && warningThreshold >= 1 && warningThreshold <= maxSlots;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200">
          <div className="bg-gradient-to-r from-brand to-brand-accent p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Capacity Settings
                </h2>
                <p className="text-white/70 text-sm">Adjust crew slots as your team grows</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-white/70 mb-1.5">
                Max Crew Slots
              </label>
              <p className="text-xs text-gray-500 dark:text-white/60 mb-2">Total number of crew rows on the schedule board</p>
              <input
                type="number"
                min={1}
                max={50}
                value={maxSlots}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 1;
                  setMaxSlots(v);
                  if (warningThreshold > v) setWarningThreshold(v);
                }}
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-white/10 dark:bg-slate-700 dark:text-white rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 text-lg font-bold text-gray-900 bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-white/70 mb-1.5">
                Warning Threshold
              </label>
              <p className="text-xs text-gray-500 dark:text-white/60 mb-2">Show capacity warning when this many slots are filled</p>
              <input
                type="number"
                min={1}
                max={maxSlots}
                value={warningThreshold}
                onChange={(e) => setWarningThreshold(Math.min(parseInt(e.target.value) || 1, maxSlots))}
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-white/10 dark:bg-slate-700 dark:text-white rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-200 text-lg font-bold text-gray-900 bg-white transition-all"
              />
            </div>

            {/* Preview */}
            <div className="bg-gray-50 dark:bg-slate-700 rounded-xl p-3 border border-gray-200 dark:border-white/10">
              <p className="text-xs text-gray-600 dark:text-white/60">
                <strong>Preview:</strong> {maxSlots} total slots. Warning at {warningThreshold}+ jobs.
                {warningThreshold < maxSlots && (
                  <span className="block mt-1 text-amber-600 dark:text-amber-400">
                    Slots {warningThreshold}-{maxSlots - 1}: amber warning shown
                  </span>
                )}
                <span className="block mt-0.5 text-red-600 dark:text-red-400">
                  At {maxSlots}: schedule marked full, approval blocked
                </span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-white/15 text-gray-700 dark:text-white/70 rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => onSave(maxSlots, warningThreshold)}
                disabled={!isValid}
                className="flex-1 py-3 bg-gradient-to-r from-brand to-brand-accent hover:from-brand-dark hover:to-brand-accent text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
