'use client';

import Link from 'next/link';
import { ArrowLeft, Pencil, RefreshCw, Settings, Check } from 'lucide-react';
import TimeRangeSelector from './TimeRangeSelector';
import { TimeRange } from './types';

interface DashboardHeaderProps {
  timeRange: TimeRange;
  onTimeRangeChange: (value: TimeRange) => void;
  editMode: boolean;
  onToggleEdit: () => void;
  onRefresh: () => void;
  onOpenSettings?: () => void;
}

export default function DashboardHeader({
  timeRange,
  onTimeRangeChange,
  editMode,
  onToggleEdit,
  onRefresh,
  onOpenSettings,
}: DashboardHeaderProps) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 border-b border-blue-800 sticky top-0 z-10 shadow-2xl">
      <div className="container mx-auto px-4 py-3 max-w-7xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/admin"
              className="p-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/20 transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Analytics Dashboard</h1>
              <p className="text-xs text-blue-200">{today}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <TimeRangeSelector value={timeRange} onChange={onTimeRangeChange} />

            <button
              onClick={onToggleEdit}
              className={`p-2 rounded-xl border transition-all ${
                editMode
                  ? 'bg-white/20 text-white border-white/30'
                  : 'bg-white/10 text-blue-200 border-white/20 hover:bg-white/20 hover:text-white'
              }`}
              title={editMode ? 'Done editing' : 'Edit layout'}
            >
              {editMode ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>

            <button
              onClick={onRefresh}
              className="p-2 bg-white/10 border border-white/20 rounded-xl text-blue-200 hover:bg-white/20 hover:text-white transition-all"
              title="Refresh data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="p-2 bg-white/10 border border-white/20 rounded-xl text-blue-200 hover:bg-white/20 hover:text-white transition-all"
                title="Dashboard settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
