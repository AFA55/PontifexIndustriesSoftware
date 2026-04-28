export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="h-8 w-40 bg-slate-200 rounded animate-pulse" />
        {/* Big clock-in card */}
        <div className="h-48 bg-white ring-1 ring-slate-200 rounded-2xl animate-pulse" />
        {/* Mon-Sun row */}
        <div className="grid grid-cols-7 gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-16 bg-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
        {/* Hours summary */}
        <div className="h-24 bg-white ring-1 ring-slate-200 rounded-2xl animate-pulse" />
        {/* Segments */}
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-white ring-1 ring-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
