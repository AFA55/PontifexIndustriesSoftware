export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-8 w-56 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sidebar list */}
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-16 bg-white ring-1 ring-slate-200 rounded-xl animate-pulse"
              />
            ))}
          </div>
          {/* Detail panel */}
          <div className="lg:col-span-2 space-y-4">
            <div className="h-32 bg-white ring-1 ring-slate-200 rounded-2xl animate-pulse" />
            <div className="h-10 w-72 bg-slate-200 rounded-lg animate-pulse" />
            <div className="h-64 bg-white ring-1 ring-slate-200 rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
