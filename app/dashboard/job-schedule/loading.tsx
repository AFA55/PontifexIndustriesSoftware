export default function JobScheduleLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mx-auto mb-4" />
        <p className="text-gray-600 font-semibold">Loading job schedule...</p>
      </div>
    </div>
  )
}
