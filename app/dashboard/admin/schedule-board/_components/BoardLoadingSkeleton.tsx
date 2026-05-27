export default function BoardLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 dark:from-[#0b0618] dark:via-[#0b0618] dark:to-[#0e0720]">
      {/* Skeleton header */}
      <div className="backdrop-blur-xl bg-white/90 dark:bg-[#0e0720]/95 border-b border-gray-200 dark:border-white/10 sticky top-0 z-30 shadow-lg">
        <div className="container mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
              <div className="h-6 w-36 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
            <div className="flex gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-9 w-9 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
              ))}
              <div className="h-9 w-28 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
      {/* Date nav */}
      <div className="container mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
        <div className="h-9 w-9 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        <div className="h-9 w-9 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
      </div>
      {/* Operator rows skeleton */}
      <div className="container mx-auto px-4 md:px-6 space-y-3 pt-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
            {/* Operator header */}
            <div className="flex items-center gap-3 p-3 border-b border-gray-100 dark:border-white/5">
              <div className="h-9 w-9 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="h-7 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            </div>
            {/* Job slots */}
            <div className="p-3 flex gap-2 flex-wrap">
              {[...Array(i % 2 === 0 ? 2 : 1)].map((_, j) => (
                <div key={j} className="h-16 w-44 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
