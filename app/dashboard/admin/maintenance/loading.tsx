export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
          <div className="h-10 w-36 bg-slate-200 rounded-lg animate-pulse" />
        </div>
        {/* Tab bar */}
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 w-28 bg-white ring-1 ring-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
        {/* Request cards */}
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white ring-1 ring-slate-200 rounded-2xl p-5 animate-pulse">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 bg-slate-200 rounded-full" />
                    <div className="h-5 w-2/5 bg-slate-200 rounded" />
                    <div className="h-5 w-16 bg-rose-100 rounded-full" />
                  </div>
                  <div className="h-4 w-3/4 bg-slate-200/70 rounded" />
                  <div className="h-3 w-1/3 bg-slate-200/50 rounded" />
                </div>
                <div className="h-8 w-8 bg-slate-100 rounded-lg ml-4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
