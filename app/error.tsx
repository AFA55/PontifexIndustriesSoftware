'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * Route-level error boundary — catches unhandled errors within a page segment.
 * Styled in the platform's purple/dark theme to match the rest of the app.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Captured by Vercel Function Logs
    console.error('[ErrorBoundary]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-10 max-w-md w-full text-center shadow-2xl">
        {/* Icon */}
        <div className="w-16 h-16 bg-red-500/20 border border-red-500/40 rounded-full flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
        <p className="text-white/60 text-sm mb-6">
          An unexpected error occurred on this page. Please try again or return to
          the dashboard.
        </p>

        {error.digest && (
          <p className="text-xs text-white/30 font-mono mb-5 bg-black/30 rounded-md px-3 py-1.5 inline-block">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white rounded-lg text-sm font-semibold transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
          <a
            href="/dashboard/admin"
            className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg text-sm font-semibold transition-all"
          >
            <Home className="w-4 h-4" />
            Dashboard
          </a>
        </div>

        <p className="mt-8 text-xs text-white/20">Pontifex Industries Platform</p>
      </div>
    </div>
  );
}
