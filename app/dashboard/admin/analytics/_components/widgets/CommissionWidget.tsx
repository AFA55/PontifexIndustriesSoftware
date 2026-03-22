'use client';

import { DollarSign, Percent, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

export default function CommissionWidget({ data, timeRange, isLoading }: WidgetProps) {
  if (isLoading) return <LoadingSkeleton className="h-full" />;

  const rate = data?.commission_rate ?? 0;
  const thisMonth = data?.earned_this_month ?? 0;
  const thisQuarter = data?.earned_this_quarter ?? 0;
  const allTime = data?.earned_all_time ?? 0;
  const monthlyData: { month: string; commission: number }[] = data?.monthly_commission ?? [];

  const kpis = [
    { label: 'Rate', value: `${rate}%`, icon: Percent, bg: 'bg-purple-50', color: 'text-purple-700' },
    { label: 'This Month', value: formatCurrency(thisMonth), icon: DollarSign, bg: 'bg-emerald-50', color: 'text-emerald-700' },
    { label: 'This Quarter', value: formatCurrency(thisQuarter), icon: TrendingUp, bg: 'bg-blue-50', color: 'text-blue-700' },
    { label: 'All-Time', value: formatCurrency(allTime), icon: DollarSign, bg: 'bg-amber-50', color: 'text-amber-700' },
  ];

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="grid grid-cols-2 gap-2">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`${kpi.bg} rounded-xl p-3 text-center`}>
            <p className="text-[10px] text-gray-500 mb-0.5">{kpi.label}</p>
            <p className={`text-base font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(value: number) => [formatCurrency(value), 'Commission']} />
            <Bar dataKey="commission" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
