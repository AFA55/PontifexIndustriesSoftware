'use client';

/**
 * UserAvatar — the shared, app-wide profile picture component.
 *
 * Renders the user's photo (rounded, object-cover) when `src` is present and
 * loads successfully; otherwise falls back to a colored-initials circle whose
 * background is derived from a stable hash of the name (the same person always
 * gets the same color). Works in light and dark mode.
 *
 * Sizes: token ('xs' | 'sm' | 'md' | 'lg' | 'xl') or an explicit pixel number.
 */

import { useState, useEffect } from 'react';
import { getInitials, gradientFor } from '@/components/Avatar';

const SIZE_TOKENS = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
} as const;

export type UserAvatarSize = keyof typeof SIZE_TOKENS | number;

export interface UserAvatarProps {
  /** Image URL. When falsy (or it fails to load), the initials circle shows. */
  src?: string | null;
  /** Display name used for initials and the stable fallback color. */
  name?: string | null;
  /** Token size or explicit pixel size. Default 'md' (40px). */
  size?: UserAvatarSize;
  className?: string;
}

export default function UserAvatar({ src, name, size = 'md', className = '' }: UserAvatarProps) {
  const px = typeof size === 'number' ? size : SIZE_TOKENS[size];
  const [errored, setErrored] = useState(false);

  // If the src changes (e.g. user uploads a new photo), give the new URL a chance.
  useEffect(() => {
    setErrored(false);
  }, [src]);

  const dimension = { width: px, height: px, minWidth: px, minHeight: px };
  const fontSize = Math.max(10, Math.round(px * 0.4));

  if (src && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ? `${name}'s avatar` : 'avatar'}
        style={dimension}
        onError={() => setErrored(true)}
        className={`rounded-full object-cover shrink-0 bg-gray-100 dark:bg-white/10 ${className}`}
      />
    );
  }

  return (
    <div
      style={dimension}
      className={`rounded-full bg-gradient-to-br ${gradientFor(name)} flex items-center justify-center text-white font-bold leading-none select-none shrink-0 ${className}`}
      aria-label={name ? `${name}'s avatar` : 'avatar'}
    >
      <span style={{ fontSize }}>{getInitials(name)}</span>
    </div>
  );
}
