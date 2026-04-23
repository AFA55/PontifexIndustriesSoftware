'use client';

import React from 'react';

/**
 * Skeleton primitives for the Pontifex platform.
 *
 * - Shimmer is a masked left-to-right gradient animation (see globals.css)
 * - Honors prefers-reduced-motion (falls back to a subtle pulse)
 * - Dark-mode aware via Tailwind `dark:` + the `.skeleton-base` CSS class
 *
 * Use shape-matching skeletons in place of generic gray bars so the transition
 * from loading -> content feels like a polish step, not a layout pop.
 */

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export interface SkeletonProps extends DivProps {
  /** Tailwind width utility (e.g. 'w-32', 'w-full'). Default: w-full */
  width?: string;
  /** Tailwind height utility (e.g. 'h-4', 'h-8'). Default: h-4 */
  height?: string;
  /** Tailwind rounded utility. Default: rounded-md */
  rounded?: string;
}

function cx(...parts: Array<string | undefined | false | null>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * Base shimmer element. Everything else composes this.
 */
export function Skeleton({
  width = 'w-full',
  height = 'h-4',
  rounded = 'rounded-md',
  className,
  ...rest
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cx('skeleton-base', width, height, rounded, className)}
      {...rest}
    />
  );
}

/**
 * A block of text lines with varying widths (last line shorter) to mimic prose.
 */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ['w-full', 'w-11/12', 'w-10/12', 'w-9/12', 'w-8/12', 'w-7/12'];
  return (
    <div className={cx('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => {
        const isLast = i === lines - 1;
        const width = isLast ? widths[Math.min(lines, widths.length - 1)] : widths[i % 3];
        return <Skeleton key={i} width={width} height="h-3.5" />;
      })}
    </div>
  );
}

/**
 * Card container with a header band and body text lines.
 */
export function SkeletonCard({
  className,
  lines = 3,
  showHeader = true,
}: {
  className?: string;
  lines?: number;
  showHeader?: boolean;
}) {
  return (
    <div
      className={cx(
        'bg-white dark:bg-slate-900 rounded-xl shadow-md border border-gray-200 dark:border-slate-700 p-6',
        className,
      )}
      aria-hidden="true"
    >
      {showHeader && (
        <div className="flex items-center gap-3 mb-4">
          <Skeleton width="w-5" height="h-5" rounded="rounded" />
          <Skeleton width="w-40" height="h-5" />
        </div>
      )}
      <SkeletonText lines={lines} />
    </div>
  );
}

/**
 * Table skeleton with header row + `rows` x `cols` body cells.
 */
export function SkeletonTable({
  rows = 4,
  cols = 4,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden',
        className,
      )}
      aria-hidden="true"
    >
      <div
        className="grid gap-3 px-4 py-3 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} width="w-20" height="h-3.5" />
        ))}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-slate-800">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid gap-3 px-4 py-3"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                width={c === 0 ? 'w-28' : c === cols - 1 ? 'w-16' : 'w-24'}
                height="h-4"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * KPI tile: small label + big number.
 */
export function SkeletonStat({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        'bg-white dark:bg-slate-900 rounded-xl shadow-md border border-gray-200 dark:border-slate-700 p-6',
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3 mb-3">
        <Skeleton width="w-6" height="h-6" rounded="rounded-md" />
        <Skeleton width="w-24" height="h-3.5" />
      </div>
      <Skeleton width="w-20" height="h-8" />
    </div>
  );
}

export function SkeletonAvatar({
  size = 'h-10 w-10',
  className,
}: {
  size?: string;
  className?: string;
}) {
  return <Skeleton className={className} width={size.split(' ').find((t) => t.startsWith('w-')) || 'w-10'} height={size.split(' ').find((t) => t.startsWith('h-')) || 'h-10'} rounded="rounded-full" />;
}

export function SkeletonButton({
  width = 'w-28',
  className,
}: {
  width?: string;
  className?: string;
}) {
  return <Skeleton className={className} width={width} height="h-10" rounded="rounded-lg" />;
}

export function SkeletonBadge({ width = 'w-20', className }: { width?: string; className?: string }) {
  return <Skeleton className={className} width={width} height="h-6" rounded="rounded-full" />;
}

/**
 * Wrap a section to get staggered cascade fade-in.
 * `index` controls the stagger (50-100ms each).
 */
export function RevealSection({
  index = 0,
  delayStep = 70,
  className,
  children,
}: {
  index?: number;
  delayStep?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const style: React.CSSProperties = { animationDelay: `${index * delayStep}ms` };
  return (
    <div className={cx('section-reveal', className)} style={style}>
      {children}
    </div>
  );
}
