'use client';

export function LoadingSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse ${className}`}>
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
      <div className="h-32 bg-gray-100 rounded-xl"></div>
    </div>
  );
}

export function KPISkeleton() {
  return (
    <div className="animate-pulse flex items-center gap-3">
      <div className="w-10 h-10 bg-gray-200 rounded-xl"></div>
      <div className="flex-1">
        <div className="h-3 bg-gray-200 rounded w-20 mb-2"></div>
        <div className="h-6 bg-gray-200 rounded w-24"></div>
      </div>
    </div>
  );
}
