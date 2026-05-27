'use client';

import { Brain, Zap, AlertCircle, Sparkles, X } from 'lucide-react';

interface AutoScheduleAssignment {
  jobNumber: string;
  customerName: string;
  operatorName: string;
  matchQuality: string;
  reason: string;
  travelDistance?: number | null;
}

interface AutoScheduleSkipped {
  jobNumber: string;
  customerName: string;
  reason: string;
}

export interface AutoScheduleResults {
  assignments: AutoScheduleAssignment[];
  skipped: AutoScheduleSkipped[];
  totalAssigned: number;
  totalUnassigned: number;
  totalSkipped: number;
  message: string;
}

interface AutoScheduleResultsModalProps {
  results: AutoScheduleResults;
  onClose: () => void;
}

export default function AutoScheduleResultsModal({ results, onClose }: AutoScheduleResultsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">AI Auto-Schedule Results</h2>
              <p className="text-violet-200 text-sm">{results.message}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-all">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Stats */}
        <div className="px-6 py-4 grid grid-cols-3 gap-3 border-b border-gray-100 dark:border-white/10">
          <div className="text-center p-3 bg-green-50 dark:bg-green-500/10 rounded-xl">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{results.totalAssigned}</div>
            <div className="text-xs font-semibold text-green-500 dark:text-green-500 uppercase">Assigned</div>
          </div>
          <div className="text-center p-3 bg-amber-50 dark:bg-amber-500/10 rounded-xl">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{results.totalSkipped}</div>
            <div className="text-xs font-semibold text-amber-500 dark:text-amber-500 uppercase">Skipped</div>
          </div>
          <div className="text-center p-3 bg-purple-50 dark:bg-purple-500/10 rounded-xl">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{results.totalUnassigned}</div>
            <div className="text-xs font-semibold text-purple-500 dark:text-purple-500 uppercase">Total Jobs</div>
          </div>
        </div>

        {/* Assignments list */}
        <div className="px-6 py-4 overflow-y-auto max-h-[45vh] space-y-2">
          {results.assignments.length > 0 && (
            <>
              <h3 className="text-sm font-bold text-gray-500 dark:text-white/50 uppercase flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-green-500" /> Assignments
              </h3>
              {results.assignments.map((a, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-100 dark:border-white/10">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-white text-sm truncate">{a.customerName}</div>
                    <div className="text-xs text-gray-500 dark:text-white/60">{a.jobNumber}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className="text-sm font-medium text-gray-700 dark:text-white/70">→ {a.operatorName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      a.matchQuality === 'good' ? 'bg-green-100 text-green-700' :
                      a.matchQuality === 'stretch' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {a.matchQuality === 'good' ? '✓ Good' : a.matchQuality === 'stretch' ? '~ Stretch' : '✗ Over'}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}

          {results.skipped.length > 0 && (
            <>
              <h3 className="text-sm font-bold text-gray-500 dark:text-white/50 uppercase flex items-center gap-2 mt-4 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-500" /> Skipped
              </h3>
              {results.skipped.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-500/10 rounded-xl border border-amber-100 dark:border-amber-500/20">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-white text-sm truncate">{s.customerName}</div>
                    <div className="text-xs text-gray-500 dark:text-white/50">{s.jobNumber}</div>
                  </div>
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium ml-3">{s.reason}</span>
                </div>
              ))}
            </>
          )}

          {results.assignments.length === 0 && results.skipped.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Sparkles className="w-8 h-8 text-gray-300 dark:text-white/20 mx-auto mb-2" />
              <p className="dark:text-white/50">No unassigned jobs to schedule</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
