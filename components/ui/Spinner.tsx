'use client';

import React from 'react';
import { cn } from '@/lib/cn';

/**
 * Spinner — brand-colored loading indicator.
 *
 * Defaults to `currentColor` so it inherits the text color of its context
 * (e.g. white inside a primary Button). Pass `brand` to force the tenant accent.
 */

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE: Record<SpinnerSize, string> = {
  xs: 'h-3.5 w-3.5 border-2',
  sm: 'h-4 w-4 border-2',
  md: 'h-5 w-5 border-2',
  lg: 'h-8 w-8 border-[3px]',
};

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  /** Use the tenant brand color instead of inheriting `currentColor`. */
  brand?: boolean;
  /** Accessible label. Defaults to "Loading". */
  label?: string;
}

export function Spinner({
  size = 'md',
  brand = false,
  label = 'Loading',
  className,
  ...rest
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block animate-spin rounded-full border-current border-r-transparent align-[-0.125em]',
        brand && 'text-brand',
        SIZE[size],
        className,
      )}
      {...rest}
    />
  );
}

export default Spinner;
