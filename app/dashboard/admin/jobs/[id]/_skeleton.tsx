'use client';

/**
 * Shape-matched skeleton for /dashboard/admin/jobs/[id].
 *
 * The real page is a 2/3 + 1/3 two-column layout with many sections:
 *   back link
 *   job header (job #, status pill, title, meta row, edit button)
 *   LEFT  (2/3): Project Details, Equipment, Scope Progress, Work Performed,
 *                Jobsite Conditions, Site Compliance, Change Orders, Related Jobs
 *   RIGHT (1/3): Status tracker, Crew, Billing Settings, Note for Operator,
 *                Completion Review (conditional), Notes Feed
 *
 * Many sections are conditional on data — the skeleton renders a reasonable
 * default shape (3 left cards + 3 right cards) rather than every possible
 * section, which matches the most common "loaded" view.
 */

import { Skeleton, SkeletonText, RevealSection } from '@/components/ui/Skeleton';

function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm p-5 ${className || ''}`}
    >
      {children}
    </div>
  );
}

function SectionHeader({ titleWidth = 'w-40' }: { titleWidth?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Skeleton width="w-5" height="h-5" rounded="rounded" />
      <Skeleton width={titleWidth} height="h-4" />
    </div>
  );
}

export default function JobDetailSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Back link */}
        <Skeleton width="w-36" height="h-4" />

        {/* Header card */}
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <Skeleton width="w-32" height="h-6" />
                <Skeleton width="w-24" height="h-6" rounded="rounded-full" />
              </div>
              <Skeleton width="w-2/3" height="h-6" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2">
                <Skeleton width="w-32" height="h-3.5" />
                <Skeleton width="w-40" height="h-3.5" />
                <Skeleton width="w-48" height="h-3.5" />
              </div>
            </div>
            <Skeleton width="w-36" height="h-9" rounded="rounded-xl" />
          </div>
        </Card>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* LEFT */}
          <div className="lg:col-span-2 space-y-5">
            {/* Project Details */}
            <RevealSection index={0}>
              <Card>
                <SectionHeader titleWidth="w-36" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="space-y-1.5">
                      <Skeleton width="w-20" height="h-3" />
                      <Skeleton width={i % 2 === 0 ? 'w-32' : 'w-24'} height="h-4" />
                    </div>
                  ))}
                </div>
                <div className="mt-5 space-y-2">
                  <Skeleton width="w-32" height="h-3" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700"
                      >
                        <Skeleton width="w-4" height="h-4" rounded="rounded" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton width="w-16" height="h-2.5" />
                          <Skeleton width="w-32" height="h-3.5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </RevealSection>

            {/* Scope Progress */}
            <RevealSection index={1}>
              <Card>
                <SectionHeader titleWidth="w-32" />
                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton width="w-32" height="h-4" />
                    <Skeleton width="w-10" height="h-4" />
                  </div>
                  <Skeleton width="w-full" height="h-3" rounded="rounded-full" />
                </div>
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-gray-50 dark:bg-slate-800 rounded-xl p-3 border border-gray-100 dark:border-slate-700 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <Skeleton width="w-40" height="h-3.5" />
                        <Skeleton width="w-12" height="h-5" rounded="rounded-full" />
                      </div>
                      <Skeleton width="w-full" height="h-2" rounded="rounded-full" />
                    </div>
                  ))}
                </div>
              </Card>
            </RevealSection>

            {/* Work Performed */}
            <RevealSection index={2}>
              <Card>
                <SectionHeader titleWidth="w-32" />
                <div className="space-y-4">
                  {Array.from({ length: 2 }).map((_, d) => (
                    <div key={d}>
                      <div className="flex items-center gap-2 mb-2">
                        <Skeleton width="w-4" height="h-4" rounded="rounded" />
                        <Skeleton width="w-40" height="h-3.5" />
                      </div>
                      <div className="space-y-2 pl-6">
                        {Array.from({ length: 2 }).map((_, j) => (
                          <div
                            key={j}
                            className="bg-gray-50 dark:bg-slate-800 rounded-xl p-3 border border-gray-100 dark:border-slate-700 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <Skeleton width="w-36" height="h-3.5" />
                              <Skeleton width="w-16" height="h-3.5" />
                            </div>
                            <Skeleton width="w-24" height="h-3" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </RevealSection>
          </div>

          {/* RIGHT */}
          <div className="space-y-5">
            {/* Status Tracker */}
            <RevealSection index={1}>
              <Card>
                <SectionHeader titleWidth="w-20" />
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton width="w-7" height="h-7" rounded="rounded-full" />
                      <Skeleton width={i === 0 ? 'w-32' : i === 1 ? 'w-28' : 'w-24'} height="h-3.5" />
                    </div>
                  ))}
                </div>
              </Card>
            </RevealSection>

            {/* Crew */}
            <RevealSection index={2}>
              <Card>
                <SectionHeader titleWidth="w-16" />
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700"
                    >
                      <Skeleton width="w-9" height="h-9" rounded="rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton width="w-16" height="h-2.5" />
                        <Skeleton width="w-28" height="h-3.5" />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </RevealSection>

            {/* Billing Settings */}
            <RevealSection index={3}>
              <Card>
                <SectionHeader titleWidth="w-28" />
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Skeleton width="w-20" height="h-2.5" />
                    <Skeleton width="w-full" height="h-10" rounded="rounded-xl" />
                  </div>
                  <Skeleton width="w-full" height="h-10" rounded="rounded-xl" />
                </div>
              </Card>
            </RevealSection>

            {/* Notes Feed */}
            <RevealSection index={4}>
              <Card>
                <SectionHeader titleWidth="w-32" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="border border-gray-100 dark:border-slate-800 rounded-xl p-3 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <Skeleton width="w-6" height="h-6" rounded="rounded-full" />
                        <Skeleton width="w-24" height="h-3" />
                        <Skeleton width="w-14" height="h-4" rounded="rounded-full" className="ml-auto" />
                      </div>
                      <SkeletonText lines={2} />
                    </div>
                  ))}
                </div>
              </Card>
            </RevealSection>
          </div>
        </div>
      </div>
    </div>
  );
}
