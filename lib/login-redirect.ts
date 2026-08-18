/**
 * WHERE A SIGN-IN SENDS YOU BACK TO.
 *
 * WHY THIS EXISTS (founder, Aug 18): Amanda pressed Print, landed on a page
 * saying "Your session expired", pressed the only button on it — "Sign in
 * again" — and did NOT come back to her ticket. That button linked to a bare
 * `/login`, which has no tenant, so it bounced to `/company-login`, which
 * resumes to `/dashboard` — the OPERATOR dashboard — for an office admin. She
 * then watched it render a placeholder name before it bounced her again to
 * `/dashboard/admin`. Six sign-ins a week, and the last one still didn't put
 * her back where she was.
 *
 * A "sign in again" button that doesn't return you to the thing you were doing
 * is not a recovery, it's a second interruption. This module carries the
 * intended destination through the whole login chain:
 *
 *     /work-ticket  →  /company-login?next=…  →  /login?tenant_id=…&next=…  →  /work-ticket
 *
 * OPEN-REDIRECT SAFETY is the whole reason `next` goes through a validator
 * rather than being interpolated. A `next` that a stranger can set is an
 * attack: `?next=https://evil.example/login` on a page that trusts it turns
 * our own domain into the bait for a credential-phishing page. `safeNextPath`
 * therefore accepts ONLY a same-origin absolute path, and rejects the two
 * shapes that look like paths but aren't:
 *   - `//evil.example/x`  — protocol-relative; the browser reads it as a HOST
 *   - `/\evil.example/x`  — backslash variant that several browsers normalise
 *     to the same thing
 *   - `/..//evil.example` — looks like a path, but URL resolution collapses the
 *     `..` and hands back `//evil.example`, i.e. shape one again
 * The last of those is why the check runs TWICE: once on the input, once on the
 * normalised output. Validating only the input validates a different string
 * from the one the browser will navigate.
 * It also refuses to point back at a login page, which would loop.
 */

/** The login pages themselves — never a valid place to "return" to. */
const LOGIN_PATHS = ['/login', '/company-login'];

/**
 * Compare a pathname against LOGIN_PATHS the way a SERVER would route it:
 * `/Login` and `/login/` both reach the login page, so both are loops. Exact
 * case-sensitive matching let `/login/` through, and `/login/` with no
 * tenant_id redirects to `/company-login` — the very loop this guards against.
 */
function isLoginPath(pathname: string): boolean {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return LOGIN_PATHS.includes(normalized);
}

/**
 * The caller-supplied return path, or null if it is not a plain same-origin
 * path we are willing to navigate to.
 *
 * Returns the path unchanged (including its query string) when it is safe, so
 * `?mode=week&date=…` on a work ticket survives the round trip.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;

  const value = raw.trim();
  if (!value.startsWith('/')) return null;
  // Protocol-relative ("//host") and its backslash variant ("/\host") are the
  // classic open-redirect payloads: they start with '/' but name a HOST.
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  // A control character or newline can smuggle past a naive check and change
  // how a header or URL is parsed downstream.
  if (/[\u0000-\u001F\u007F]/.test(value)) return null;

  // Final proof rather than pattern-matching: resolve it against an arbitrary
  // origin and require that it stayed on that origin. Anything that escaped
  // (scheme, authority) lands somewhere else and is rejected.
  let url: URL;
  try {
    url = new URL(value, 'https://pontifex.invalid');
  } catch {
    return null;
  }
  if (url.origin !== 'https://pontifex.invalid') return null;

  // Returning to a login page is a loop, not a return.
  if (isLoginPath(url.pathname)) return null;

  const path = `${url.pathname}${url.search}`;
  // RE-CHECK THE NORMALISED RESULT, not just the input. `URL` resolves `..`
  // segments, and resolution can MANUFACTURE the very payload we rejected
  // above: `/..//evil.example` normalises to `//evil.example`, which a browser
  // reads as an AUTHORITY, not a path — `new URL('//evil.example', origin)`
  // lands on https://evil.example. The input check alone is a single pass over
  // a string the browser will read a second time, differently.
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return null;
  return path;
}

/** Append `next` to a URL that may already carry a query string. */
export function withNext(base: string, next: string | null | undefined): string {
  const safe = safeNextPath(next);
  if (!safe) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}next=${encodeURIComponent(safe)}`;
}

/**
 * The href a "Sign in again" button should use from a page at `currentPath`.
 *
 * Always `/company-login`, never `/login`: `/login` needs a `tenant_id` it has
 * no way to obtain, and without one it redirects — which is exactly how the
 * old button lost the destination. `/company-login` knows the returning user's
 * company (its one-tap fast path) and forwards `next` onward.
 */
export function loginHrefForPath(currentPath: string | null | undefined): string {
  return withNext('/company-login', currentPath);
}

/**
 * Where to land after a successful sign-in: the caller's requested `next` when
 * it is safe, otherwise the role-based default the login page computed.
 *
 * The role default is the FALLBACK, never the override — a person who was sent
 * to sign in from a specific page is trying to get back to that page. The
 * server still authorises every fetch that page makes, so an operator who
 * somehow arrives at an admin path sees that page's own role guard, exactly as
 * they would by typing the URL.
 */
export function resolveLoginTarget(
  roleTarget: string,
  next: string | null | undefined
): string {
  return safeNextPath(next) ?? roleTarget;
}

/**
 * The current location as a `next` value. Returns null on the server.
 * Kept here so every call site spells "path + query, no origin" the same way.
 */
export function currentPathForNext(): string | null {
  if (typeof window === 'undefined') return null;
  return safeNextPath(`${window.location.pathname}${window.location.search}`);
}
