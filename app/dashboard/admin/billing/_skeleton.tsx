'use client';

/**
 * Shape-matched skeleton for /dashboard/admin/billing.
 *
 * Real page:
 *   sticky header (back + title + create + refresh)
 *   4 stat tiles (drafts / sent / paid / outstanding)
 *   tabs row (All Invoices / Ready to Bill)
 *   filter row (search + status select)
 *   invoice table (6 cols)
 */

import { Skeleton, SkeletonTable, RevealSection } from '@/components/ui/Skeleton';

export default function BillingSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Sticky header */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton width="w-9" height="h-9" rounded="rounded-lg" />
              <div className="space-y-2">
                <Skeleton width="w-48" height="h-5" />
                <Skeleton width="w-56" height="h-3" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton width="w-36" height="h-9" rounded="rounded-lg" />
              <Skeleton width="w-9" height="h-9" rounded="rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats */}
        <RevealSection index={0}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-gray-200 dark:border-slate-700 shadow-sm"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Skeleton width="w-8" height="h-8" rounded="rounded-lg" />
                </div>
                <Skeleton width="w-16" height="h-7" />
                <Skeleton width="w-20" height="h-3" className="mt-2" />
              </div>
            ))}
          </div>
        </RevealSection>

        {/* Tabs */}
        <RevealSection index={1}>
          <div className="flex gap-4 mb-5 border-b border-gray-200 dark:border-slate-800 pb-2">
            <Skeleton width="w-36" height="h-5" />
            <Skeleton width="w-28" height="h-5" />
          </div>
        </RevealSection>

        {/* Filter chips / search */}
        <RevealSection index={2}>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
            <Skeleton width="w-full" height="h-10" rounded="rounded-lg" className="sm:flex-1" />
            <Skeleton width="w-36" height="h-10" rounded="rounded-lg" />
          </div>
        </RevealSection>

        {/* Invoice table */}
        <RevealSection index={3}>
          <SkeletonTable rows={6} cols={6} />
        </RevealSection>
      </div>
    </div>
  );
}
