'use client';

import { DollarSign, Briefcase, CheckCircle, Users, TrendingUp, TrendingDown } from 'lucide-react';
import { KPISkeleton } from './widgets/LoadingSkeleton';

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

const CARDS = [
  {
    key: 'total_revenue' as const,
    label: 'Total Revenue',
    icon: DollarSign,
    gradient: 'from-purple-500 to-purple-700',
    format: (v: number) => formatCurrency(v),
    trendKey: 'revenue_trend' as const,
  },
  {
    key: 'active_jobs' as const,
    label: 'Active Jobs',
    icon: Briefcase,
    gradient: 'from-blue-500 to-blue-700',
    format: (v: number) => String(v),
    trendKey: 'jobs_trend' as const,
  },
  {
    key: 'completion_rate' as const,
    label: 'Completion Rate',
    icon: CheckCircle,
    gradient: 'from-emerald-500 to-emerald-700',
    format: (v: number) => `${v}%`,
    trendKey: 'completion_trend' as const,
  },
  {
    key: 'active_crews' as const,
    label: 'Active Crews',
    icon: Users,
    gradient: 'from-amber-500 to-amber-700',
    format: (v: number) => String(v),
    trendKey: 'crews_trend' as const,
  },
];

export default function KPIRow({ data, isLoading }: KPIRowProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {CARDS.map((card) => {
        if (isLoading) {
          return (
            <div key={card.key} className={`bg-gradient-to-br ${card.gradient} rounded-2xl p-5 text-white shadow-lg`}>
              <KPISkeleton />
            </div>
          );
        }

        const value = data?.[card.key] ?? 0;
        const trend = data?.[card.trendKey] ?? 0;
        const isUp = trend >= 0;

        return (
          <div key={card.key} className={`bg-gradient-to-br ${card.gradient} rounded-2xl p-5 text-white shadow-lg`}>
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <card.icon className="w-5 h-5" />
              </div>
              {trend !== 0 && (
                <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${isUp ? 'bg-white/20' : 'bg-red-400/30'}`}>
                  {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(trend)}%
                </div>
              )}
            </div>
            <p className="text-2xl font-bold mt-3">{card.format(value)}</p>
            <p className="text-xs text-white/80 mt-1">{card.label}</p>
          </div>
        );
      })}
    </div>
  );
}
