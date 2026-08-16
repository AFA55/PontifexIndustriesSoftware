/**
 * ONE WAY TO CALL OUR OWN API FROM THE BROWSER — with a session that recovers.
 *
 * WHY THIS EXISTS (founder, Aug 15): he clicked "Print" on a work ticket and got
 * a bare red line — "Unauthorized. Invalid or expired session." — and said the
 * PMs and admin had been telling him the same thing when they tried to print.
 *
 * The Supabase auth log for that exact second says what actually happened, and
 * it is NOT what the message claims:
 *
 *     GET /user  403  "token is malformed: token contains an invalid number of
 *                      segments"
 *
 * Not expired. MALFORMED. The browser sent something in the Authorization
 * header that was not a JWT at all (a JWT is three dot-separated segments), so
 * GoTrue rejected it before it ever looked at the expiry, and `requireAuth`
 * flattened every auth failure into the same "invalid or expired" sentence.
 *
 * The 24h Vercel log shows the shape of the problem: 401s arrive in CLUMPS —
 * ten schedule-board routes 401ing together, twice; one work-ticket 401 — i.e.
 * a whole page mounting with one bad token, not individual routes disagreeing
 * about permissions. Rare, but it takes a whole screen with it.
 *
 * I do not yet know what produces the bad string (see the shape diagnostic in
 * lib/api-auth.ts, which will name it the next time it happens). What this
 * module does is make the page SURVIVE it, which is true under every remaining
 * explanation:
 *
 *   1. Never send a token that isn't a JWT — check the shape first.
 *   2. On a 401, force one refresh and retry. A refresh replaces whatever
 *      corrupt or stale thing was in storage with a fresh token.
 *   3. If it still fails, the session really is dead — say THAT, and give the
 *      person a button. A red sentence with no way forward is how an office
 *      ends up telling the founder "I can't print."
 *
 * Concurrent callers are safe: supabase-js single-flights the refresh
 * internally (`refreshingDeferred`), so ten schedule-board calls hitting 401
 * together share one refresh rather than stampeding.
 */

import { supabase } from './supabase';

/**
 * A JWT is three non-empty dot-separated segments. This is deliberately a
 * SHAPE check, not a validity check — the server is the only thing that gets
 * to decide whether a well-formed token is real. It exists to catch the exact
 * class of failure observed above before it costs a round trip.
 */
export function looksLikeJwt(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/** Thrown when the session cannot be recovered — the caller should offer a login. */
export class SessionExpiredError extends Error {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export function isSessionExpired(e: unknown): e is SessionExpiredError {
  return e instanceof SessionExpiredError || (e as Error)?.name === 'SessionExpiredError';
}

/**
 * The current access token, or null if there isn't a usable one.
 *
 * `getSession()` already refreshes an EXPIRED token by itself. What it does not
 * do is notice that the thing it handed back isn't a JWT — so we check, and if
 * the shape is wrong we force a refresh to replace it.
 */
export async function currentAccessToken(
  opts: { forceRefresh?: boolean } = {}
): Promise<string | null> {
  if (!opts.forceRefresh) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (looksLikeJwt(token)) return token;
    } catch {
      /* fall through to the refresh */
    }
  }

  // Either the caller asked for a new one (we just got a 401) or what was in
  // storage was not a JWT. One refresh, and we take the answer as final.
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    const token = data.session?.access_token ?? null;
    return looksLikeJwt(token) ? token : null;
  } catch {
    return null;
  }
}

function withAuth(init: RequestInit, token: string): RequestInit {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * A request body can only be retried if we can send it a second time. Strings,
 * FormData and URLSearchParams replay fine; a stream is consumed by the first
 * attempt, so those requests get one shot and the 401 stands.
 */
export function isReplayable(body: BodyInit | null | undefined): boolean {
  if (body === null || body === undefined) return true;
  if (typeof body === 'string') return true;
  // `instanceof` against a global that doesn't exist in the runtime throws, so
  // each one is checked for existence first — this file is imported by tests
  // and by the iOS webview, not only by a full desktop browser.
  const is = (ctor: unknown) => typeof ctor === 'function' && body instanceof (ctor as never);
  return (
    is(typeof FormData !== 'undefined' ? FormData : undefined) ||
    is(typeof URLSearchParams !== 'undefined' ? URLSearchParams : undefined) ||
    is(typeof Blob !== 'undefined' ? Blob : undefined)
  );
}

/**
 * fetch() against our own API with the bearer attached, one silent recovery
 * attempt on 401, and a typed error when the session is genuinely gone.
 *
 * Throws SessionExpiredError; every other outcome (404, 403, 500) comes back as
 * a normal Response for the caller to read, because those mean something and
 * should not be disguised as a login problem.
 */
/** Thrown when the sign-in service itself is unreachable — NOT a bad session. */
export class AuthServiceUnavailableError extends Error {
  constructor(
    message = 'We could not reach the sign-in service. Your login is fine — please try again in a moment.'
  ) {
    super(message);
    this.name = 'AuthServiceUnavailableError';
  }
}

export function isAuthServiceUnavailable(e: unknown): e is AuthServiceUnavailableError {
  return (
    e instanceof AuthServiceUnavailableError ||
    (e as Error)?.name === 'AuthServiceUnavailableError'
  );
}

export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await currentAccessToken();
  if (!token) throw new SessionExpiredError();

  const res = await fetch(input, withAuth(init, token));

  // The server distinguishes "your token is bad" (401) from "we cannot reach
  // the sign-in service" (503). Never refresh on the latter: refreshing calls
  // the SAME service that is already failing, so a retry here turns one
  // struggling dependency into two requests per caller. Measured on Aug 16:
  // 196 auth failures in twenty minutes, all of them service failures, all of
  // them with a perfectly valid token.
  if (res.status === 503) {
    const body = await res.clone().json().catch(() => null);
    if (body?.code === 'auth_service_unavailable') {
      throw new AuthServiceUnavailableError(body.error);
    }
    return res;
  }

  if (res.status !== 401) return res;

  // 401 — the token was refused. Replace it and try exactly once more.
  if (!isReplayable(init.body)) throw new SessionExpiredError();

  const fresh = await currentAccessToken({ forceRefresh: true });
  if (!fresh) throw new SessionExpiredError();

  const retry = await fetch(input, withAuth(init, fresh));
  if (retry.status === 401) throw new SessionExpiredError();
  return retry;
}
