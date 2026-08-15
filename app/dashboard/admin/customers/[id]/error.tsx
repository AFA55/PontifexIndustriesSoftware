'use client';

import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-rose-50/30 dark:from-[#0b0618] dark:to-[#0e0720] p-6">
      <div className="max-w-md w-full bg-white dark:bg-white/5 rounded-2xl ring-1 ring-rose-200 dark:ring-rose-400/30 shadow-lg p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-rose-500 dark:text-rose-400 mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Something went wrong</h1>
        <p className="text-sm text-slate-600 dark:text-white/60 mb-6">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
          <Link
            href="/dashboard/admin"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/80 rounded-lg hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
          >
            <Home className="w-4 h-4" /> Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
