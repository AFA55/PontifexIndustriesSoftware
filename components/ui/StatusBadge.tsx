'use client';

import React from 'react';
import { cn } from '@/lib/cn';

/**
 * StatusBadge — small pill for statuses/labels.
 *
 * Use a semantic `variant` (success/warning/danger/info/neutral/brand) for
 * meaning, OR pass a `color` (any CSS color) for an arbitrary tint when the
 * status comes from data (e.g. a tenant-defined stage color).
 */

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'brand';

const VARIANT: Record<BadgeVariant, string> = {
  success:
    'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  warning:
    'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  danger:
    'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20',
  info: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20',
  neutral:
    'bg-gray-100 text-gray-600 ring-gray-500/20 dark:bg-white/10 dark:text-white/70 dark:ring-white/15',
  brand: 'bg-brand/10 text-brand ring-brand/20',
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Arbitrary color (overrides variant). Tints bg + text + ring from one value. */
  color?: string;
  /** Show a small leading dot. */
  dot?: boolean;
}

export function StatusBadge({
  variant = 'neutral',
  color,
  dot = false,
  className,
  style,
  children,
  ...rest
}: StatusBadgeProps) {
  const colorStyle: React.CSSProperties | undefined = color
    ? {
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)`,
        ...style,
      }
    : style;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        !color && 'ring-1 ring-inset',
        !color && VARIANT[variant],
        className,
      )}
      style={colorStyle}
      {...rest}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current"
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

export default StatusBadge;
