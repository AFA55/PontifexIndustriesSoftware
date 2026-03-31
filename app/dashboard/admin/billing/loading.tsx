export default function BillingLoading() {
  return (
    <div className="p-6 animate-pulse space-y-4">
      <div className="h-8 bg-gray-200 rounded w-40 mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="h-4 bg-gray-100 rounded w-20 mb-2" />
            <div className="h-7 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="flex-1 h-5 bg-gray-200 rounded" />
            <div className="w-32 h-5 bg-gray-100 rounded" />
            <div className="w-20 h-5 bg-gray-100 rounded" />
            <div className="w-24 h-5 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
