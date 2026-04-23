'use client';

/**
 * Shared skeleton for the Active Jobs list page.
 * Shape matches the live layout: header, stat grid, filter row, job cards.
 */
export default function ActiveJobsSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b0714] via-[#110a24] to-[#0b0714] p-6">
      <div className="max-w-7xl mx-auto animate-pulse">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <div className="h-7 w-48 rounded-lg bg-white/10" />
            <div className="h-4 w-32 rounded bg-white/5" />
          </div>
          <div className="flex gap-3">
            <div className="h-9 w-32 rounded-lg bg-white/10" />
            <div className="h-9 w-9 rounded-lg bg-white/10" />
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-2xl border border-white/10 bg-white/5"
            />
          ))}
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 w-24 rounded-lg bg-white/10" />
          ))}
        </div>

        {/* Cards */}
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-2xl border border-white/10 bg-white/5"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
