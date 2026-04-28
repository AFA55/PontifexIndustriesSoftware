export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="h-8 w-36 bg-slate-200 rounded animate-pulse" />
        {/* Avatar + name */}
        <div className="bg-white ring-1 ring-slate-200 rounded-2xl p-6 animate-pulse flex items-center gap-4">
          <div className="w-16 h-16 bg-slate-200 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-32 bg-slate-200 rounded" />
            <div className="h-4 w-24 bg-slate-100 rounded" />
          </div>
        </div>
        {/* Sections */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 bg-white ring-1 ring-slate-200 rounded-2xl animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
