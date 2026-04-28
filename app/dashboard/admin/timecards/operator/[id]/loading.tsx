export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Back button + title */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-24 bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
        </div>
        {/* Operator header */}
        <div className="h-32 bg-white ring-1 ring-slate-200 rounded-2xl animate-pulse" />
        {/* Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white ring-1 ring-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
        {/* Mon-Sun row */}
        <div className="grid grid-cols-7 gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-24 bg-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        {/* Segments */}
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-white ring-1 ring-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
