'use client';

import { Briefcase } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3b82f6',
  in_progress: '#f59e0b',
  completed: '#10b981',
  cancelled: '#ef4444',
  pending: '#8b5cf6',
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

export default function MyJobsWidget({ data, timeRange, isLoading }: WidgetProps) {
  if (isLoading) return <LoadingSkeleton className="h-full" />;

  const totalJobs = data?.total_jobs ?? 0;
  const totalRevenue = data?.total_revenue ?? 0;
  const pendingJobs = data?.pending_jobs ?? 0;
  const statuses: { status: string; count: number }[] = data?.statuses ?? [];
  const recentJobs: { job_number: string; customer: string; status: string }[] = data?.recent_jobs ?? [];

  const chartData = statuses.map((s) => ({
    name: s.status.replace('_', ' '),
    value: s.count,
    color: STATUS_COLORS[s.status] ?? '#6b7280',
  }));

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-blue-50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-gray-500">Total Jobs</p>
          <p className="text-base font-bold text-blue-700">{totalJobs}</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-gray-500">Revenue</p>
          <p className="text-base font-bold text-emerald-700">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-gray-500">Pending</p>
          <p className="text-base font-bold text-amber-700">{pendingJobs}</p>
        </div>
      </div>

      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius="45%" outerRadius="75%" dataKey="value" paddingAngle={2}>
              {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex-1 overflow-auto space-y-1">
        {recentJobs.slice(0, 5).map((job) => (
          <div key={job.job_number} className="flex items-center justify-between text-xs p-1.5 rounded hover:bg-gray-50">
            <span className="font-medium text-gray-900">{job.job_number}</span>
            <span className="text-gray-500 truncate mx-2 flex-1">{job.customer}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
              {job.status.replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
