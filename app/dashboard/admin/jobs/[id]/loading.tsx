export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Back + title */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-24 bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-9 w-72 bg-slate-200 rounded animate-pulse" />
        </div>
        {/* Gradient hero */}
        <div className="h-40 bg-gradient-to-r from-violet-100 via-white to-violet-50 ring-1 ring-violet-200 rounded-2xl animate-pulse" />
        {/* 5 metric tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-white ring-1 ring-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
        {/* Tabs */}
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 w-32 bg-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
        {/* Tab content */}
        <div className="bg-white ring-1 ring-slate-200 rounded-2xl p-6 space-y-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
