/**
 * Authenticated API client for frontend data fetching.
 * Automatically attaches the Supabase Bearer token to all requests.
 * Use with React Query hooks for caching, deduplication, and background refetching.
 */

import { supabase } from '@/lib/supabase'

interface FetchOptions extends RequestInit {
  /** Query parameters to append to the URL */
  params?: Record<string, string | number | boolean | undefined>
}

/**
 * Fetch wrapper that automatically includes the Supabase auth token.
 * Throws on non-OK responses for React Query error handling.
 */
export async function apiFetch<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options

  // Build URL with query params
  const urlObj = new URL(url, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        urlObj.searchParams.set(key, String(value))
      }
    })
  }

  // Get current session token
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const response = await fetch(urlObj.toString(), {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...fetchOptions.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || `API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Paginated API response type
 */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
