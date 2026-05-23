export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-44 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-60 bg-slate-200/70 rounded animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-slate-200 rounded-lg animate-pulse" />
        </div>
        {/* Search bar */}
        <div className="h-10 bg-white ring-1 ring-slate-200 rounded-lg animate-pulse" />
        {/* Visit rows */}
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white ring-1 ring-slate-200 rounded-2xl p-5 flex items-center gap-4 animate-pulse">
              <div className="h-10 w-10 bg-violet-100 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-2/5 bg-slate-200 rounded" />
                <div className="flex gap-4">
                  <div className="h-4 w-24 bg-slate-200/70 rounded" />
                  <div className="h-4 w-28 bg-slate-200/70 rounded" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-6 w-12 bg-amber-100 rounded-full" />
                <div className="h-6 w-12 bg-emerald-100 rounded-full" />
              </div>
              <div className="h-8 w-8 bg-slate-100 rounded-lg shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
