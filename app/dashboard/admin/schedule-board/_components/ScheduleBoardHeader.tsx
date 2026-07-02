'use client';

import Link from 'next/link';
import {
  Calendar, ChevronLeft, Bell, FolderOpen, FileText, Sparkles,
  Plus, RefreshCw, Loader2, Megaphone, KeyRound,
} from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';

interface ScheduleBoardHeaderProps {
  canEdit: boolean;
  pendingCount: number;
  willCallCount: number;
  showWillCall: boolean;
  changeRequestCount: number;
  autoScheduleLoading: boolean;
  unassignedCount: number;
  updatingSchedule: boolean;
  dispatchTotal: number;
  onOpenPendingQueue: () => void;
  onToggleWillCall: () => void;
  onAutoSchedule: () => void;
  onQuickAdd: () => void;
  onUpdateSchedule: () => void;
  onOpenDispatchModal: () => void;
  onOpenDailyCode: () => void;
}

export default function ScheduleBoardHeader({
  canEdit,
  pendingCount,
  willCallCount,
  showWillCall,
  changeRequestCount,
  autoScheduleLoading,
  unassignedCount,
  updatingSchedule,
  dispatchTotal,
  onOpenPendingQueue,
  onToggleWillCall,
  onAutoSchedule,
  onQuickAdd,
  onUpdateSchedule,
  onOpenDispatchModal,
  onOpenDailyCode,
}: ScheduleBoardHeaderProps) {
  return (
    <div className="backdrop-blur-xl bg-white/90 dark:bg-[#0e0720]/95 border-b border-gray-200 dark:border-white/10 sticky top-0 z-30 shadow-lg">
      <div className="container mx-auto px-4 md:px-6 py-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/admin" className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-white/10 rounded-xl transition-all hover:scale-105">
              <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-white/70" />
            </Link>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-brand" />
                {canEdit ? 'Operations Schedule Board' : 'Schedule Board'}
              </h1>
              <p className="text-gray-500 dark:text-white/60 text-xs">
                {canEdit ? 'Manage assignments, approvals & dispatch' : 'View scheduled jobs • Request changes'}
              </p>
            </div>
          </div>

          {/* Action toolbar — labels stay visible on narrow screens and the row
              wraps neatly instead of collapsing to icon-only buttons. */}
          <div className="flex items-center gap-2 w-full sm:w-auto sm:justify-end flex-wrap">
            {/* Notification bell for all users */}
            <NotificationBell variant="light" />

            {canEdit && (
              <button onClick={onOpenPendingQueue} className="relative h-9 px-3 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg text-orange-700 text-sm font-semibold transition-all flex items-center gap-1.5">
                <Bell className="w-4 h-4" /> <span className="whitespace-nowrap">Pending</span>
                {pendingCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{pendingCount}</span>
                )}
              </button>
            )}

            <button onClick={onToggleWillCall} className={`h-9 px-3 border rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${showWillCall ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700'}`}>
              <FolderOpen className="w-4 h-4" /> <span className="whitespace-nowrap">Will Call</span>
              <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded-full text-xs font-bold">{willCallCount}</span>
            </button>

            <button className="relative h-9 px-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-blue-700 text-sm font-semibold transition-all flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> <span className="whitespace-nowrap">Changes</span>
              {changeRequestCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{changeRequestCount}</span>
              )}
            </button>

            {canEdit && (
              <>
                <button
                  onClick={onAutoSchedule}
                  disabled={autoScheduleLoading || unassignedCount === 0}
                  className={`relative h-9 px-3 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md ${
                    unassignedCount > 0
                      ? 'bg-gradient-to-r from-brand to-brand-accent hover:from-brand-dark hover:to-brand-dark text-white'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {autoScheduleLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span className="whitespace-nowrap">{autoScheduleLoading ? 'Scheduling...' : 'AI Schedule'}</span>
                  {unassignedCount > 0 && !autoScheduleLoading && (
                    <span className="px-1.5 py-0.5 bg-white/20 rounded-full text-xs">{unassignedCount}</span>
                  )}
                </button>
                <button
                  onClick={onQuickAdd}
                  className="h-9 px-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md"
                >
                  <Plus className="w-4 h-4" /> <span className="whitespace-nowrap">Quick Add</span>
                </button>
                <button
                  onClick={onUpdateSchedule}
                  disabled={updatingSchedule}
                  className="h-9 px-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Re-push schedule changes to operators"
                >
                  {updatingSchedule ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> <span className="whitespace-nowrap">Updating...</span></>
                  ) : (
                    <><RefreshCw className="w-4 h-4" /> <span className="whitespace-nowrap">Update Schedule</span></>
                  )}
                </button>
                <button
                  onClick={onOpenDispatchModal}
                  className="relative h-9 px-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md"
                >
                  <Megaphone className="w-4 h-4" /> <span className="whitespace-nowrap">Push Tickets</span>
                  {dispatchTotal > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full flex items-center justify-center">{dispatchTotal}</span>
                  )}
                </button>
                <button
                  onClick={onOpenDailyCode}
                  className="h-9 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:hover:bg-indigo-500/25 border border-indigo-200 dark:border-indigo-400/30 rounded-lg text-indigo-700 dark:text-indigo-300 text-sm font-semibold transition-all flex items-center gap-1.5"
                >
                  <KeyRound className="w-4 h-4" /> <span className="whitespace-nowrap">Daily Code</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
