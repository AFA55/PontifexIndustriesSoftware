export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="h-8 w-44 bg-slate-200 rounded animate-pulse" />
        <div className="h-4 w-64 bg-slate-200/70 rounded animate-pulse" />
        <div className="space-y-3 pt-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white ring-1 ring-slate-200 rounded-2xl p-4 animate-pulse space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="h-5 w-32 bg-slate-200 rounded" />
                <div className="h-6 w-16 bg-violet-100 rounded-full" />
              </div>
              <div className="h-4 w-full bg-slate-100 rounded" />
              <div className="h-4 w-2/3 bg-slate-100 rounded" />
              <div className="h-10 w-full bg-slate-200 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
