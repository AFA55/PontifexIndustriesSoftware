'use client';

import React from 'react';
import { cn } from '@/lib/cn';

/**
 * Card — the canonical surface/panel.
 *
 * Matches the ~322-place hand-rolled surface:
 *   rounded-2xl border border-gray-200 dark:border-white/10
 *   bg-white dark:bg-white/[0.03] p-5 sm:p-6
 *
 * Optional header via `title` (+ optional `action` slot on the right, e.g. a
 * Button). For full control, omit `title` and compose <CardHeader>/<CardBody>
 * yourself, or just drop children in.
 */

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional header title. Renders the header band when provided. */
  title?: React.ReactNode;
  /** Optional secondary text under the title. */
  subtitle?: React.ReactNode;
  /** Right-aligned header slot (button, menu, badge). */
  action?: React.ReactNode;
  /** Drop the default padding (e.g. for edge-to-edge tables/lists). */
  noPadding?: boolean;
}

const SURFACE =
  'rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]';

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { title, subtitle, action, noPadding = false, className, children, ...rest },
  ref,
) {
  const hasHeader = title != null || action != null;

  return (
    <div ref={ref} className={cn(SURFACE, className)} {...rest}>
      {hasHeader && (
        <div
          className={cn(
            'flex items-start justify-between gap-3 border-b border-gray-100 dark:border-white/10',
            'px-5 sm:px-6 py-4',
          )}
        >
          <div className="min-w-0">
            {title != null && (
              <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                {title}
              </h3>
            )}
            {subtitle != null && (
              <p className="mt-0.5 text-sm text-gray-500 dark:text-white/60">{subtitle}</p>
            )}
          </div>
          {action != null && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn(!noPadding && (hasHeader ? 'p-5 sm:p-6' : 'p-5 sm:p-6'))}>
        {children}
      </div>
    </div>
  );
});

/** Standalone header for fully custom compositions. */
export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 border-b border-gray-100 dark:border-white/10 px-5 sm:px-6 py-4',
        className,
      )}
      {...rest}
    />
  );
}

/** Standalone body for fully custom compositions. */
export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 sm:p-6', className)} {...rest} />;
}

export default Card;
