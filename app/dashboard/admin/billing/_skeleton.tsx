'use client';

/**
 * Shape-matched skeleton for /dashboard/admin/billing.
 * Light-default aesthetic with dark: variants, matching Active Jobs.
 */

import { Skeleton, SkeletonTable, RevealSection } from '@/components/ui/Skeleton';

export default function BillingSkeleton() {
  return (
    <div
      className="
        min-h-screen
        bg-gradient-to-b from-slate-50 to-white
        dark:from-[#0b0618] dark:to-[#0e0720]
      "
    >
      {/* Sticky header */}
      <div
        className="
          sticky top-0 z-40 border-b shadow-sm backdrop-blur
          bg-white/90 border-slate-200
          dark:bg-[#0b0618]/80 dark:border-white/10
        "
      >
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
        {/* Hero totals */}
        <RevealSection index={0}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="
                  rounded-2xl p-6 ring-1 shadow-sm
                  bg-white/90 ring-slate-200
                  dark:bg-white/[0.04] dark:ring-white/10
                "
              >
                <Skeleton width="w-24" height="h-3" className="mb-3" />
                <Skeleton width="w-40" height="h-10" />
                <Skeleton width="w-32" height="h-3" className="mt-3" />
              </div>
            ))}
          </div>
        </RevealSection>

        {/* Stat tiles */}
        <RevealSection index={1}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="
                  rounded-2xl p-4 ring-1 shadow-sm
                  bg-white/90 ring-slate-200
                  dark:bg-white/[0.04] dark:ring-white/10
                "
              >
                <div className="flex items-center gap-2 mb-3">
                  <Skeleton width="w-9" height="h-9" rounded="rounded-xl" />
                </div>
                <Skeleton width="w-16" height="h-7" />
                <Skeleton width="w-20" height="h-3" className="mt-2" />
              </div>
            ))}
          </div>
        </RevealSection>

        {/* Tabs */}
        <RevealSection index={2}>
          <div className="flex gap-4 mb-5 border-b border-slate-200 dark:border-white/10 pb-2">
            <Skeleton width="w-36" height="h-5" />
            <Skeleton width="w-28" height="h-5" />
          </div>
        </RevealSection>

        {/* Filter row */}
        <RevealSection index={3}>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
            <Skeleton width="w-full" height="h-10" rounded="rounded-lg" className="sm:flex-1" />
            <Skeleton width="w-36" height="h-10" rounded="rounded-lg" />
          </div>
        </RevealSection>

        {/* Invoice table */}
        <RevealSection index={4}>
          <SkeletonTable rows={6} cols={6} />
        </RevealSection>
      </div>
    </div>
  );
}
