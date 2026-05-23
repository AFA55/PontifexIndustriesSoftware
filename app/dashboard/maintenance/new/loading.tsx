export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5 animate-pulse">
        {/* Step indicator */}
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`h-2 rounded-full ${i === 1 ? 'w-8 bg-violet-400' : 'w-4 bg-slate-700'}`} />
          ))}
        </div>
        {/* Card */}
        <div className="bg-slate-800/80 ring-1 ring-slate-700 rounded-2xl p-6 space-y-5">
          <div className="h-7 w-48 bg-slate-700 rounded mx-auto" />
          <div className="h-4 w-64 bg-slate-700/50 rounded mx-auto" />
          {/* Fields */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1">
              <div className="h-4 w-28 bg-slate-700/70 rounded" />
              <div className="h-12 bg-slate-700/50 rounded-lg" />
            </div>
          ))}
          <div className="h-11 bg-violet-800/60 rounded-lg mt-2" />
        </div>
      </div>
    </div>
  );
}
