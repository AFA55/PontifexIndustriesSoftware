export default function CustomersLoading() {
  return (
    <div className="p-6 animate-pulse space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 bg-gray-200 rounded w-36" />
        <div className="h-10 bg-gray-200 rounded w-32" />
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2">
            <div className="w-10 h-10 bg-gray-200 rounded-full flex-shrink-0" />
            <div className="flex-1">
              <div className="h-5 bg-gray-200 rounded w-40 mb-1" />
              <div className="h-4 bg-gray-100 rounded w-56" />
            </div>
            <div className="w-20 h-5 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
