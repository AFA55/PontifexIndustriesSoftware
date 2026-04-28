export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="h-7 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-4 w-64 bg-slate-200/70 rounded animate-pulse" />
        {/* Service code chips */}
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-20 bg-violet-100 rounded-full animate-pulse" />
          ))}
        </div>
        {/* Work entry cards */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white ring-1 ring-slate-200 rounded-2xl p-4 animate-pulse space-y-3"
            >
              <div className="h-5 w-32 bg-slate-200 rounded" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-12 bg-slate-100 rounded-lg" />
                <div className="h-12 bg-slate-100 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-12 w-full bg-violet-200 rounded-lg animate-pulse" />
      </div>
    </div>
  );
}
