'use client';

/**
 * Shape-matched skeleton for /dashboard/admin/active-jobs.
 *
 * Real page:
 *   header row (title + toggle + refresh)
 *   4 stat tiles
 *   filter chip row
 *   vertical list of job cards (job-number, status pill, title, meta row)
 */

import { Skeleton, SkeletonStat, RevealSection } from '@/components/ui/Skeleton';

export default function ActiveJobsSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <Skeleton width="w-40" height="h-6" />
            <Skeleton width="w-56" height="h-3.5" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton width="w-32" height="h-9" rounded="rounded-lg" />
            <Skeleton width="w-9" height="h-9" rounded="rounded-lg" />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonStat key={i} />
          ))}
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {['w-16', 'w-20', 'w-28', 'w-36'].map((w, i) => (
            <Skeleton key={i} width={w} height="h-9" rounded="rounded-lg" />
          ))}
        </div>

        {/* Job cards */}
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <RevealSection key={i} index={i}>
              <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Skeleton width="w-24" height="h-3" />
                      <Skeleton width="w-20" height="h-5" rounded="rounded-full" />
                      {i % 3 === 0 && (
                        <Skeleton width="w-28" height="h-5" rounded="rounded-full" />
                      )}
                    </div>
                    <Skeleton width="w-2/3" height="h-5" />
                    <div className="flex items-center gap-4 flex-wrap">
                      <Skeleton width="w-28" height="h-3" />
                      <Skeleton width="w-36" height="h-3" />
                      <Skeleton width="w-24" height="h-3" />
                    </div>
                  </div>
                  <Skeleton width="w-5" height="h-5" rounded="rounded" />
                </div>
              </div>
            </RevealSection>
          ))}
        </div>
      </div>
    </div>
  );
}
