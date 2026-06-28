'use client';

import React from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

/**
 * Button — the canonical action primitive.
 *
 * Variants:
 *  - primary    : tenant brand fill (bg-brand) — the main CTA
 *  - secondary  : outline / bordered
 *  - ghost      : transparent, hover tint
 *  - danger     : destructive red
 *
 * Tap targets: md/lg are >= 44px tall (mobile-first). `loading` swaps the left
 * icon for a spinner and disables the button. Render as a link by passing `href`
 * (uses an <a>), or wrap an arbitrary child element with `asChild`.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'relative inline-flex items-center justify-center gap-2 rounded-xl font-semibold ' +
  'transition-all duration-150 select-none focus:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white ' +
  'dark:focus-visible:ring-offset-slate-900 disabled:opacity-60 disabled:cursor-not-allowed ' +
  'active:scale-[0.98]';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-dark shadow-sm hover:shadow ' +
    'disabled:hover:bg-brand',
  secondary:
    'border border-gray-300 dark:border-white/15 text-gray-700 dark:text-white/90 ' +
    'bg-white dark:bg-transparent hover:bg-gray-50 dark:hover:bg-white/5',
  ghost:
    'text-gray-700 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/10 ' +
    'hover:text-gray-900 dark:hover:text-white',
  danger:
    'bg-red-600 text-white hover:bg-red-700 shadow-sm hover:shadow ' +
    'disabled:hover:bg-red-600',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'min-h-[44px] px-4 text-sm',
  lg: 'min-h-[52px] px-6 text-base',
};

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
};

export type ButtonProps = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps | 'type'> & {
    asChild?: boolean;
    href?: undefined;
    type?: 'button' | 'submit' | 'reset';
  };

export type ButtonLinkProps = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & {
    href: string;
    asChild?: false;
  };

function spinnerSizeFor(size: ButtonSize): 'sm' | 'md' {
  return size === 'lg' ? 'md' : 'sm';
}

function renderInner(
  loading: boolean,
  size: ButtonSize,
  leftIcon: React.ReactNode,
  rightIcon: React.ReactNode,
  children: React.ReactNode,
) {
  return (
    <>
      {loading ? (
        <Spinner size={spinnerSizeFor(size)} aria-hidden="true" />
      ) : (
        leftIcon && <span className="shrink-0 inline-flex">{leftIcon}</span>
      )}
      {children}
      {!loading && rightIcon && <span className="shrink-0 inline-flex">{rightIcon}</span>}
    </>
  );
}

export const Button = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps | ButtonLinkProps
>(function Button(props, ref) {
  const {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leftIcon,
    rightIcon,
    className,
    children,
    asChild = false,
    ...rest
  } = props as CommonProps & {
    asChild?: boolean;
    href?: string;
  } & Record<string, unknown>;

  const classes = cn(
    BASE,
    VARIANT[variant],
    SIZE[size],
    fullWidth && 'w-full',
    className,
  );

  // asChild: clone the single child and merge classes (Slot-lite, no Radix dep).
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string }>;
    return React.cloneElement(child, {
      className: cn(classes, child.props.className),
      ...(rest as Record<string, unknown>),
    });
  }

  const inner = renderInner(loading, size, leftIcon, rightIcon, children);

  // Link button
  if ('href' in props && props.href) {
    const { href, ...anchorRest } = rest as React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      href: string;
    };
    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={classes}
        aria-busy={loading || undefined}
        {...anchorRest}
      >
        {inner}
      </a>
    );
  }

  const { type = 'button', disabled, ...btnRest } =
    rest as React.ButtonHTMLAttributes<HTMLButtonElement>;

  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
      {...btnRest}
    >
      {inner}
    </button>
  );
});

export default Button;
