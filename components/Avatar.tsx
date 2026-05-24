'use client';

/**
 * Avatar — renders a user's profile picture, or a colored initials circle as a
 * fallback when no image is available. Used on the profile page and shared
 * headers. Public bucket image, so the URL is rendered directly.
 */

export interface AvatarProps {
  /** Public image URL. When falsy, an initials circle is shown instead. */
  src?: string | null;
  /** Display name used to derive initials and the fallback color. */
  name?: string | null;
  /** Pixel size of the (square) avatar. Default 40. */
  size?: number;
  className?: string;
}

/**
 * Derive up to two uppercase initials from a name.
 *   "Jane Doe"        -> "JD"
 *   "madison"         -> "M"
 *   "  jean  paul k"  -> "JP"  (first + last token)
 *   ""/null/undefined -> "?"
 */
export function getInitials(name?: string | null): string {
  if (!name) return '?';
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  if (tokens.length === 1) {
    return tokens[0].charAt(0).toUpperCase();
  }
  const first = tokens[0].charAt(0);
  const last = tokens[tokens.length - 1].charAt(0);
  return (first + last).toUpperCase();
}

// Deterministic gradient pick so the same name always gets the same color.
const GRADIENTS = [
  'from-purple-500 to-indigo-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-violet-500 to-fuchsia-600',
];

export function gradientFor(name?: string | null): string {
  if (!name) return GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export default function Avatar({ src, name, size = 40, className = '' }: AvatarProps) {
  const dimension = { width: size, height: size };
  const fontSize = Math.max(11, Math.round(size * 0.4));

  if (src) {
    return (
      <img
        src={src}
        alt={name ? `${name}'s avatar` : 'avatar'}
        style={dimension}
        className={`rounded-full object-cover bg-gray-100 dark:bg-white/10 ${className}`}
      />
    );
  }

  return (
    <div
      style={dimension}
      className={`rounded-full bg-gradient-to-br ${gradientFor(name)} flex items-center justify-center text-white font-bold leading-none select-none ${className}`}
      aria-label={name ? `${name}'s avatar` : 'avatar'}
    >
      <span style={{ fontSize }}>{getInitials(name)}</span>
    </div>
  );
}
