'use client';

import { AlertTriangle, X, Plus, ArrowRight, ArrowUp } from 'lucide-react';

/**
 * Two flavors (founder Aug 2 — one-job-per-day rule DROPPED, jobs sequence):
 *  • Sequencing confirm (pass `onMakeFirst`): the person already has a job
 *    that day — add the new one as their NEXT job, or make it their #1.
 *  • Row-change conflict (pass `onMoveToJob`, no `onMakeFirst`): moving an
 *    operator between board rows — legacy add-second/move choices.
 */
interface ConflictModalProps {
  personName: string;
  personRole: 'operator' | 'helper';
  currentJobName: string;
  newJobName: string;
  /** Add the new job after their existing one(s). */
  onAddSecondJob: () => void;
  /** Sequencing: make the NEW job their #1 (existing shifts to #2). */
  onMakeFirst?: () => void;
  /** Row-change flow: move the person here, unassigning their current jobs. */
  onMoveToJob?: () => void;
  onClose: () => void;
}

export default function ConflictModal({
  personName, personRole, currentJobName, newJobName,
  onAddSecondJob, onMakeFirst, onMoveToJob, onClose,
}: ConflictModalProps) {
  const sequencing = !!onMakeFirst;
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
                <h2 className="text-lg font-bold">{sequencing ? 'Already Booked That Day' : 'Schedule Conflict'}</h2>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-700 dark:text-white/70">
              <span className="font-bold text-gray-900 dark:text-white">{personName}</span>
              {' '}({personRole}) already has{' '}
              <span className="font-bold text-gray-900 dark:text-white">{currentJobName}</span>
              {' '}that day.{sequencing ? ' Jobs run in order — the next one starts after the one before it is completed.' : ''}
            </p>

            <div className="space-y-2">
              <button
                onClick={onAddSecondJob}
                className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 border-2 border-blue-200 dark:border-blue-500/30 hover:border-blue-300 rounded-xl text-left transition-all"
              >
                <Plus className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-gray-900 dark:text-white text-sm">
                    {sequencing ? 'Add as their next job' : 'Add as 2nd Job'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-white/50">
                    {sequencing
                      ? `${newJobName} starts after ${currentJobName} is completed`
                      : `Keep current job and add ${newJobName} too`}
                  </p>
                </div>
              </button>

              {sequencing && onMakeFirst && (
                <button
                  onClick={onMakeFirst}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-brand/5 dark:bg-brand/10 hover:bg-brand/10 dark:hover:bg-brand/20 border-2 border-brand/30 dark:border-brand/30 hover:border-brand/50 rounded-xl text-left transition-all"
                >
                  <ArrowUp className="w-5 h-5 text-brand flex-shrink-0" />
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white text-sm">Make this their #1 job</p>
                    <p className="text-xs text-gray-500 dark:text-white/50">
                      {newJobName} runs first — {currentJobName} moves after it
                    </p>
                  </div>
                </button>
              )}

              {!sequencing && onMoveToJob && (
                <button
                  onClick={onMoveToJob}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-brand/5 dark:bg-brand/10 hover:bg-brand/10 dark:hover:bg-brand/20 border-2 border-brand/30 dark:border-brand/30 hover:border-brand/50 rounded-xl text-left transition-all"
                >
                  <ArrowRight className="w-5 h-5 text-brand flex-shrink-0" />
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white text-sm">Move to {newJobName}</p>
                    <p className="text-xs text-gray-500 dark:text-white/50">Remove from {currentJobName} and assign here</p>
                  </div>
                </button>
              )}
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
