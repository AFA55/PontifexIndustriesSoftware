export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back link */}
        <div className="h-5 w-32 bg-slate-200 rounded animate-pulse" />
        {/* Header card */}
        <div className="bg-white ring-1 ring-slate-200 rounded-2xl p-6 space-y-4 animate-pulse">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-7 w-56 bg-slate-200 rounded" />
              <div className="h-4 w-40 bg-slate-200/70 rounded" />
            </div>
            <div className="h-8 w-24 bg-slate-100 rounded-full" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-slate-50 rounded-xl ring-1 ring-slate-100" />
            ))}
          </div>
        </div>
        {/* Detail sections */}
        <div className="bg-white ring-1 ring-slate-200 rounded-2xl p-6 space-y-3 animate-pulse">
          <div className="h-5 w-40 bg-slate-200 rounded" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-1/4 bg-slate-200/70 rounded" />
              <div className="h-4 w-1/3 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
        {/* Checkout history */}
        <div className="bg-white ring-1 ring-slate-200 rounded-2xl p-6 space-y-3 animate-pulse">
          <div className="h-5 w-44 bg-slate-200 rounded" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-slate-50 rounded-xl ring-1 ring-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
