'use client';

/**
 * Takeoffs module — client-side API helper (mirrors components/hiring/api.ts).
 * All authenticated calls send `Authorization: Bearer <access_token>`.
 */

import { supabase } from '@/lib/supabase';

export class TakeoffsApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'TakeoffsApiError';
    this.status = status;
  }
}

export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function takeoffsFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new TakeoffsApiError('Not signed in', 401);

  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  let body: { success?: boolean; data?: T; error?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || body?.success === false) {
    throw new TakeoffsApiError(body?.error || `Request failed (${res.status})`, res.status);
  }
  return (body?.data ?? (body as unknown)) as T;
}

export const TAKEOFF_ROLES_CLIENT = ['admin', 'super_admin', 'operations_manager', 'salesman'];
