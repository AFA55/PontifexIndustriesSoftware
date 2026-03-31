'use client';

import { Activity, CheckCircle, AlertCircle, FileText, User, Clock } from 'lucide-react';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

const ICON_MAP: Record<string, React.ElementType> = {
  job_completed: CheckCircle,
  job_created: FileText,
  user_login: User,
  alert: AlertCircle,
  default: Activity,
};

const ICON_COLOR: Record<string, string> = {
  job_completed: 'text-emerald-500',
  job_created: 'text-blue-500',
  user_login: 'text-purple-500',
  alert: 'text-amber-500',
  default: 'text-gray-400',
};

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function RecentActivityWidget({ data, timeRange, isLoading }: WidgetProps) {
  if (isLoading) return <LoadingSkeleton className="h-full" />;

  const events: { type: string; description: string; timestamp: string }[] = data?.events ?? [];

  return (
    <div className="flex flex-col h-full overflow-auto">
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <Clock className="w-10 h-10 mb-2" />
          <p className="text-sm">No recent activity</p>
        </div>
      ) : (
        <div className="space-y-1">
          {events.slice(0, 10).map((event, i) => {
            const Icon = ICON_MAP[event.type] ?? ICON_MAP.default;
            const color = ICON_COLOR[event.type] ?? ICON_COLOR.default;
            return (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50">
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 leading-snug">{event.description}</p>
                </div>
                <span className="text-[10px] text-gray-400 whitespace-nowrap mt-0.5">
                  {relativeTime(event.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
