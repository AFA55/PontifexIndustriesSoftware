'use client';

interface KPIData {
  total_revenue: number;
  active_jobs: number;
  completion_rate: number;
  active_crews: number;
  revenue_trend?: number;
  jobs_trend?: number;
  completion_trend?: number;
  crews_trend?: number;
}

interface KPIRowProps {
  data: KPIData | null;
  isLoading: boolean;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

const CELLS = [
  {
    key: 'total_revenue' as const,
    label: 'Revenue',
    dotColor: 'bg-purple-500',
    format: (v: number) => formatCurrency(v),
    trendKey: 'revenue_trend' as const,
  },
  {
    key: 'active_jobs' as const,
    label: 'Active Jobs',
    dotColor: 'bg-blue-500',
    format: (v: number) => String(v),
    trendKey: 'jobs_trend' as const,
  },
  {
    key: 'completion_rate' as const,
    label: 'Completion',
    dotColor: 'bg-green-500',
    format: (v: number) => `${v}%`,
    trendKey: 'completion_trend' as const,
  },
  {
    key: 'active_crews' as const,
    label: 'Crews',
    dotColor: 'bg-orange-500',
    format: (v: number) => String(v),
    trendKey: 'crews_trend' as const,
  },
];

export default function KPIRow({ data, isLoading }: KPIRowProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex divide-x divide-gray-100 dark:bg-white/5 dark:border-white/10 dark:divide-white/5">
        {CELLS.map((cell) => (
          <div key={cell.key} className="flex-1 px-4 py-3">
            <div className="h-2.5 w-16 bg-gray-200 dark:bg-white/10 rounded animate-pulse mb-2" />
            <div className="h-6 w-12 bg-gray-200 dark:bg-white/10 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex divide-x divide-gray-100 dark:bg-white/5 dark:border-white/10 dark:divide-white/5">
      {CELLS.map((cell) => {
        const value = data?.[cell.key] ?? 0;
        const trend = data?.[cell.trendKey] ?? 0;
        const isUp = trend >= 0;

        return (
          <div key={cell.key} className="flex-1 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`w-2 h-2 rounded-full ${cell.dotColor}`} />
              <span className="text-[11px] text-gray-500 dark:text-white/40 font-medium uppercase tracking-wider">
                {cell.label}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                {cell.format(value)}
              </span>
              {trend !== 0 && (
                <span
                  className={`text-[10px] font-semibold ${
                    isUp ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                  }`}
                >
                  {isUp ? '▲' : '▼'} {Math.abs(trend)}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
