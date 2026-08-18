/**
 * API client for internal Next.js API routes.
 *
 * Automatically attaches the Supabase bearer token so server-side
 * requireAuth()/requireAdmin() handlers (which read the Authorization
 * header) succeed from client code.
 */

import { supabase } from './supabase';
import { authedFetch, looksLikeJwt } from './authed-fetch';

export interface ApiFetchOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  params?: Record<string, any>;
}

/**
 * Resolve the current Supabase access token.
 *
 * On first page load the Supabase client may still be rehydrating the
 * session from localStorage when callers fire off their first request.
 * We poll briefly (up to ~1s) so early-mount effects don't 401.
 */
export async function getAccessToken(): Promise<string | null> {
  // Fast path — session already ready.
  //
  // SHAPE-CHECKED (Aug 17): this returned whatever string was in the session,
  // and a value that is not three dot-separated segments is rejected by GoTrue
  // before it ever looks at the expiry — "token contains an invalid number of
  // segments". Sending it costs a round trip and produces a 401 that reads as
  // "your session expired" when the session is fine. If the shape is wrong we
  // treat it as no token and let the polling below (then authedFetch's single
  // refresh) replace it.
  const { data } = await supabase.auth.getSession();
  if (looksLikeJwt(data.session?.access_token)) {
    return data.session!.access_token;
  }

  // Slow path — wait briefly for rehydration. Matches the pattern used
  // in app/dashboard/admin/billing/page.tsx.
  const maxAttempts = 7; // ~1.05s total
  const intervalMs = 150;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const { data: retry } = await supabase.auth.getSession();
    if (looksLikeJwt(retry.session?.access_token)) {
      return retry.session!.access_token;
    }
  }

  return null;
}

/**
 * Generic fetch wrapper that calls internal API routes.
 * Supports query params, typed responses, and standard fetch options.
 * Automatically attaches Authorization: Bearer <supabase access token>
 * unless the caller has already supplied one.
 */
export async function apiFetch<T = any>(
  url: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { params, ...rest } = options;

  // Append query params to URL if provided
  let finalUrl = url;
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    }
    finalUrl += `?${searchParams.toString()}`;
  }

  // Merge caller headers, defaulting JSON content-type when body is a
  // serialized JSON string.
  const headers: Record<string, string> = { ...rest.headers };
  if (typeof rest.body === 'string' && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Attach Supabase bearer unless caller already provided one.
  //
  // When the caller supplies its own Authorization header we stay out of the
  // way entirely (plain fetch, no refresh) — we have no business replacing a
  // credential somebody chose deliberately.
  const hasAuthHeader = Object.keys(headers).some(
    (k) => k.toLowerCase() === 'authorization',
  );

  let response: Response;
  if (hasAuthHeader) {
    response = await fetch(finalUrl, { ...rest, headers });
  } else {
    // Poll for a rehydrating session first (unchanged), then hand off to
    // authedFetch, which owns the one rule this wrapper never had: a 401 buys
    // ONE forced refresh and one retry before we call the session dead.
    // authedFetch throws SessionExpiredError / AuthServiceUnavailableError —
    // deliberately different types, because "sign in again" and "the sign-in
    // service is unreachable" need opposite advice, and telling someone to
    // re-authenticate during an auth outage sends them to a page that also
    // will not work.
    //
    // The poll's RESULT is discarded on purpose — authedFetch reads the session
    // itself. What we want from it is the WAIT: a first-mount call that fires
    // before the client has rehydrated would otherwise reach authedFetch with
    // no session and burn a refresh to discover the session was simply not
    // loaded yet.
    await getAccessToken();
    response = await authedFetch(finalUrl, { ...rest, headers });
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `API error ${response.status}: ${errorBody || response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}
