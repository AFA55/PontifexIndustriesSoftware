'use client';

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  draft: { color: '#9ca3af', label: 'Draft' },
  sent: { color: '#3b82f6', label: 'Sent' },
  paid: { color: '#10b981', label: 'Paid' },
  overdue: { color: '#ef4444', label: 'Overdue' },
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

export default function InvoiceSummaryWidget({ data, timeRange, isLoading }: WidgetProps) {
  if (isLoading) return <LoadingSkeleton className="h-full" />;

  const statuses: { status: string; count: number }[] = data?.statuses ?? [];
  const totalOutstanding = data?.total_outstanding ?? 0;
  const totalPaid = data?.total_paid ?? 0;

  const chartData = statuses.map((s) => {
    const cfg = STATUS_CONFIG[s.status] ?? { color: '#6b7280', label: s.status };
    return { name: cfg.label, value: s.count, color: cfg.color };
  });

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-red-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-gray-500">Outstanding</p>
          <p className="text-base font-bold text-red-600">{formatCurrency(totalOutstanding)}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-gray-500">Paid</p>
          <p className="text-base font-bold text-emerald-600">{formatCurrency(totalPaid)}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius="50%" outerRadius="80%" dataKey="value" paddingAngle={3}>
              {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [value, name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {chartData.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-600">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
