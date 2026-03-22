'use client';

import { Trophy } from 'lucide-react';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

const RANK_COLORS = ['text-yellow-500', 'text-gray-400', 'text-amber-600'];
const RANK_BG = ['bg-yellow-50', 'bg-gray-50', 'bg-amber-50'];

export default function TopOperatorsWidget({ data, timeRange, isLoading }: WidgetProps) {
  if (isLoading) return <LoadingSkeleton className="h-full" />;

  const operators: {
    name: string;
    jobs_completed: number;
    revenue: number;
  }[] = data?.operators ?? [];

  const maxRevenue = Math.max(...operators.map((o) => o.revenue), 1);

  return (
    <div className="flex flex-col h-full overflow-auto">
      {operators.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <Trophy className="w-10 h-10 mb-2" />
          <p className="text-sm">No operator data yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {operators.slice(0, 10).map((op, i) => (
            <div key={op.name} className={`flex items-center gap-3 p-2 rounded-lg ${i < 3 ? RANK_BG[i] : 'hover:bg-gray-50'}`}>
              <span className={`w-6 text-center font-bold text-sm ${i < 3 ? RANK_COLORS[i] : 'text-gray-400'}`}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 truncate">{op.name}</span>
                  <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                    {op.jobs_completed} jobs
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500"
                      style={{ width: `${(op.revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
                    {formatCurrency(op.revenue)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
