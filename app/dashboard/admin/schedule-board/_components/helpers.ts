import { supabase } from '@/lib/supabase';
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

export async function apiFetch(url: string, opts?: RequestInit) {
  const token = await getToken();
  return fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
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
    po_number: job.po_number || null,
    day_label: computeDayLabel(job, viewDate),
    status: job.status || null,
    // Live operator-progress timestamps (already in job_orders select('*'))
    in_route_at: job.in_route_at ?? null,
    arrived_at_jobsite_at: job.arrived_at_jobsite_at ?? null,
    work_started_at: job.work_started_at ?? null,
    work_completed_at: job.work_completed_at ?? null,
  };
}
