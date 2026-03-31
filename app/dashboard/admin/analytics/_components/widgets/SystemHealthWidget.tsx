'use client';

import { Database, Shield, HardDrive } from 'lucide-react';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

const SERVICES = [
  { key: 'database', label: 'Database', icon: Database },
  { key: 'auth', label: 'Auth', icon: Shield },
  { key: 'storage', label: 'Storage', icon: HardDrive },
];

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  down: 'bg-red-500',
};

export default function SystemHealthWidget({ data, timeRange, isLoading }: WidgetProps) {
  if (isLoading) return <LoadingSkeleton className="h-full" />;

  const services: Record<string, { status: string; latency: number }> = data?.services ?? {};

  return (
    <div className="flex flex-col gap-3 h-full justify-center">
      {SERVICES.map((svc) => {
        const info = services[svc.key] ?? { status: 'healthy', latency: 0 };
        const dotColor = STATUS_DOT[info.status] ?? 'bg-gray-400';

        return (
          <div key={svc.key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <svc.icon className="w-5 h-5 text-gray-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{svc.label}</p>
            </div>
            <span className="text-xs text-gray-500">{info.latency}ms</span>
            <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
          </div>
        );
      })}
    </div>
  );
}
