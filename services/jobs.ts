/**
 * Job Orders Service
 *
 * Single place for all job-related data operations.
 * Every page that needs job data should use this service
 * instead of calling supabase directly.
 */

import { supabase } from '@/lib/supabase';
import type { JobOrder, JobStatus, JobUpdatePayload } from '@/types/job';

// ─── Fetch Operations ────────────────────────────────────────────────────────

/** Fetch all non-deleted jobs */
export async function getAllJobs(): Promise<JobOrder[]> {
  // Ensure we have an active session before querying (RLS requires auth)
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.warn('No active session — cannot fetch jobs');
    return [];
  }

  const { data, error } = await supabase
    .from('job_orders')
    .select('*')
    .is('deleted_at', null)
    .order('scheduled_date', { ascending: true });

  if (error) {
    console.error('Error fetching jobs:', error);
    throw error;
  }

  return data || [];
}

/** Fetch jobs by status */
export async function getJobsByStatus(statuses: JobStatus[]): Promise<JobOrder[]> {
  const { data, error } = await supabase
    .from('job_orders')
    .select('*')
    .is('deleted_at', null)
    .in('status', statuses)
    .order('scheduled_date', { ascending: true });

  if (error) {
    console.error('Error fetching jobs by status:', error);
    throw error;
  }

  return data || [];
}

/** Fetch jobs for a specific date (handles multi-day jobs via end_date) */
export async function getJobsForDate(date: string): Promise<JobOrder[]> {
  const { data, error } = await supabase
    .from('job_orders')
    .select('*')
    .is('deleted_at', null)
    .lte('scheduled_date', date)
    .or(`end_date.gte.${date},end_date.is.null,scheduled_date.eq.${date}`)
    .order('scheduled_date', { ascending: true });

  if (error) {
    console.error('Error fetching jobs for date:', error);
    throw error;
  }

  // Client-side filter for accuracy with multi-day logic
  return (data || []).filter(job => {
    const jobEnd = job.end_date || job.scheduled_date;
    return job.scheduled_date <= date && jobEnd >= date;
  });
}

/** Fetch a single job by ID */
export async function getJobById(id: string): Promise<JobOrder | null> {
  const { data, error } = await supabase
    .from('job_orders')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching job:', error);
    return null;
  }

  return data;
}

/** Fetch jobs assigned to a specific operator */
export async function getJobsForOperator(operatorId: string): Promise<JobOrder[]> {
  const { data, error } = await supabase
    .from('job_orders')
    .select('*')
    .eq('assigned_to', operatorId)
    .is('deleted_at', null)
    .order('scheduled_date', { ascending: true });

  if (error) {
    console.error('Error fetching operator jobs:', error);
    throw error;
  }

  return data || [];
}

// ─── Categorized Fetch ───────────────────────────────────────────────────────

export interface CategorizedJobs {
  upcoming: JobOrder[];
  active: JobOrder[];
  completed: JobOrder[];
}

/** Fetch all jobs and categorize them into upcoming/active/completed */
export async function getCategorizedJobs(): Promise<CategorizedJobs> {
  const jobs = await getAllJobs();

  return {
    upcoming: jobs.filter(j => j.status === 'scheduled' || j.status === 'assigned'),
    active: jobs.filter(j => j.status === 'in_route' || j.status === 'in_progress'),
    completed: jobs.filter(j => j.status === 'completed'),
  };
}

// ─── Update Operations ───────────────────────────────────────────────────────

/** Update a job via the admin API (requires auth token) */
export async function updateJob(
  jobId: string,
  updates: JobUpdatePayload,
  token: string
): Promise<JobOrder> {
  const response = await fetch(`/api/admin/job-orders/${jobId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || 'Failed to update job');
  }

  const result = await response.json();
  return result.data;
}

/** Update job status directly (for operator workflow transitions) */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  token: string
): Promise<void> {
  const response = await fetch(`/api/job-orders/${jobId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || 'Failed to update job status');
  }
}

// ─── Search & Filter ─────────────────────────────────────────────────────────

/** Filter jobs by search query (client-side) */
export function filterJobsBySearch(jobs: JobOrder[], query: string): JobOrder[] {
  if (!query.trim()) return jobs;

  const q = query.toLowerCase();
  return jobs.filter(j =>
    j.title?.toLowerCase().includes(q) ||
    j.customer_name?.toLowerCase().includes(q) ||
    j.job_number?.toLowerCase().includes(q) ||
    j.location?.toLowerCase().includes(q) ||
    j.operator_name?.toLowerCase().includes(q) ||
    j.foreman_name?.toLowerCase().includes(q)
  );
}

/** Filter jobs by date range (client-side) */
export function filterJobsByDate(jobs: JobOrder[], date: string): JobOrder[] {
  return jobs.filter(j => {
    const jobEnd = j.end_date || j.scheduled_date;
    return j.scheduled_date <= date && jobEnd >= date;
  });
}
