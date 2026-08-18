import { supabase } from '@/lib/supabase';
import { authedFetchQuiet } from '@/lib/authed-fetch';
import type { JobCardData } from './JobCard';

// ─── Date helpers ─────────────────────────────────────────────────────────
export function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDisplayDate(dateString: string) {
  const date = parseLocalDate(dateString);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const dateOnly = new Date(date); dateOnly.setHours(0, 0, 0, 0);
  if (dateOnly.getTime() === today.getTime()) return 'Today';
  if (dateOnly.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function daysAgo(dateString: string) {
  const added = parseLocalDate(dateString);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - added.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── API helpers ──────────────────────────────────────────────────────────
export async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

/**
 * The board's call to its own API.
 *
 * WHY authedFetchQuiet (Aug 17): this used to read the session and post
 * whatever `access_token` it found. When that value was malformed — the exact
 * failure in the Supabase auth log, "token contains an invalid number of
 * segments" — every call the board made on mount 401ed together, which is what
 * a clump of ten simultaneous 401s in the Vercel log is. The board is where
 * that happens precisely because the board fires the most calls at once.
 *
 * Quiet, not throwing: ~60 call sites here read `res.ok`, and every one of them
 * still gets a Response. What changes is that a non-JWT is never sent, and a
 * 401 buys one refresh and one retry before the board decides anything is
 * wrong. Its `Content-Type` default is unchanged.
 */
export async function apiFetch(url: string, opts?: RequestInit) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts?.headers as Record<string, string> | undefined),
  };

  // If the caller brought its own Authorization we stay out of the way — plain
  // fetch, no session read, no refresh. Replacing a credential somebody chose
  // deliberately is not ours to do; `lib/api-client.ts` already declines to,
  // and the two should not disagree. No board site does this today, which is
  // exactly why it should be settled before one does.
  const hasAuthHeader = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
  if (hasAuthHeader) return fetch(url, { ...opts, headers });

  return authedFetchQuiet(url, { ...opts, headers });
}

// ─── Convert API job to JobCardData ──────────────────────────────────────
export function computeDayLabel(job: any, viewDate?: string): string | undefined {
  if (!job.scheduled_date || !job.end_date) return undefined;
  if (job.scheduled_date === job.end_date) return undefined; // single-day job
  const start = parseLocalDate(job.scheduled_date);
  const end = parseLocalDate(job.end_date);
  // Use the date currently being viewed on the board, not today's real date
  const current = viewDate ? parseLocalDate(viewDate) : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const currentDay = Math.round((current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (currentDay >= 1 && currentDay <= totalDays) return `Day ${currentDay} of ${totalDays}`;
  return undefined;
}

export function toJobCard(job: any, viewDate?: string): JobCardData {
  return {
    id: job.id,
    job_number: job.job_number,
    customer_name: job.customer_name,
    job_type: job.job_type,
    location: job.location || '',
    address: job.address || '',
    equipment_needed: job.equipment_needed || [],
    description: job.description || null,
    scheduled_date: job.scheduled_date || '',
    end_date: job.end_date || null,
    arrival_time: job.arrival_time || null,
    is_will_call: job.is_will_call || false,
    difficulty_rating: job.difficulty_rating || null,
    notes_count: job.notes_count || 0,
    change_requests_count: job.pending_change_requests_count || 0,
    helper_names: job.helper_name ? [job.helper_name] : [],
    // People the board can show without another fetch. operator_name/helper_name
    // come straight from schedule_board_view (+ the per-day overlay); `crew` is
    // the extra job_crew members the board GET now attaches.
    operator_name: job.operator_name || null,
    helper_name: job.helper_name || null,
    crew: Array.isArray(job.crew) ? job.crew : [],
    po_number: job.po_number || null,
    day_label: computeDayLabel(job, viewDate),
    // Same-day sequencing (from the board GET's per-day-ledger overlay)
    day_sequence: job.day_sequence ?? null,
    operator_day_job_count: job.operator_day_job_count ?? null,
    // Current lead (post-overlay) — keep-operator source for helper-only edits
    assigned_to: job.assigned_to ?? null,
    status: job.status || null,
    // Live operator-progress timestamps (already in job_orders select('*'))
    in_route_at: job.in_route_at ?? null,
    arrived_at_jobsite_at: job.arrived_at_jobsite_at ?? null,
    work_started_at: job.work_started_at ?? null,
    work_completed_at: job.work_completed_at ?? null,
  };
}
