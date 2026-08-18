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
 * Did the refresh fail because the SERVICE could not be reached, rather than
 * because the session is no good?
 *
 * This distinction is the difference between two sentences a person reads at
 * the worst moment. "Your session expired — sign in again" sends someone to a
 * login page served by the same GoTrue that just refused to answer; they type
 * their password, it fails, and now they believe their ACCOUNT is broken. A
 * network blip must not be dressed up as a credential problem.
 *
 * auth-js raises `AuthRetryableFetchError` for exactly this class (offline, DNS,
 * 5xx from GoTrue). We match on the name rather than importing the constructor
 * so the check survives a version bump, and we accept the two shapes that reach
 * us before auth-js can wrap them: a raw status, and a bare fetch TypeError from
 * the iOS webview.
 *
 * An invalid/expired refresh token comes back as a 400 with a real message —
 * that is NOT retryable, and it correctly means "sign in again".
 */
function isRetryableAuthFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; status?: number; message?: string };
  if (e.name === 'AuthRetryableFetchError') return true;
  if (typeof e.status === 'number' && (e.status === 0 || e.status >= 500)) return true;
  if (e.name === 'TypeError') return true;
  return /failed to fetch|networkerror|network request failed|load failed/i.test(e.message || '');
}

type TokenResult = {
  token: string | null;
  /** True when there is no token because the sign-in service was unreachable. */
  unavailable: boolean;
};

/**
 * The current access token plus WHY it is missing when it is.
 *
 * `getSession()` already refreshes an EXPIRED token by itself. What it does not
 * do is notice that the thing it handed back isn't a JWT — so we check, and if
 * the shape is wrong we force a refresh to replace it.
 */
async function accessTokenResult(
  opts: { forceRefresh?: boolean } = {}
): Promise<TokenResult> {
  if (!opts.forceRefresh) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (looksLikeJwt(token)) return { token, unavailable: false };
    } catch {
      /* fall through to the refresh */
    }
  }

  // Either the caller asked for a new one (we just got a 401) or what was in
  // storage was not a JWT. One refresh, and we take the answer as final.
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return { token: null, unavailable: isRetryableAuthFailure(error) };
    const token = data.session?.access_token ?? null;
    // A well-formed answer that isn't a JWT is a real session problem, not an
    // outage — do not soften it into "try again in a moment".
    return looksLikeJwt(token)
      ? { token, unavailable: false }
      : { token: null, unavailable: false };
  } catch (e) {
    return { token: null, unavailable: isRetryableAuthFailure(e) };
  }
}

/**
 * The current access token, or null if there isn't a usable one.
 *
 * Kept as the plain-token API for callers that only need "can I authenticate
 * right now"; `authedFetch` uses `accessTokenResult` so it can tell an outage
 * apart from a dead session.
 */
export async function currentAccessToken(
  opts: { forceRefresh?: boolean } = {}
): Promise<string | null> {
  return (await accessTokenResult(opts)).token;
}

function withAuth(init: RequestInit, token: string): RequestInit {
  const headers = new Headers(init.headers);
  // An empty token means we have nothing to send. `Bearer ` with nothing after
  // it is a header claiming a credential that isn't there — the server trims it
  // to empty and 401s cleanly either way, but omitting it is the honest
  // description of the request and reads correctly in a network log. Whatever
  // the caller put there is left alone: replacing a credential somebody chose
  // deliberately is not ours to do (same rule as lib/api-client.ts).
  if (token) headers.set('Authorization', `Bearer ${token}`);
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
  const first = await accessTokenResult();
  // No token can mean two different things and they need different sentences:
  // the sign-in service was unreachable (their login is fine, retry), or the
  // session is genuinely dead (sign in again). Saying the second when the first
  // is true sends someone to a login page that will also fail.
  if (!first.token) {
    throw first.unavailable ? new AuthServiceUnavailableError() : new SessionExpiredError();
  }
  const token = first.token;

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

  const fresh = await accessTokenResult({ forceRefresh: true });
  if (!fresh.token) {
    throw fresh.unavailable ? new AuthServiceUnavailableError() : new SessionExpiredError();
  }

  const retry = await fetch(input, withAuth(init, fresh.token));
  if (retry.status === 401) throw new SessionExpiredError();
  return retry;
}

/**
 * The same recovery as `authedFetch`, but it NEVER throws — it always hands
 * back a Response.
 *
 * WHY BOTH EXIST: `authedFetch` throwing a typed error is right for a single
 * button, where the handler can say "sign in again" versus "the login service
 * is down". It is wrong for a caller whose entire contract is `const res =
 * await apiFetch(url); if (!res.ok) …` — the schedule board has roughly sixty
 * of those, and converting them all to try/catch during an outage is how you
 * turn a one-line fix into a regression hunt.
 *
 * So the board keeps its Response contract and still gets the two things that
 * actually matter: never send a non-JWT, and refresh once on a 401. When the
 * session is genuinely dead the caller sees the server's own 401, exactly as
 * it did before.
 *
 * At most ONE forced refresh per call: if `currentAccessToken()` already tried
 * and failed we do not ask again, we let the server answer.
 */
export async function authedFetchQuiet(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await currentAccessToken();

  // No usable token AND the refresh inside currentAccessToken already failed.
  // Asking a second time would just fail a second time; let the server say so.
  if (!token) return fetch(input, withAuth(init, ''));

  const res = await fetch(input, withAuth(init, token));
  if (res.status !== 401) return res;
  if (!isReplayable(init.body)) return res;

  const fresh = await currentAccessToken({ forceRefresh: true });
  if (!fresh) return res;
  return fetch(input, withAuth(init, fresh));
}
