export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        {/* Tabs */}
        <div className="flex gap-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 w-40 bg-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
        {/* Metric tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-white ring-1 ring-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
        {/* Request rows */}
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 bg-white ring-1 ring-slate-200 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
