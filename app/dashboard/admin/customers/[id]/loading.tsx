export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 dark:from-[#0b0618] dark:via-[#0b0618] dark:to-[#0e0720] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-10 w-64 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white dark:bg-white/5 ring-1 ring-slate-200 dark:ring-white/10 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white dark:bg-white/5 ring-1 ring-slate-200 dark:ring-white/10 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
