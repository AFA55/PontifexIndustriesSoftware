'use client';

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Alert — inline feedback banner with a left-accent border + icon.
 *
 * Variants: success / warning / danger / info. Optional `title`, optional
 * dismiss (`onDismiss` renders an X). Children are the message body.
 */

export type AlertVariant = 'success' | 'warning' | 'danger' | 'info';

const STYLE: Record<
  AlertVariant,
  { wrap: string; icon: string; defaultIcon: LucideIcon }
> = {
  success: {
    wrap: 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100',
    icon: 'text-emerald-600 dark:text-emerald-400',
    defaultIcon: CheckCircle2,
  },
  warning: {
    wrap: 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100',
    icon: 'text-amber-600 dark:text-amber-400',
    defaultIcon: AlertTriangle,
  },
  danger: {
    wrap: 'border-red-500 bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-100',
    icon: 'text-red-600 dark:text-red-400',
    defaultIcon: XCircle,
  },
  info: {
    wrap: 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-500/10 dark:text-blue-100',
    icon: 'text-blue-600 dark:text-blue-400',
    defaultIcon: Info,
  },
};

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: AlertVariant;
  title?: React.ReactNode;
  /** Override the default variant icon. */
  icon?: LucideIcon;
  /** When provided, renders a dismiss button. */
  onDismiss?: () => void;
}

export function Alert({
  variant = 'info',
  title,
  icon,
  onDismiss,
  className,
  children,
  ...rest
}: AlertProps) {
  const s = STYLE[variant];
  const Icon = icon ?? s.defaultIcon;

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-xl border-l-4 px-4 py-3',
        s.wrap,
        className,
      )}
      {...rest}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', s.icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title != null && <p className="text-sm font-semibold">{title}</p>}
        {children != null && (
          <div className={cn('text-sm', title != null && 'mt-0.5 opacity-90')}>{children}</div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-0.5 shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-lg opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition"
        >
          <XCircle className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default Alert;
