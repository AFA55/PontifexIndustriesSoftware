export default function ScheduleBoardLoading() {
  return (
    <div className="p-6 animate-pulse space-y-4">
      {/* Header / filters skeleton */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="flex gap-2">
          <div className="h-10 bg-gray-200 rounded w-28" />
          <div className="h-10 bg-gray-200 rounded w-28" />
        </div>
      </div>
      {/* Day column headers */}
      <div className="grid grid-cols-7 gap-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-200 rounded" />
        ))}
      </div>
      {/* Job rows */}
      {[...Array(4)].map((_, row) => (
        <div key={row} className="grid grid-cols-7 gap-2">
          {[...Array(7)].map((_, col) => (
            <div
              key={col}
              className={`h-16 rounded ${col === 0 || col === 5 || col === 6 ? 'bg-gray-100' : 'bg-gray-200'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
