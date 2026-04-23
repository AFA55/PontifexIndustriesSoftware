'use client';

/**
 * Purpose-built skeleton for /dashboard/admin/completed-job-tickets/[id].
 *
 * Shape-matches the real page so the transition from loading -> content
 * is a polish pass, not a layout pop. The real page is assembled from:
 *   header row (breadcrumb + action buttons)
 *   Job Overview  (3-column labeled grid)
 *   Scope Completed (stat tiles w/ progress bars)
 *   Labor Hours (table)
 *   Billing Milestones (row list)
 *   Customer Feedback (3 rating tiles + comments)
 *   Documents & Photos (card grid)
 */

import {
  Skeleton,
  SkeletonText,
  SkeletonTable,
  RevealSection,
} from '@/components/ui/Skeleton';

export function CompletedJobTicketSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Sticky header */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton width="w-9" height="h-9" rounded="rounded-lg" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton width="w-20" height="h-3" />
                <Skeleton width="w-3" height="h-3" rounded="rounded-full" />
                <Skeleton width="w-44" height="h-5" />
              </div>
              <Skeleton width="w-40" height="h-3.5" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton width="w-28" height="h-8" rounded="rounded-full" />
              <Skeleton width="w-40" height="h-9" rounded="rounded-lg" />
              <Skeleton width="w-40" height="h-9" rounded="rounded-lg" />
              <Skeleton width="w-32" height="h-9" rounded="rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Job Overview — 3-col grid of labeled fields */}
        <RevealSection index={0}>
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Skeleton width="w-5" height="h-5" rounded="rounded" />
              <Skeleton width="w-36" height="h-5" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton width="w-24" height="h-3" />
                  <Skeleton width={i % 3 === 0 ? 'w-40' : 'w-32'} height="h-4" />
                </div>
              ))}
            </div>
          </div>
        </RevealSection>

        {/* Scope Completed — stat tiles + progress bars */}
        <RevealSection index={1}>
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Skeleton width="w-5" height="h-5" rounded="rounded" />
              <Skeleton width="w-36" height="h-5" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 text-center space-y-3"
                >
                  <Skeleton width="w-20" height="h-3" className="mx-auto" />
                  <Skeleton width="w-16" height="h-8" className="mx-auto" />
                  <Skeleton width="w-28" height="h-2.5" className="mx-auto" rounded="rounded-full" />
                  <Skeleton width="w-24" height="h-3" className="mx-auto" />
                </div>
              ))}
            </div>
          </div>
        </RevealSection>

        {/* Labor Hours — table */}
        <RevealSection index={2}>
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Skeleton width="w-5" height="h-5" rounded="rounded" />
              <Skeleton width="w-28" height="h-5" />
            </div>
            <SkeletonTable rows={4} cols={6} />
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-800 flex flex-wrap gap-3">
              <Skeleton width="w-40" height="h-8" rounded="rounded-lg" />
              <Skeleton width="w-32" height="h-8" rounded="rounded-lg" />
              <Skeleton width="w-48" height="h-8" rounded="rounded-lg" />
            </div>
          </div>
        </RevealSection>

        {/* Billing Milestones — row list */}
        <RevealSection index={3}>
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Skeleton width="w-5" height="h-5" rounded="rounded" />
                <Skeleton width="w-48" height="h-5" />
              </div>
              <Skeleton width="w-32" height="h-8" rounded="rounded-lg" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton width="w-8" height="h-8" rounded="rounded-full" />
                    <div className="space-y-2">
                      <Skeleton width="w-44" height="h-4" />
                      <Skeleton width="w-28" height="h-3" />
                    </div>
                  </div>
                  <Skeleton width="w-24" height="h-7" rounded="rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </RevealSection>

        {/* Customer Feedback — 3 rating tiles + comments */}
        <RevealSection index={4}>
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Skeleton width="w-5" height="h-5" rounded="rounded" />
              <Skeleton width="w-44" height="h-5" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 text-center space-y-3"
                >
                  <Skeleton width="w-20" height="h-3" className="mx-auto" />
                  <Skeleton width="w-20" height="h-8" className="mx-auto" />
                  <Skeleton width="w-28" height="h-4" className="mx-auto" />
                </div>
              ))}
            </div>
            <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
              <Skeleton width="w-32" height="h-3" className="mb-2" />
              <SkeletonText lines={2} />
            </div>
          </div>
        </RevealSection>

        {/* Documents & Photos — card grid */}
        <RevealSection index={5}>
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Skeleton width="w-5" height="h-5" rounded="rounded" />
              <Skeleton width="w-52" height="h-5" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg p-4 border-2 border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Skeleton width="w-5" height="h-5" rounded="rounded" />
                    <Skeleton width="w-40" height="h-4" />
                  </div>
                  <SkeletonText lines={2} className="mb-3" />
                  <div className="flex gap-2">
                    <Skeleton width="w-full" height="h-9" rounded="rounded-lg" />
                    <Skeleton width="w-10" height="h-9" rounded="rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </RevealSection>
      </div>
    </div>
  );
}
