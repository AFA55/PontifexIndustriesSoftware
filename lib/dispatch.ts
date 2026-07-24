/**
 * Shared job-dispatch logic — used by BOTH the manual "Push Tickets" button
 * (app/api/admin/schedule-board/dispatch) and the 7:05am auto-dispatch cron
 * (app/api/cron/auto-dispatch). Identical behavior + the same duplicate guard,
 * so a human push and an auto-dispatch can't double-notify.
 *
 * Dispatch = flip a job's dispatched_at from NULL → now (first time only),
 * set status 'assigned', and notify/text the operator + helper. Jobs that
 * already have dispatched_at are skipped for SMS/notification (the guard).
 *
 * TENANT FILTER IS LOAD-BEARING: supabaseAdmin bypasses RLS — every query is
 * explicitly scoped to tenantId (a missing filter once texted other tenants'
 * crews). Span rules match the manual route exactly.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendSMS } from '@/lib/sms';

export interface DispatchResult {
  dispatched_count: number;
  already_dispatched_count: number;
  total_jobs: number;
  notification_count: number;
  sms_attempted: number;
}

export async function dispatchJobsForTenant(tenantId: string, targetDate: string): Promise<DispatchResult> {
  // Single-day jobs match ONLY their exact date; multi-day jobs match inside
  // their range. (Not `end_date.is.null` in the span arm — that made stale
  // never-finished single-day jobs "active" forever.)
  const { data: jobs, error: fetchError } = await supabaseAdmin
    .from('job_orders')
    .select('id, job_number, customer_name, location, job_type, assigned_to, helper_assigned_to, arrival_time, scheduled_date, end_date, dispatched_at')
    .eq('tenant_id', tenantId)
    .not('assigned_to', 'is', null)
    .lte('scheduled_date', targetDate)
    .or(`scheduled_date.eq.${targetDate},end_date.gte.${targetDate}`)
    .in('status', ['scheduled', 'assigned', 'in_progress'])
    .is('deleted_at', null);

  if (fetchError) throw new Error(`dispatch fetch failed: ${fetchError.message}`);
  if (!jobs || jobs.length === 0) {
    return { dispatched_count: 0, already_dispatched_count: 0, total_jobs: 0, notification_count: 0, sms_attempted: 0 };
  }

  // Duplicate-dispatch guard: only jobs whose dispatched_at was NULL get
  // notified/texted this call (and flip null → now). Already-dispatched jobs
  // are skipped (prevents repeat SMS on re-push / a human + cron overlap).
  const firstTimeJobs = jobs.filter((j) => j.dispatched_at === null);
  const alreadyDispatchedJobs = jobs.filter((j) => j.dispatched_at !== null);

  // Atomic claim: the UPDATE itself re-checks `dispatched_at IS NULL`, so if a
  // human "Push Tickets" and the 7:05 auto-dispatch cron hit the same job at the
  // same instant, only ONE flips the row (and only that caller notifies).
  // Notify off the RETURNED ids, never the pre-read set — this is the real guard
  // against duplicate texts on a human+cron overlap.
  const firstTimeDispatchIds = firstTimeJobs.map((j) => j.id);
  let claimedIds = new Set<string>();
  if (firstTimeDispatchIds.length > 0) {
    const { data: claimed, error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update({ dispatched_at: new Date().toISOString(), status: 'assigned' })
      .in('id', firstTimeDispatchIds)
      .is('dispatched_at', null)
      .eq('tenant_id', tenantId)
      .select('id');
    if (updateError) throw new Error(`dispatch update failed: ${updateError.message}`);
    claimedIds = new Set((claimed || []).map((r: { id: string }) => r.id));
  }

  const jobsToNotify = firstTimeJobs.filter((j) => claimedIds.has(j.id));

  // Names + phones for the operators/helpers being notified.
  const allUserIds = new Set<string>();
  jobsToNotify.forEach((j) => {
    if (j.assigned_to) allUserIds.add(j.assigned_to);
    if (j.helper_assigned_to) allUserIds.add(j.helper_assigned_to);
  });
  const { data: profiles } = allUserIds.size
    ? await supabaseAdmin.from('profiles').select('id, full_name, phone_number').in('id', Array.from(allUserIds))
    : { data: [] as { id: string; full_name: string | null; phone_number: string | null }[] };
  const phoneMap = new Map<string, string>();
  (profiles || []).forEach((p: any) => { if (p.phone_number) phoneMap.set(p.id, p.phone_number); });

  const formattedDate = new Date(targetDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  const notifications: {
    recipient_id: string; job_order_id: string; type: string;
    title: string; message: string; metadata: Record<string, unknown>;
  }[] = [];

  for (const job of jobsToNotify) {
    const isMultiDay = job.end_date && job.end_date !== job.scheduled_date;
    const base = {
      job_order_id: job.id, type: 'dispatched', title: 'Job Ticket Dispatched',
    };
    const meta = {
      job_number: job.job_number, customer_name: job.customer_name, location: job.location,
      job_type: job.job_type, arrival_time: job.arrival_time, dispatch_date: targetDate, is_multi_day: isMultiDay,
    };
    if (job.assigned_to) {
      notifications.push({
        ...base, recipient_id: job.assigned_to,
        message: `You have been assigned to ${job.customer_name} at ${job.location} on ${formattedDate}.${isMultiDay ? ' (Multi-day job)' : ''}`,
        metadata: meta,
      });
    }
    if (job.helper_assigned_to) {
      notifications.push({
        ...base, recipient_id: job.helper_assigned_to,
        message: `You have been assigned as helper for ${job.customer_name} at ${job.location} on ${formattedDate}.${isMultiDay ? ' (Multi-day job)' : ''}`,
        metadata: { ...meta, is_helper: true },
      });
    }
  }

  let notificationCount = 0;
  if (notifications.length > 0) {
    const { data: inserted } = await supabaseAdmin
      .from('schedule_notifications')
      .insert(notifications)
      .select('id');
    notificationCount = inserted?.length || 0;
  }

  // Fire-and-forget SMS.
  const smsPromises: Promise<unknown>[] = [];
  const formatTime = (t: string | null) => {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  };
  const buildMsg = (job: any, role: 'operator' | 'helper') =>
    [
      `📋 Job Dispatched — ${formattedDate}`,
      `Job #: ${job.job_number}`,
      `Customer: ${job.customer_name}`,
      `Location: ${job.location}`,
      job.arrival_time ? `Arrival: ${formatTime(job.arrival_time)}` : null,
      job.job_type ? `Type: ${job.job_type}` : null,
      role === 'helper' ? '(You are assigned as Helper)' : null,
      'Open the Pontifex app → My Jobs to view your ticket.',
    ].filter(Boolean).join('\n');

  for (const job of jobsToNotify) {
    if (job.assigned_to && phoneMap.has(job.assigned_to)) {
      smsPromises.push(sendSMS({ to: phoneMap.get(job.assigned_to)!, message: buildMsg(job, 'operator'), jobId: job.id }).catch((e) => console.error('dispatch SMS failed:', e)));
    }
    if (job.helper_assigned_to && phoneMap.has(job.helper_assigned_to)) {
      smsPromises.push(sendSMS({ to: phoneMap.get(job.helper_assigned_to)!, message: buildMsg(job, 'helper'), jobId: job.id }).catch((e) => console.error('dispatch SMS failed:', e)));
    }
  }
  Promise.allSettled(smsPromises).catch(() => {});

  return {
    dispatched_count: jobsToNotify.length,
    already_dispatched_count: alreadyDispatchedJobs.length,
    total_jobs: jobs.length,
    notification_count: notificationCount,
    sms_attempted: smsPromises.length,
  };
}
