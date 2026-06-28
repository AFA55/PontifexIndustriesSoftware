export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-52 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-72 bg-slate-200/70 rounded animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-28 bg-white ring-1 ring-slate-200 rounded-lg animate-pulse" />
            <div className="h-10 w-32 bg-brand/20 rounded-lg animate-pulse" />
          </div>
        </div>
        {/* Tab bar */}
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 w-28 bg-white ring-1 ring-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
        {/* Search + filter */}
        <div className="flex gap-3">
          <div className="flex-1 h-10 bg-white ring-1 ring-slate-200 rounded-lg animate-pulse" />
          <div className="h-10 w-24 bg-white ring-1 ring-slate-200 rounded-lg animate-pulse" />
        </div>
        {/* Checkout/item rows */}
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white ring-1 ring-slate-200 rounded-2xl p-5 flex items-center gap-4 animate-pulse">
              <div className="h-10 w-10 bg-brand/10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-2/5 bg-slate-200 rounded" />
                <div className="flex gap-4">
                  <div className="h-4 w-28 bg-slate-200/70 rounded" />
                  <div className="h-4 w-24 bg-slate-200/70 rounded" />
                </div>
              </div>
              <div className="h-6 w-20 bg-slate-100 rounded-full" />
              <div className="h-9 w-24 bg-slate-100 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
