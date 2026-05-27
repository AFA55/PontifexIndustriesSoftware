'use client';

import { Megaphone, AlertCircle, Loader2, X } from 'lucide-react';
import { formatDisplayDate } from './helpers';

interface DispatchInfo {
  total: number;
  dispatched: number;
  undispatched: number;
}

interface DispatchConfirmationModalProps {
  selectedDate: string;
  dispatchInfo: DispatchInfo | null;
  dispatchLoading: boolean;
  onDispatch: () => void;
  onClose: () => void;
}

export default function DispatchConfirmationModal({
  selectedDate,
  dispatchInfo,
  dispatchLoading,
  onDispatch,
  onClose,
}: DispatchConfirmationModalProps) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={() => !dispatchLoading && onClose()} />
      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
          <div className="bg-gradient-to-r from-orange-500 to-red-500 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Megaphone className="w-5 h-5" />
                  Push Job Tickets
                </h2>
                <p className="text-orange-100 text-sm">Dispatch tickets for {formatDisplayDate(selectedDate)}</p>
              </div>
              <button onClick={() => !dispatchLoading && onClose()} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {dispatchInfo ? (
              <>
                <div className="flex justify-center">
                  <div className="text-center p-4 bg-gray-50 dark:bg-slate-700 rounded-xl min-w-[120px]">
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">{dispatchInfo.total}</div>
                    <div className="text-xs text-gray-500 dark:text-white/60 font-medium mt-1">Assigned Jobs</div>
                  </div>
                </div>

                {dispatchInfo.total === 0 ? (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-white/10 rounded-xl">
                    <AlertCircle className="w-6 h-6 text-gray-400 dark:text-white/50 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-gray-700 dark:text-white/70">No assigned jobs for this date</p>
                      <p className="text-xs text-gray-500 dark:text-white/60">Assign operators to jobs on the board first.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-xl">
                    <Megaphone className="w-6 h-6 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-orange-800 dark:text-orange-400">{dispatchInfo.total} job(s) will be dispatched</p>
                      <p className="text-xs text-orange-600 dark:text-orange-500">All assigned operators and helpers will be notified.</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                disabled={dispatchLoading}
                className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-white/10 rounded-xl text-gray-700 dark:text-white/70 font-semibold hover:bg-gray-50 dark:hover:bg-white/10 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onDispatch}
                disabled={dispatchLoading || !dispatchInfo || dispatchInfo.total === 0}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {dispatchLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Dispatching...</>
                ) : (
                  <><Megaphone className="w-4 h-4" /> Push {dispatchInfo?.total || 0} Tickets</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
