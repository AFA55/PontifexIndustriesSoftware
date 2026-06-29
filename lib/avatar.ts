/**
 * Avatar URL resolution — the single source of truth for "which profile photo
 * URL do we render for this person?"
 *
 * The canonical column is `profiles.avatar_url`; `profiles.profile_picture_url`
 * is a legacy column kept in sync. Prefer the canonical one, fall back to the
 * legacy one, then to `null` (UserAvatar shows the initials gradient on null).
 *
 * Safe to use on the server and the client — pure, no imports.
 */
export function resolveAvatarUrl(
  p?: { avatar_url?: string | null; profile_picture_url?: string | null } | null
): string | null {
  if (!p) return null;
  return p.avatar_url || p.profile_picture_url || null;
}
