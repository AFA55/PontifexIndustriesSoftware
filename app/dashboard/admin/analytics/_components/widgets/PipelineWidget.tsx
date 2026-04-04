'use client';

import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

const STAGES = [
  { key: 'pending', label: 'Pending', color: '#8b5cf6', bg: 'bg-purple-500' },
  { key: 'scheduled', label: 'Scheduled', color: '#3b82f6', bg: 'bg-blue-500' },
  { key: 'in_progress', label: 'In Progress', color: '#f59e0b', bg: 'bg-amber-500' },
  { key: 'completed', label: 'Completed', color: '#10b981', bg: 'bg-emerald-500' },
];

export default function PipelineWidget({ data, timeRange, isLoading }: WidgetProps) {
  if (isLoading) return <LoadingSkeleton className="h-full" />;

  const counts: Record<string, number> = data?.pipeline ?? {};
  const total = STAGES.reduce((sum, s) => sum + (counts[s.key] ?? 0), 0) || 1;

  return (
    <div className="flex flex-col h-full justify-center gap-4">
      {/* Stacked bar */}
      <div className="w-full h-10 bg-gray-100 rounded-xl overflow-hidden flex">
        {STAGES.map((stage) => {
          const count = counts[stage.key] ?? 0;
          const pct = (count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={stage.key}
              className={`${stage.bg} flex items-center justify-center transition-all`}
              style={{ width: `${pct}%` }}
            >
              {pct > 12 && (
                <span className="text-white text-xs font-bold">{count}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {STAGES.map((stage) => {
          const count = counts[stage.key] ?? 0;
          return (
            <div key={stage.key} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: stage.color }} />
              <span className="text-xs text-gray-600">{stage.label}</span>
              <span className="text-xs font-bold text-gray-900 ml-auto">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
