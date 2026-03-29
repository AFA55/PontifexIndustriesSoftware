'use client';

import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

export default function RevenueOverviewWidget({ data, timeRange, isLoading }: WidgetProps) {
  if (isLoading) return <LoadingSkeleton className="h-full" />;

  const totalRevenue = data?.total_revenue ?? 0;
  const outstanding = data?.outstanding ?? 0;
  const paidThisPeriod = data?.paid_this_period ?? 0;
  const revenueTrend: { month: string; revenue: number }[] = data?.revenue_trend ?? [];

  const kpis = [
    { label: 'Total Revenue', value: totalRevenue, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Outstanding', value: outstanding, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Paid This Period', value: paidThisPeriod, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="grid grid-cols-3 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`${kpi.bg} rounded-xl p-3 text-center`}>
            <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
            <p className={`text-lg font-bold ${kpi.color}`}>{formatCurrency(kpi.value)}</p>
          </div>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={revenueTrend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(value: number) => [formatCurrency(value), 'Revenue']} />
            <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
