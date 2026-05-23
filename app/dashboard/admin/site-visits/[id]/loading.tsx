export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="h-5 w-28 bg-slate-200 rounded animate-pulse" />
        {/* Header */}
        <div className="bg-white ring-1 ring-slate-200 rounded-2xl p-6 space-y-4 animate-pulse">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-7 w-52 bg-slate-200 rounded" />
              <div className="h-4 w-36 bg-slate-200/70 rounded" />
            </div>
            <div className="flex gap-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 w-14 bg-slate-100 rounded-lg" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-50 rounded-xl ring-1 ring-slate-100" />
            ))}
          </div>
        </div>
        {/* Observations */}
        <div className="bg-white ring-1 ring-slate-200 rounded-2xl p-6 space-y-3 animate-pulse">
          <div className="h-5 w-32 bg-slate-200 rounded" />
          <div className="h-24 bg-slate-50 rounded-xl" />
        </div>
        {/* Issues */}
        <div className="bg-white ring-1 ring-slate-200 rounded-2xl p-6 space-y-3 animate-pulse">
          <div className="h-5 w-36 bg-slate-200 rounded" />
          <div className="h-16 bg-slate-50 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
