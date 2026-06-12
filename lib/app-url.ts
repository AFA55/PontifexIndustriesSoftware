/**
 * Canonical app-origin resolution — hardened against garbage env values.
 *
 * WHY THIS EXISTS (Jun 2026 incident): the Vercel env var NEXT_PUBLIC_APP_URL
 * contained a dead old project URL **with two trailing spaces**
 * ("https://...vercel.app  "), which poisoned every emailed link — invites,
 * password resets, schedule links. The raw `process.env.NEXT_PUBLIC_APP_URL ||
 * fallback` pattern happily shipped that garbage because a non-empty string is
 * truthy.
 *
 * Rules enforced here:
 *  - trim whitespace, strip trailing slashes
 *  - the candidate MUST parse as a valid http(s) URL (`new URL()`), otherwise
 *    we fall through to the next candidate
 *  - only the URL **origin** is used (scheme + host + port) — any stray path,
 *    query, or encoded junk is discarded
 *
 * EVERY server-side consumer of NEXT_PUBLIC_APP_URL must go through
 * `resolveAppOrigin()`. Do not read the env var directly.
 *
 * This module is pure (no server-only imports) so it is safe to import from
 * client components too.
 */

export const PROD_APP_ORIGIN = 'https://www.pontifexindustries.com';

/**
 * Validate + normalize a single origin candidate.
 * Returns the clean origin (no trailing slash, no path/query) or null if the
 * candidate is missing, malformed, or not http(s).
 */
export function sanitizeOrigin(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // url.origin is scheme://host[:port] — drops paths, trailing slashes,
    // whitespace remnants, userinfo, everything.
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the public app origin for building absolute URLs (emails, Stripe
 * callbacks, redirects). Candidates, in order:
 *   1. NEXT_PUBLIC_APP_URL (validated — garbage falls through)
 *   2. the caller-provided request origin (validated)
 *   3. localhost in dev / the canonical production domain otherwise
 */
export function resolveAppOrigin(requestOrigin?: string | null): string {
  return (
    sanitizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    sanitizeOrigin(requestOrigin) ??
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : PROD_APP_ORIGIN)
  );
}
