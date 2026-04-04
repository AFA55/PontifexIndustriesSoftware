export default function AdminDashboardLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* KPI skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse">
            <div className="w-10 h-10 bg-gray-200 rounded-full mb-4" />
            <div className="h-8 bg-gray-200 rounded w-16 mb-2" />
            <div className="h-4 bg-gray-100 rounded w-24" />
          </div>
        ))}
      </div>
      {/* Two-col skeleton */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse h-64" />
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse h-32" />
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse h-32" />
        </div>
      </div>
    </div>
  );
}
