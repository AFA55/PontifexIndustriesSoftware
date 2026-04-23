'use client';

/**
 * Shared skeleton for the Job Detail page.
 * Shape matches the live layout: back link, hero, metric grid, two-column body.
 */
export default function JobDetailSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b0714] via-[#110a24] to-[#0b0714] p-6">
      <div className="max-w-7xl mx-auto animate-pulse space-y-6">
        <div className="h-4 w-40 rounded bg-white/10" />

        {/* Hero */}
        <div className="h-40 rounded-2xl border border-white/10 bg-white/5" />

        {/* Metric tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl border border-white/10 bg-white/5" />
          ))}
        </div>

        {/* Two-column body */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-64 rounded-2xl border border-white/10 bg-white/5" />
            <div className="h-48 rounded-2xl border border-white/10 bg-white/5" />
          </div>
          <div className="space-y-6">
            <div className="h-80 rounded-2xl border border-white/10 bg-white/5" />
            <div className="h-48 rounded-2xl border border-white/10 bg-white/5" />
          </div>
        </div>
      </div>
    </div>
  );
}
