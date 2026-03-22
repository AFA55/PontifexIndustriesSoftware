'use client';

import Link from 'next/link';
import { Calendar } from 'lucide-react';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-700' },
  in_progress: { bg: 'bg-amber-100', text: 'text-amber-700' },
  pending: { bg: 'bg-purple-100', text: 'text-purple-700' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700' },
};

export default function SchedulePreviewWidget({ data, timeRange, isLoading }: WidgetProps) {
  if (isLoading) return <LoadingSkeleton className="h-full" />;

  const jobs: {
    id: string;
    job_number: string;
    customer: string;
    type: string;
    time: string;
    status: string;
  }[] = data?.todays_jobs ?? [];

  const displayed = jobs.slice(0, 8);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto min-h-0">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Calendar className="w-10 h-10 mb-2" />
            <p className="text-sm">No jobs scheduled today</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-2 font-medium">Job #</th>
                <th className="pb-2 font-medium">Customer</th>
                <th className="pb-2 font-medium hidden sm:table-cell">Type</th>
                <th className="pb-2 font-medium hidden md:table-cell">Time</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((job) => {
                const badge = STATUS_BADGE[job.status] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
                return (
                  <tr key={job.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 font-medium text-gray-900">{job.job_number}</td>
                    <td className="py-2 text-gray-600 truncate max-w-[120px]">{job.customer}</td>
                    <td className="py-2 text-gray-500 hidden sm:table-cell">{job.type}</td>
                    <td className="py-2 text-gray-500 hidden md:table-cell">{job.time}</td>
                    <td className="py-2 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.bg} ${badge.text}`}>
                        {job.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <Link
        href="/dashboard/admin/schedule"
        className="mt-3 text-center text-xs text-purple-600 hover:text-purple-800 font-medium"
      >
        View Full Schedule &rarr;
      </Link>
    </div>
  );
}
