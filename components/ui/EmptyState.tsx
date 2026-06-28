'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * EmptyState — the "nothing here yet" placeholder.
 *
 * icon (lucide) in a soft brand square + title + subtext + optional action
 * (pass a <Button>). Centered, works inside a Card or full-page.
 */

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Action slot — typically a <Button>. */
  action?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-12',
        className,
      )}
      {...rest}
    >
      {Icon && (
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
      {description != null && (
        <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-white/60">
          {description}
        </p>
      )}
      {action != null && <div className="mt-5">{action}</div>}
    </div>
  );
}

export default EmptyState;
