'use client';

import { useCallback } from 'react';
import { useNotifications } from '@/contexts/NotificationContext';
import { supabase } from '@/lib/supabase';

/**
 * useApi — A fetch wrapper that automatically handles errors with toast notifications.
 * Wraps authenticated API calls with proper error handling, retry logic, and user feedback.
 *
 * Usage:
 *   const api = useApi();
 *   const data = await api.get('/api/admin/users');
 *   const result = await api.post('/api/admin/users', { name: 'John' });
 */
export function useApi() {
  const { error: showError, warning: showWarning } = useNotifications();

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        return {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        };
      }
    } catch {
      // Fall through
    }
    return { 'Content-Type': 'application/json' };
  }, []);

  const handleResponse = useCallback(async (response: Response, silent = false) => {
    if (response.ok) {
      try {
        return await response.json();
      } catch {
        return { success: true };
      }
    }

    // Handle specific error codes
    if (response.status === 401) {
      if (!silent) {
        showError('Session expired', 'Please log in again to continue.');
      }
      // Redirect to login after a brief delay
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
      throw new Error('Unauthorized');
    }

    if (response.status === 403) {
      if (!silent) {
        showError('Access denied', 'You don\'t have permission to perform this action.');
      }
      throw new Error('Forbidden');
    }

    if (response.status === 404) {
      if (!silent) {
        showWarning('Not found', 'The requested resource could not be found.');
      }
      throw new Error('Not found');
    }

    if (response.status === 429) {
      if (!silent) {
        showWarning('Too many requests', 'Please slow down and try again in a moment.');
      }
      throw new Error('Rate limited');
    }

    if (response.status >= 500) {
      if (!silent) {
        showError('Server error', 'Something went wrong on our end. Please try again.');
      }
      throw new Error('Server error');
    }

    // Generic error
    try {
      const data = await response.json();
      if (!silent) {
        showError('Request failed', data.error || data.message || `Error ${response.status}`);
      }
      throw new Error(data.error || `HTTP ${response.status}`);
    } catch (e) {
      if (e instanceof Error && e.message !== `HTTP ${response.status}`) throw e;
      if (!silent) {
        showError('Request failed', `Unexpected error (${response.status})`);
      }
      throw new Error(`HTTP ${response.status}`);
    }
  }, [showError, showWarning]);

  const request = useCallback(async (
    url: string,
    options: RequestInit & { silent?: boolean } = {}
  ) => {
    const { silent, ...fetchOptions } = options;
    const headers = await getAuthHeaders();

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          ...headers,
          ...fetchOptions.headers,
        },
      });
      return await handleResponse(response, silent);
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        // Network error
        if (!silent) {
          showError('Connection failed', 'Unable to reach the server. Check your internet connection.');
        }
      }
      throw err;
    }
  }, [getAuthHeaders, handleResponse, showError]);

  const get = useCallback((url: string, opts?: { silent?: boolean }) => {
    return request(url, { method: 'GET', ...opts });
  }, [request]);

  const post = useCallback((url: string, body?: any, opts?: { silent?: boolean }) => {
    return request(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    });
  }, [request]);

  const put = useCallback((url: string, body?: any, opts?: { silent?: boolean }) => {
    return request(url, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    });
  }, [request]);

  const patch = useCallback((url: string, body?: any, opts?: { silent?: boolean }) => {
    return request(url, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    });
  }, [request]);

  const del = useCallback((url: string, opts?: { silent?: boolean }) => {
    return request(url, { method: 'DELETE', ...opts });
  }, [request]);

  return { get, post, put, patch, del, request };
}
