/**
 * API client for internal Next.js API routes.
 *
 * Automatically attaches the Supabase bearer token so server-side
 * requireAuth()/requireAdmin() handlers (which read the Authorization
 * header) succeed from client code.
 */

import { supabase } from './supabase';

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
async function getAccessToken(): Promise<string | null> {
  // Fast path — session already ready.
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    return data.session.access_token;
  }

  // Slow path — wait briefly for rehydration. Matches the pattern used
  // in app/dashboard/admin/billing/page.tsx.
  const maxAttempts = 7; // ~1.05s total
  const intervalMs = 150;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const { data: retry } = await supabase.auth.getSession();
    if (retry.session?.access_token) {
      return retry.session.access_token;
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
  const hasAuthHeader = Object.keys(headers).some(
    (k) => k.toLowerCase() === 'authorization',
  );
  if (!hasAuthHeader) {
    const token = await getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(finalUrl, {
    ...rest,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `API error ${response.status}: ${errorBody || response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}
