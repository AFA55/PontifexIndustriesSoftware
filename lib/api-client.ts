/**
 * Stub API client - implements apiFetch for build compatibility.
 * Replace with a real implementation when the API layer is built out.
 */

export interface ApiFetchOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  params?: Record<string, any>;
}

/**
 * Generic fetch wrapper that calls internal API routes.
 * Supports query params, typed responses, and standard fetch options.
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

  // Default to JSON content-type if body is a string (serialized JSON)
  const headers: Record<string, string> = { ...rest.headers };
  if (typeof rest.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
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
