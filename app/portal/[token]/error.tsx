'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PortalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error to an error reporting service if available
    console.error('[portal] render error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-rose-500/10 border border-rose-500/30 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-rose-400" />
        </div>

        <h1 className="text-xl font-bold text-white mb-2">Something Went Wrong</h1>

        <p className="text-sm text-rose-200/80 mb-6">
          We couldn&apos;t load your customer portal. Please try again or contact your service provider.
        </p>

        <button
          onClick={reset}
          className="inline-flex items-center gap-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 text-sm font-medium px-6 py-3 rounded-xl transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
