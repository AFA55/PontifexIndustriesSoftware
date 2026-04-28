export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-10 w-64 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white ring-1 ring-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white ring-1 ring-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
