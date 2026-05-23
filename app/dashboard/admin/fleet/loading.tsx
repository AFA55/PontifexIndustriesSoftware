export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-40 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-60 bg-slate-200/70 rounded animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-slate-200 rounded-lg animate-pulse" />
        </div>
        {/* Alert banner placeholder */}
        <div className="h-12 bg-amber-50 ring-1 ring-amber-200 rounded-xl animate-pulse" />
        {/* Fleet cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white ring-1 ring-slate-200 rounded-2xl p-5 space-y-3 animate-pulse">
              <div className="flex items-start justify-between">
                <div className="h-6 w-1/2 bg-slate-200 rounded" />
                <div className="h-6 w-20 bg-slate-100 rounded-full" />
              </div>
              <div className="h-4 w-2/3 bg-slate-200/70 rounded" />
              <div className="h-4 w-1/2 bg-slate-200/70 rounded" />
              <div className="flex justify-between pt-1">
                <div className="h-5 w-24 bg-slate-100 rounded" />
                <div className="h-5 w-24 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
