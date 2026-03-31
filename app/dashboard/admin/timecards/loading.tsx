export default function TimecardsLoading() {
  return (
    <div className="p-6 animate-pulse space-y-4">
      <div className="h-8 bg-gray-200 rounded w-48 mb-6" />
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0" />
            <div className="flex-1 h-5 bg-gray-200 rounded" />
            <div className="w-24 h-5 bg-gray-100 rounded" />
            <div className="w-16 h-5 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0" />
            <div className="flex-1 h-5 bg-gray-200 rounded" />
            <div className="w-24 h-5 bg-gray-100 rounded" />
            <div className="w-16 h-5 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
