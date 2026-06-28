'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * StatCard — KPI tile: label + big value + optional delta + optional icon.
 *
 * Delta direction colors itself (up = emerald, down = red) unless you flag
 * `invertDelta` (e.g. for metrics where "down is good"). Icon sits top-right in
 * a soft brand square.
 */

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** e.g. "+12%" or "-3" — sign drives the arrow + color. */
  delta?: string | number;
  /** Direction. If omitted, inferred from a leading +/- on `delta`. */
  deltaDirection?: 'up' | 'down' | 'neutral';
  /** When true, "up" renders red and "down" renders emerald. */
  invertDelta?: boolean;
  icon?: LucideIcon;
}

function inferDirection(
  delta: string | number | undefined,
  explicit?: 'up' | 'down' | 'neutral',
): 'up' | 'down' | 'neutral' {
  if (explicit) return explicit;
  if (delta == null) return 'neutral';
  const n = typeof delta === 'number' ? delta : parseFloat(String(delta).replace(/[^\d.-]/g, ''));
  if (Number.isNaN(n) || n === 0) return 'neutral';
  return n > 0 ? 'up' : 'down';
}

export function StatCard({
  label,
  value,
  delta,
  deltaDirection,
  invertDelta = false,
  icon: Icon,
  className,
  ...rest
}: StatCardProps) {
  const dir = inferDirection(delta, deltaDirection);
  const isGood = invertDelta ? dir === 'down' : dir === 'up';
  const isBad = invertDelta ? dir === 'up' : dir === 'down';

  const deltaColor = cn(
    dir === 'neutral' && 'text-gray-500 dark:text-white/50',
    isGood && 'text-emerald-600 dark:text-emerald-400',
    isBad && 'text-red-600 dark:text-red-400',
  );

  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6',
        className,
      )}
      {...rest}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-500 dark:text-white/60">{label}</p>
        {Icon && (
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand shrink-0">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          {value}
        </span>
        {delta != null && (
          <span className={cn('mb-1 inline-flex items-center gap-0.5 text-sm font-semibold', deltaColor)}>
            {dir === 'up' && <ArrowUpRight className="h-4 w-4" />}
            {dir === 'down' && <ArrowDownRight className="h-4 w-4" />}
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

export default StatCard;
