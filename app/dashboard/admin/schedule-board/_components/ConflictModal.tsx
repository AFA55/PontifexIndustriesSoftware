'use client';

import { AlertTriangle, X, Plus, ArrowRight } from 'lucide-react';

interface ConflictModalProps {
  personName: string;
  personRole: 'operator' | 'helper';
  currentJobName: string;
  newJobName: string;
  onAddSecondJob: () => void;
  onMoveToJob: () => void;
  onClose: () => void;
}

export default function ConflictModal({
  personName, personRole, currentJobName, newJobName,
  onAddSecondJob, onMoveToJob, onClose,
}: ConflictModalProps) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90]" onClick={onClose} />

      <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
        <div className="bg-white dark:bg-[#0e0720] dark:border dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <h2 className="text-lg font-bold">Schedule Conflict</h2>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-700 dark:text-white/70">
              <span className="font-bold text-gray-900 dark:text-white">{personName}</span>
              {' '}({personRole}) is already assigned to{' '}
              <span className="font-bold text-gray-900 dark:text-white">{currentJobName}</span>
              {' '}today.
            </p>

            <div className="space-y-2">
              <button
                onClick={onAddSecondJob}
                className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 border-2 border-blue-200 dark:border-blue-500/30 hover:border-blue-300 rounded-xl text-left transition-all"
              >
                <Plus className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-gray-900 dark:text-white text-sm">Add as 2nd Job</p>
                  <p className="text-xs text-gray-500 dark:text-white/50">Keep current job and add {newJobName} too</p>
                </div>
              </button>

              <button
                onClick={onMoveToJob}
                className="w-full flex items-center gap-3 px-4 py-3 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 border-2 border-purple-200 dark:border-purple-500/30 hover:border-purple-300 rounded-xl text-left transition-all"
              >
                <ArrowRight className="w-5 h-5 text-purple-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-gray-900 dark:text-white text-sm">Move to {newJobName}</p>
                  <p className="text-xs text-gray-500 dark:text-white/50">Remove from {currentJobName} and assign here</p>
                </div>
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2 text-sm font-semibold text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
