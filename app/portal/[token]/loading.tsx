export default function PortalLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-white">
      {/* Header skeleton */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-900/60 to-slate-900 border-b border-white/10">
        <div className="container mx-auto px-4 py-6 max-w-lg">
          <div className="flex items-center gap-3 mb-5 animate-pulse">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex-shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-4 bg-white/10 rounded w-36" />
              <div className="h-3 bg-white/10 rounded w-24" />
            </div>
          </div>
          <div className="space-y-2 animate-pulse">
            <div className="h-4 bg-white/10 rounded w-56" />
            <div className="h-3 bg-white/10 rounded w-40" />
          </div>
        </div>
      </div>

      {/* Body skeleton */}
      <div className="container mx-auto px-4 py-6 max-w-lg space-y-5 animate-pulse">
        {/* Action card skeleton */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 space-y-4">
          <div className="h-6 bg-amber-400/20 rounded-full w-36" />
          <div className="h-4 bg-amber-400/15 rounded w-52" />
          <div className="h-3 bg-amber-400/10 rounded w-40" />
          <div className="bg-black/20 rounded-xl p-4 space-y-2">
            <div className="h-3 bg-white/10 rounded w-24" />
            <div className="h-3 bg-white/10 rounded w-48" />
            <div className="h-3 bg-white/10 rounded w-36" />
          </div>
          <div className="h-12 bg-amber-500/20 rounded-xl" />
        </div>

        {/* Section title */}
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-white/10 rounded" />
          <div className="h-4 bg-white/10 rounded w-28" />
        </div>

        {/* Job cards skeleton */}
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-white/10 rounded w-36" />
                <div className="h-3 bg-white/10 rounded w-20" />
              </div>
              <div className="h-6 bg-white/10 rounded-full w-20" />
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-white/10 rounded w-40" />
              <div className="h-3 bg-white/10 rounded w-52" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
