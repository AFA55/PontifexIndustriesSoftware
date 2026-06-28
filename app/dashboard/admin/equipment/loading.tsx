export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand/5 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-64 bg-slate-200/70 rounded animate-pulse" />
          </div>
          <div className="h-10 w-36 bg-slate-200 rounded-lg animate-pulse" />
        </div>
        {/* Search + filter bar */}
        <div className="flex gap-3">
          <div className="flex-1 h-10 bg-white ring-1 ring-slate-200 rounded-lg animate-pulse" />
          <div className="h-10 w-28 bg-white ring-1 ring-slate-200 rounded-lg animate-pulse" />
        </div>
        {/* Equipment cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white ring-1 ring-slate-200 rounded-2xl p-5 space-y-3 animate-pulse">
              <div className="flex items-start justify-between">
                <div className="h-5 w-2/3 bg-slate-200 rounded" />
                <div className="h-6 w-16 bg-slate-100 rounded-full" />
              </div>
              <div className="h-4 w-1/2 bg-slate-200/70 rounded" />
              <div className="h-4 w-1/3 bg-slate-200/70 rounded" />
              <div className="flex gap-2 pt-1">
                <div className="h-6 w-20 bg-slate-100 rounded-full" />
                <div className="h-6 w-20 bg-slate-100 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
