'use client';

import Link from 'next/link';
import { ArrowLeft, Pencil, RefreshCw, Plus, Check } from 'lucide-react';
import TimeRangeSelector from './TimeRangeSelector';
import { TimeRange } from './types';

interface DashboardHeaderProps {
  timeRange: TimeRange;
  onTimeRangeChange: (value: TimeRange) => void;
  editMode: boolean;
  onToggleEdit: () => void;
  onRefresh: () => void;
  onAddWidget?: () => void;
}

export default function DashboardHeader({
  timeRange,
  onTimeRangeChange,
  editMode,
  onToggleEdit,
  onRefresh,
  onAddWidget,
}: DashboardHeaderProps) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="sticky top-0 z-40 backdrop-blur-xl bg-white/90 border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4 py-3 max-w-7xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/admin" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Analytics Dashboard</h1>
              <p className="text-xs text-gray-500">{today}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <TimeRangeSelector value={timeRange} onChange={onTimeRangeChange} />

            <button
              onClick={onToggleEdit}
              className={`p-2 rounded-lg transition-colors ${
                editMode
                  ? 'bg-purple-100 text-purple-700'
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
              title={editMode ? 'Done editing' : 'Edit layout'}
            >
              {editMode ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>

            <button
              onClick={onRefresh}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
              title="Refresh data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {editMode && onAddWidget && (
              <button
                onClick={onAddWidget}
                className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                title="Add widget"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
