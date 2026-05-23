export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-4">
      <div className="container mx-auto max-w-2xl space-y-4 py-2">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-slate-200 rounded-xl animate-pulse" />
          <div className="space-y-2">
            <div className="h-7 w-40 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-56 bg-slate-200/70 rounded animate-pulse" />
          </div>
        </div>

        {/* Category cards */}
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-white ring-1 ring-slate-200 rounded-2xl p-5 animate-pulse space-y-4"
            >
              <div className="space-y-2">
                <div className="h-4 w-44 bg-slate-200 rounded" />
                <div className="h-3 w-3/4 bg-slate-100 rounded" />
              </div>
              <div className="flex gap-5 border-t border-slate-100 pt-3">
                <div className="h-6 w-16 bg-slate-100 rounded-full" />
                <div className="h-6 w-16 bg-slate-100 rounded-full" />
                <div className="h-6 w-16 bg-slate-100 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
