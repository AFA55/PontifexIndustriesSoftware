export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-56 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-72 bg-slate-200/70 rounded animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-slate-200 rounded-lg animate-pulse" />
        </div>
        {/* Metric tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white ring-1 ring-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
        {/* Job cards */}
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-white ring-1 ring-slate-200 rounded-2xl p-5 flex items-center gap-4 animate-pulse"
            >
              <div className="w-1 h-16 bg-violet-200 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-1/3 bg-slate-200 rounded" />
                <div className="h-4 w-1/2 bg-slate-200/70 rounded" />
              </div>
              <div className="h-10 w-24 bg-slate-200 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
