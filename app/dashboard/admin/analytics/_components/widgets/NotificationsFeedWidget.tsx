'use client';

import { Check, X, AlertTriangle, Calendar, User, Bell, Eye } from 'lucide-react';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

interface Notification {
  id: string;
  type: 'approved' | 'rejected' | 'missing_info' | 'date_changed' | 'assigned';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  job_id?: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  approved: { icon: Check, color: 'text-green-500', bg: 'bg-green-50' },
  rejected: { icon: X, color: 'text-red-500', bg: 'bg-red-50' },
  missing_info: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
  date_changed: { icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-50' },
  assigned: { icon: User, color: 'text-purple-500', bg: 'bg-purple-50' },
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationsFeedWidget({ data, isLoading }: WidgetProps) {
  if (isLoading) return <LoadingSkeleton className="h-full" />;

  const items: Notification[] = data?.items ?? [];
  const unread: number = data?.unread ?? 0;

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 uppercase tracking-wide">Notifications</span>
        {unread > 0 && (
          <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-gray-300">
            <Bell className="w-8 h-8 mb-2" />
            <span className="text-xs">No notifications</span>
          </div>
        )}
        {items.map((item) => {
          const config = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.assigned;
          const Icon = config.icon;

          return (
            <div
              key={item.id}
              className={`group flex gap-2 p-2 rounded-xl transition-colors hover:bg-gray-50 ${
                !item.read ? 'border-l-2 border-blue-500 bg-blue-50/30' : ''
              }`}
            >
              <div className={`w-6 h-6 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-3 h-3 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-medium text-gray-800 truncate">{item.title}</p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!item.read && (
                      <button className="p-0.5 rounded text-gray-300 opacity-0 group-hover:opacity-100 hover:text-blue-500 transition-opacity">
                        <Eye className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 truncate">{item.message}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{relativeTime(item.created_at)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
