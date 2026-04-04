'use client';

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

export default function CompletionRateWidget({ data, timeRange, isLoading }: WidgetProps) {
  if (isLoading) return <LoadingSkeleton className="h-full" />;

  const completed = data?.completed ?? 0;
  const cancelled = data?.cancelled ?? 0;
  const total = completed + cancelled || 1;
  const rate = Math.round((completed / total) * 100);

  const chartData = [
    { name: 'Completed', value: completed, color: '#10b981' },
    { name: 'Cancelled', value: cancelled, color: '#ef4444' },
  ];

  return (
    <div className="relative h-full flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="85%"
            paddingAngle={3}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
          >
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number, name: string) => [value, name]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <p className="text-3xl font-bold text-gray-900">{rate}%</p>
          <p className="text-xs text-gray-500">Completion</p>
        </div>
      </div>
    </div>
  );
}
