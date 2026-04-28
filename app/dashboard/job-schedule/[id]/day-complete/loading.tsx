export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="h-7 w-44 bg-slate-200 rounded animate-pulse" />
        <div className="h-4 w-56 bg-slate-200/70 rounded animate-pulse" />
        {/* Summary card */}
        <div className="h-32 bg-white ring-1 ring-slate-200 rounded-2xl animate-pulse" />
        {/* Two action buttons */}
        <div className="space-y-3">
          <div className="h-20 bg-emerald-100 rounded-2xl animate-pulse" />
          <div className="h-20 bg-amber-100 rounded-2xl animate-pulse" />
        </div>
        {/* Notes */}
        <div className="h-32 bg-white ring-1 ring-slate-200 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}
