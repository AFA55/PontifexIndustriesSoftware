'use client';

import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-rose-50/30 p-4">
      <div className="max-w-sm w-full bg-white rounded-2xl ring-1 ring-rose-200 shadow-lg p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h1 className="text-lg font-semibold text-slate-900 mb-2">Couldn&apos;t load work entry</h1>
        <p className="text-sm text-slate-600 mb-5">
          {error.message || 'Your data is safe. Try again or go back to your jobs.'}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium"
          >
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
          <Link
            href="/dashboard/my-jobs"
            className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Back to my jobs
          </Link>
        </div>
      </div>
    </div>
  );
}
