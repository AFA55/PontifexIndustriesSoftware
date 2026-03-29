'use client';

import { Users, Clock, Truck, MapPin } from 'lucide-react';
import { WidgetProps } from '../types';
import { LoadingSkeleton, KPISkeleton } from './LoadingSkeleton';

export default function ActiveCrewsWidget({ data, timeRange, isLoading }: WidgetProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 h-full">
        {[1, 2, 3, 4].map((i) => <div key={i} className="rounded-xl bg-gray-50 p-3"><KPISkeleton /></div>)}
      </div>
    );
  }

  const stats = [
    {
      label: 'Total Active',
      value: data?.total_active ?? 0,
      icon: Users,
      color: 'text-gray-700',
      bg: 'bg-gray-50',
      iconBg: 'bg-gray-200',
    },
    {
      label: 'Clocked In',
      value: data?.clocked_in ?? 0,
      icon: Clock,
      color: 'text-blue-700',
      bg: 'bg-blue-50',
      iconBg: 'bg-blue-200',
    },
    {
      label: 'En Route',
      value: data?.en_route ?? 0,
      icon: Truck,
      color: 'text-amber-700',
      bg: 'bg-amber-50',
      iconBg: 'bg-amber-200',
    },
    {
      label: 'On Site',
      value: data?.on_site ?? 0,
      icon: MapPin,
      color: 'text-emerald-700',
      bg: 'bg-emerald-50',
      iconBg: 'bg-emerald-200',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 h-full content-center">
      {stats.map((stat) => (
        <div key={stat.label} className={`${stat.bg} rounded-xl p-4 flex flex-col items-center`}>
          <div className={`w-10 h-10 ${stat.iconBg} rounded-xl flex items-center justify-center mb-2`}>
            <stat.icon className={`w-5 h-5 ${stat.color}`} />
          </div>
          <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
