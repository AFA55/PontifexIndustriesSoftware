export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand/5 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="h-5 w-28 bg-slate-200 rounded animate-pulse" />
        <div className="h-8 w-52 bg-slate-200 rounded animate-pulse" />
        <div className="bg-white ring-1 ring-slate-200 rounded-2xl p-6 space-y-5 animate-pulse">
          {/* Operator picker */}
          <div className="space-y-1">
            <div className="h-4 w-24 bg-slate-200/70 rounded" />
            <div className="h-10 bg-slate-100 rounded-lg" />
          </div>
          {/* Job picker */}
          <div className="space-y-1">
            <div className="h-4 w-20 bg-slate-200/70 rounded" />
            <div className="h-10 bg-slate-100 rounded-lg" />
          </div>
          {/* Ratings */}
          <div className="space-y-1">
            <div className="h-4 w-28 bg-slate-200/70 rounded" />
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-9 w-9 bg-slate-100 rounded-lg" />
              ))}
            </div>
          </div>
          {/* Textarea */}
          <div className="space-y-1">
            <div className="h-4 w-32 bg-slate-200/70 rounded" />
            <div className="h-24 bg-slate-100 rounded-lg" />
          </div>
          <div className="flex gap-3 pt-2">
            <div className="h-10 flex-1 bg-slate-100 rounded-lg" />
            <div className="h-10 w-32 bg-brand/20 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
