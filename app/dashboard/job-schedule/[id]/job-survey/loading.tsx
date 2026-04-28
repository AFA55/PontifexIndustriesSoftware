export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="h-8 w-44 bg-slate-200 rounded animate-pulse" />
        <div className="h-4 w-64 bg-slate-200/70 rounded animate-pulse" />
        <div className="space-y-3 pt-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-white ring-1 ring-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
