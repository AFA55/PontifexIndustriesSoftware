'use client';

/**
 * Hiring module — client-side API helper + shared display utilities.
 * All authenticated calls send `Authorization: Bearer <access_token>`
 * (house pattern — requireAuth() reads the bearer token, not cookies).
 * Contract: lib/hiring/types.ts (bottom comment block).
 */

import { supabase } from '@/lib/supabase';
import type { HiringJobStatus, CandidateStatus } from '@/lib/hiring/types';

export class HiringApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'HiringApiError';
    this.status = status;
  }
}

export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Fetch a hiring API route. Resolves to the unwrapped `data` payload of the
 * house `{ success: true, data: {...} }` envelope; throws HiringApiError
 * (with HTTP status) on any failure so callers can special-case 403
 * ("hiring not enabled") and 401.
 */
export async function hiringFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new HiringApiError('Not signed in', 401);

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

  if (!res.ok || body?.error) {
    throw new HiringApiError(body?.error || `Request failed (${res.status})`, res.status);
  }
  return (body?.data ?? (body as T)) as T;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Status pill styles: draft=slate / active=emerald / paused=amber / closed=gray. */
export const JOB_STATUS_PILL: Record<HiringJobStatus, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-white/70 dark:ring-white/15',
  },
  active: {
    label: 'Active',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30',
  },
  paused: {
    label: 'Paused',
    className: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',
  },
  closed: {
    label: 'Closed',
    className: 'bg-gray-100 text-gray-500 ring-gray-200 dark:bg-white/5 dark:text-white/50 dark:ring-white/10',
  },
};

export const CANDIDATE_STATUS_PILL: Record<CandidateStatus, { label: string; className: string }> = {
  unreviewed: {
    label: 'Unreviewed',
    className: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-white/70 dark:ring-white/15',
  },
  shortlisted: {
    label: 'Shortlisted',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30',
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30',
  },
};

export function fmtInt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('en-US');
}

/** clicks / impressions as "3.3%" — em-dash when there are no impressions. */
export function clickRate(clicks: number, impressions: number): string {
  if (!impressions) return '—';
  return `${((clicks / impressions) * 100).toFixed(1)}%`;
}

/** candidates / clicks as "11.6%" — em-dash when there are no clicks. */
export function applyRate(candidates: number, clicks: number): string {
  if (!clicks) return '—';
  return `${((candidates / clicks) * 100).toFixed(1)}%`;
}

export function fmtDateShort(ts: string): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(ts: string): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** "$18–$20/hr" style pay text from the job's pay fields. Null when unset. */
export function payText(
  payMin: number | null,
  payMax: number | null,
  payPeriod: string | null,
): string | null {
  if (payMin == null && payMax == null) return null;
  const per: Record<string, string> = { hour: 'hr', year: 'yr', week: 'wk', day: 'day', project: 'project' };
  const unit = per[payPeriod || 'hour'] || 'hr';
  const f = (n: number) => `$${n % 1 === 0 ? n.toLocaleString('en-US') : n.toFixed(2)}`;
  if (payMin != null && payMax != null && payMax > payMin) return `${f(payMin)}–${f(payMax)}/${unit}`;
  const single = payMin ?? payMax;
  return single != null ? `${f(single)}+/${unit}` : null;
}

export const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Español',
};
