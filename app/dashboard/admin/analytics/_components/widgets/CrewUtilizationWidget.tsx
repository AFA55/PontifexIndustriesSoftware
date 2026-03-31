'use client';

import { Users } from 'lucide-react';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

export default function CrewUtilizationWidget({ data, isLoading }: WidgetProps) {
  if (isLoading) return <LoadingSkeleton className="h-full" />;

  const totalOperators: number = data?.total_operators ?? 0;
  const availableHours: number = data?.available_hours ?? 0;
  const scheduledHours: number = data?.scheduled_hours ?? 0;
  const utilizationPct: number = data?.utilization_pct ?? 0;

  const hasData = totalOperators > 0 || availableHours > 0 || scheduledHours > 0;

  const pctColor = utilizationPct >= 80 ? 'text-green-500' : utilizationPct >= 50 ? 'text-amber-500' : 'text-red-500';
  const strokeColor = utilizationPct >= 80 ? '#10b981' : utilizationPct >= 50 ? '#f59e0b' : '#ef4444';

  // SVG circular progress
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(utilizationPct, 100) / 100) * circumference;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-300">
        <Users className="w-8 h-8 mb-2" />
        <span className="text-xs">No crew data</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full items-center justify-center gap-4">
      {/* Circular progress ring */}
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
          {/* Background circle */}
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          {/* Progress circle */}
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${pctColor}`}>{Math.round(utilizationPct)}%</span>
          <span className="text-[10px] text-gray-400">Utilization</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 w-full">
        <div className="text-center">
          <p className="text-lg font-bold text-gray-800">{totalOperators}</p>
          <p className="text-[10px] text-gray-400">Operators</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-gray-400">{availableHours}</p>
          <p className="text-[10px] text-gray-400">Available Hrs</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-blue-500">{scheduledHours}</p>
          <p className="text-[10px] text-gray-400">Scheduled Hrs</p>
        </div>
      </div>
    </div>
  );
}
