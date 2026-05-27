'use client';

import { KeyRound, Loader2, Copy, RefreshCw, X } from 'lucide-react';

interface DailyCodeModalProps {
  dailyCode: string | null;
  codeLoading: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  onClose: () => void;
}

export default function DailyCodeModal({
  dailyCode,
  codeLoading,
  onCopy,
  onRegenerate,
  onClose,
}: DailyCodeModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#0e0720] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 p-6 w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Today&apos;s Shop Code</h3>
              <p className="text-xs text-gray-500 dark:text-white/50">Share with your team each morning</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-white/50" />
          </button>
        </div>

        {codeLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : dailyCode ? (
          <>
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-500/10 dark:to-purple-500/10 rounded-2xl border-2 border-indigo-200 dark:border-indigo-500/30 p-6 text-center mb-4">
              <p className="text-4xl font-black tracking-[0.3em] text-indigo-700 dark:text-indigo-300 font-mono">{dailyCode}</p>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-2">Valid today only • Resets at midnight</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onCopy}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-500/15 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 border border-indigo-200 dark:border-indigo-500/30 rounded-xl text-indigo-700 dark:text-indigo-300 text-sm font-semibold transition-all"
              >
                <Copy className="w-4 h-4" /> Copy
              </button>
              <button
                onClick={onRegenerate}
                disabled={codeLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-50 dark:bg-orange-500/15 hover:bg-orange-100 dark:hover:bg-orange-500/25 border border-orange-200 dark:border-orange-500/30 rounded-xl text-orange-700 dark:text-orange-300 text-sm font-semibold transition-all"
              >
                <RefreshCw className="w-4 h-4" /> Regenerate
              </button>
            </div>
            <p className="text-xs text-gray-400 dark:text-white/30 text-center mt-3">
              Regenerating invalidates the old code immediately
            </p>
          </>
        ) : (
          <div className="text-center py-6">
            <p className="text-gray-500 dark:text-white/50 mb-4 text-sm">No code set for today yet.</p>
            <button
              onClick={onRegenerate}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all flex items-center gap-2 mx-auto"
            >
              <KeyRound className="w-4 h-4" /> Generate Today&apos;s Code
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
