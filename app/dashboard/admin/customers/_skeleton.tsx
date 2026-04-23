'use client';

/**
 * Shape-matched skeleton for /dashboard/admin/customers.
 *
 * Real page:
 *   header (back + title + Add Customer button)
 *   3 stat tiles (customers / total jobs / revenue)
 *   search input
 *   3-col grid of customer cards
 */

import { Skeleton, RevealSection } from '@/components/ui/Skeleton';

export default function CustomersSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      <div className="container mx-auto px-4 md:px-6 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Skeleton width="w-9" height="h-9" rounded="rounded-xl" />
            <div className="space-y-2">
              <Skeleton width="w-56" height="h-6" />
              <Skeleton width="w-64" height="h-3" />
            </div>
          </div>
          <Skeleton width="w-36" height="h-10" rounded="rounded-xl" />
        </div>

        {/* Stats */}
        <RevealSection index={0}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm"
              >
                <Skeleton width="w-16" height="h-7" />
                <Skeleton width="w-20" height="h-3" className="mt-2" />
              </div>
            ))}
          </div>
        </RevealSection>

        {/* Search */}
        <RevealSection index={1}>
          <div className="mb-4">
            <Skeleton width="w-full" height="h-10" rounded="rounded-xl" />
          </div>
        </RevealSection>

        {/* Customer grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <RevealSection key={i} index={Math.min(2 + Math.floor(i / 3), 6)}>
              <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm">
                <div className="flex items-start gap-3 mb-3">
                  <Skeleton width="w-10" height="h-10" rounded="rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton width="w-3/4" height="h-4" />
                    <Skeleton width="w-1/2" height="h-3" />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-slate-800">
                  <div className="space-y-1.5">
                    <Skeleton width="w-12" height="h-3" />
                    <Skeleton width="w-8" height="h-4" />
                  </div>
                  <div className="space-y-1.5 text-right">
                    <Skeleton width="w-16" height="h-3" />
                    <Skeleton width="w-20" height="h-4" />
                  </div>
                </div>
              </div>
            </RevealSection>
          ))}
        </div>
      </div>
    </div>
  );
}
