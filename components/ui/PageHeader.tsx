'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * PageHeader — consistent page title block.
 *
 * title + optional subtitle + optional back link + optional right action slot
 * (e.g. a primary <Button>). Responsive: action drops below the title on mobile.
 */

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** href for a back link. Renders a "<- Back" affordance when set. */
  backHref?: string;
  /** Label for the back link. Default: "Back". */
  backLabel?: string;
  /** Right-aligned action slot. */
  action?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = 'Back',
  action,
  className,
  ...rest
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)} {...rest}>
      {backHref && (
        <Link
          href={backHref}
          className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand dark:text-white/60 dark:hover:text-brand transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white truncate">
            {title}
          </h1>
          {subtitle != null && (
            <p className="mt-1 text-sm text-gray-500 dark:text-white/60">{subtitle}</p>
          )}
        </div>
        {action != null && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

export default PageHeader;
