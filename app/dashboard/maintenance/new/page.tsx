'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ArrowLeft, Wrench, Construction } from 'lucide-react';

/**
 * Placeholder for the operator-side "Report Equipment Issue" form.
 * Real form ships in Phase 2 of the shop manager rollout —
 * see SHOP_MANAGER_PLAN.md for the 3-tap mobile-first design.
 */
export default function MaintenanceRequestPlaceholderPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        {/* Vibrant gradient hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-rose-500 p-6 sm:p-8 shadow-xl shadow-orange-500/30 text-white">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 flex-shrink-0">
              <Wrench className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Report Equipment Issue</h1>
              <p className="text-sm text-white/80 mt-0.5">Submit a request to the shop manager</p>
            </div>
          </div>
        </div>

        {/* Coming-soon notice */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 sm:p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
            <Construction className="w-7 h-7 text-violet-600 dark:text-violet-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Coming in Phase 2
          </h2>
          <p className="text-sm text-gray-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
            The full mobile-first request form ships in the next phase.
            It'll be a 3-tap flow: pick equipment → describe what's wrong (voice memo OK) → tap submit.
            For now this card just confirms the entry point works — the shop manager system foundation lands first.
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-4">
            See <code className="font-mono">SHOP_MANAGER_PLAN.md</code> for the full design.
          </p>
        </div>
      </div>
    </div>
  );
}
