'use client';

import { LayoutGrid, CalendarDays, UserCheck, Package, Search, Settings, Loader2 } from 'lucide-react';
import ScheduleDatePicker from './ScheduleDatePicker';
import ViewToggle from './ViewToggle';

interface ScheduleBoardStatsBarProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  viewMode: 'day' | 'week';
  onViewModeChange: (mode: 'day' | 'week') => void;
  boardViewMode: 'slots' | 'operators' | 'crew-grid';
  onBoardViewModeChange: (mode: 'slots' | 'operators' | 'crew-grid') => void;
  activeOperators: number;
  totalJobs: number;
  capacityMaxSlots: number;
  capacityWarningThreshold: number;
  canEdit: boolean;
  findingNextAvailable: boolean;
  onFindNextAvailable: () => void;
  onOpenCapacitySettings: () => void;
}

export default function ScheduleBoardStatsBar({
  selectedDate,
  onDateChange,
  viewMode,
  onViewModeChange,
  boardViewMode,
  onBoardViewModeChange,
  activeOperators,
  totalJobs,
  capacityMaxSlots,
  capacityWarningThreshold,
  canEdit,
  findingNextAvailable,
  onFindNextAvailable,
  onOpenCapacitySettings,
}: ScheduleBoardStatsBarProps) {
  const isFull = totalJobs >= capacityMaxSlots;
  const isNearCap = totalJobs >= capacityWarningThreshold;

  return (
    <div className="container mx-auto px-4 md:px-6 py-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 p-4 md:p-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <ScheduleDatePicker value={selectedDate} onChange={onDateChange} />

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl">
              <button
                onClick={() => onViewModeChange('day')}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                  viewMode === 'day'
                    ? 'bg-gradient-to-r from-brand to-brand-accent text-white shadow-lg'
                    : 'text-gray-500 dark:text-white/60 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-200 dark:hover:bg-white/15'
                }`}
              >
                <LayoutGrid className="w-4 h-4" /> Day
              </button>
              <button
                onClick={() => onViewModeChange('week')}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                  viewMode === 'week'
                    ? 'bg-gradient-to-r from-brand to-brand-accent text-white shadow-lg'
                    : 'text-gray-500 dark:text-white/60 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-200 dark:hover:bg-white/15'
                }`}
              >
                <CalendarDays className="w-4 h-4" /> Week
              </button>
            </div>
            <ViewToggle viewMode={boardViewMode} onChange={onBoardViewModeChange} />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 bg-brand/5 dark:bg-brand/15 rounded-xl border border-brand/30 dark:border-brand/30">
              <UserCheck className="w-4 h-4 text-brand dark:text-brand" />
              <div>
                <div className="text-[10px] font-bold text-brand dark:text-brand uppercase">Active</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">{activeOperators}</div>
              </div>
            </div>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
              isFull
                ? 'bg-red-50 border-red-200 dark:bg-red-500/15 dark:border-red-400/30'
                : isNearCap
                  ? 'bg-amber-50 border-amber-200 dark:bg-amber-500/15 dark:border-amber-400/30'
                  : 'bg-green-50 border-green-200 dark:bg-green-500/15 dark:border-green-400/30'
            }`}>
              <Package className={`w-4 h-4 ${
                isFull ? 'text-red-600 dark:text-red-400' : isNearCap ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'
              }`} />
              <div>
                <div className={`text-[10px] font-bold uppercase ${
                  isFull ? 'text-red-500 dark:text-red-400' : isNearCap ? 'text-amber-500 dark:text-amber-400' : 'text-green-500 dark:text-green-400'
                }`}>
                  {isFull ? 'Full' : isNearCap ? 'Near Cap' : 'Capacity'}
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">{totalJobs}/{capacityMaxSlots}</div>
              </div>
            </div>

            {/* See Next Available — for admin/salesman (non-super_admin) */}
            {!canEdit && (
              <button
                onClick={onFindNextAvailable}
                disabled={findingNextAvailable}
                className="flex items-center gap-1.5 px-3 py-2 bg-brand/5 hover:bg-brand/10 dark:bg-brand/15 dark:hover:bg-brand/25 border border-brand/30 dark:border-brand/30 rounded-xl text-brand dark:text-brand text-sm font-semibold transition-all"
              >
                {findingNextAvailable ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Next Available
              </button>
            )}

            {/* Capacity Settings — super_admin only */}
            {canEdit && (
              <button
                onClick={onOpenCapacitySettings}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 rounded-xl text-gray-600 dark:text-white/60 text-sm font-semibold transition-all"
                title="Capacity Settings"
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
