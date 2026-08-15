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
import { sendNotification } from '@/lib/send-reminder';
import { resolveDispatchRecipients } from '@/lib/dispatch-recipients';

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
  // ── WHO THE BOARD PLACED TODAY, BEFORE ANYTHING ELSE ─────────────────────
  //
  // THE BUG (founder, Saturday Aug 15): Javier's Simpsonville job would not
  // dispatch, and the modal showed him three OTHER jobs instead. The job was
  // crewed entirely through the per-day board — `assigned_to` and
  // `helper_assigned_to` were both null, with a ledger row naming him as lead
  // for the 15th. The filter below requires a job-level slot, so the job was
  // excluded from the fetch, and the per-day lead SYNC further down never saw
  // it either: that sync only corrects jobs already IN this result set. The
  // ledger was consulted only for jobs that did not need it.
  //
  // So the ledger is read FIRST and its jobs are unioned in. Same defect family
  // as the day numbering and the ticket hours: the board works per day, and the
  // code behind it kept reading the job level.
  const { data: ledgerToday } = await supabaseAdmin
    .from('job_daily_assignments')
    .select('job_order_id')
    .eq('assignment_date', targetDate)
    .or('operator_id.not.is.null,helper_id.not.is.null');
  const ledgerJobIds = [
    ...new Set(((ledgerToday as Array<{ job_order_id: string }>) ?? [])
      .map((r) => r.job_order_id)
      .filter(Boolean)),
  ];

  const JOB_COLUMNS =
    'id, job_number, customer_name, location, job_type, assigned_to, helper_assigned_to, arrival_time, scheduled_date, end_date, dispatched_at';

  const { data: ledgerJobs } = ledgerJobIds.length
    ? await supabaseAdmin
        .from('job_orders')
        .select(JOB_COLUMNS)
        .eq('tenant_id', tenantId)
        .in('id', ledgerJobIds)
        .in('status', ['scheduled', 'assigned', 'in_progress'])
        .is('deleted_at', null)
    : { data: [] as any[] };

  const { data: slotJobs, error: fetchError } = await supabaseAdmin
    .from('job_orders')
    .select(JOB_COLUMNS)
    .eq('tenant_id', tenantId)
    // A CREW IS A CREW, OPERATOR OR NOT (founder, Aug 13: "I'd like to assign
    // and choose a helper, and not have to assign an operator if I don't want
    // to"). This read `.not('assigned_to','is',null)`, so a helper-only job was
    // skipped by the only function in the codebase that writes `dispatched_at`
    // — leaving it permanently undispatched, and therefore invisible in the
    // helper's My Jobs, while the board showed it as "assigned". A bell
    // announcing a job they could not open.
    .or('assigned_to.not.is.null,helper_assigned_to.not.is.null')
    .lte('scheduled_date', targetDate)
    .or(`scheduled_date.eq.${targetDate},end_date.gte.${targetDate}`)
    .in('status', ['scheduled', 'assigned', 'in_progress'])
    .is('deleted_at', null);

  if (fetchError) throw new Error(`dispatch fetch failed: ${fetchError.message}`);

  // Union, deduped by id. A ledger-crewed job needs no job-level slot to reach
  // the dispatch loop — the SYNC below then writes today's lead into
  // assigned_to, which is what makes the ticket openable in My Jobs.
  const byId = new Map<string, any>();
  for (const j of ((slotJobs as any[]) ?? [])) byId.set(j.id, j);
  for (const j of ((ledgerJobs as any[]) ?? [])) if (!byId.has(j.id)) byId.set(j.id, j);
  const jobs = Array.from(byId.values());

  if (jobs.length === 0) {
    return { dispatched_count: 0, already_dispatched_count: 0, total_jobs: 0, notification_count: 0, sms_attempted: 0 };
  }

  // ── Per-day lead SYNC (before the dispatch loop) ─────────────────────────
  // job_daily_assignments is the per-day ledger; job_orders.assigned_to is
  // "the current lead". If today's ledger row names a different operator
  // (a day-scoped reassignment made in advance), promote it into assigned_to
  // NOW so the day's dispatch latch, notifications and downstream operator
  // guards all hit the right person. NOTE on sequencing: an operator can hold
  // several jobs today (day_sequence 1..N) — each job still has exactly ONE
  // ledger row, so this sync is per-job; the operator's "current" job is the
  // LOWEST-sequence incomplete one (enforced operator-side by the
  // sequence gate in /api/job-orders/[id]/status).
  // The ledger query is scoped by the tenant-scoped job ids (legacy JDA rows
  // can carry tenant_id NULL, so an .eq tenant filter could miss them).
  // Crew changes on an ALREADY-DISPATCHED job. The dispatch latch is one-time,
  // so it already fired for whoever was on the job before — the person who just
  // got added has to be told separately, or they never learn they have a job.
  const reassignedAlreadyDispatched: Array<{
    job: (typeof jobs)[number];
    notifyOperator: boolean;
    notifyHelper: boolean;
  }> = [];
  try {
    const { data: todaysLedger } = await supabaseAdmin
      .from('job_daily_assignments')
      .select('job_order_id, operator_id, helper_id')
      .eq('assignment_date', targetDate)
      .in('job_order_id', jobs.map((j) => j.id));

    for (const row of todaysLedger || []) {
      const job = jobs.find((j) => j.id === row.job_order_id);
      if (!job) continue;
      const operatorDiffers = row.operator_id && row.operator_id !== job.assigned_to;
      const helperDiffers = (row.helper_id ?? null) !== (job.helper_assigned_to ?? null);
      if (!operatorDiffers && !helperDiffers) continue;

      // Status is intentionally untouched here (the claim update below owns
      // status); this only corrects WHO today's lead/helper is.
      const { error: syncError } = await supabaseAdmin
        .from('job_orders')
        .update({
          ...(operatorDiffers ? { assigned_to: row.operator_id } : {}),
          ...(helperDiffers ? { helper_assigned_to: row.helper_id ?? null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
        .eq('tenant_id', tenantId);
      if (syncError) {
        console.error('dispatch lead-sync failed for job', job.id, syncError);
        continue;
      }

      // Keep the in-memory job true so the notification loop below texts the
      // RIGHT person, and remember already-dispatched jobs — their one-time
      // dispatch latch already fired for the OLD operator, so the incoming
      // operator gets an explicit assignment-changed notification instead.
      if (operatorDiffers) job.assigned_to = row.operator_id;
      if (helperDiffers) job.helper_assigned_to = row.helper_id ?? null;
      if (job.dispatched_at !== null && (operatorDiffers || helperDiffers)) {
        // HELPERS COUNT (founder, Aug 15): "I added a helper to Demo Operator
        // and it didn't let me push, it says nothing to push — but I made a
        // change and it needs to update their schedules." Only operator swaps
        // were tracked here, so a helper added after dispatch was silently
        // never told. A helper who does not know they have a job is the same
        // problem as an operator who does not, and it is the more likely one:
        // crews get topped up far more often than they get swapped.
        reassignedAlreadyDispatched.push({
          job,
          notifyOperator: !!operatorDiffers,
          // Only a real person — clearing a helper slot notifies nobody.
          notifyHelper: !!(helperDiffers && row.helper_id),
        });
      }
    }
  } catch (e) {
    // Sync is best-effort — never block the morning dispatch.
    console.error('dispatch lead-sync step failed:', e);
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

  // ── Extra crew (job_crew) on the jobs being dispatched ───────────────────
  // The single assigned_to / helper_assigned_to slots are not the whole crew:
  // additional operators and helpers live in job_crew. They must get the same
  // ticket + text as the slot holders, or a 3-person crew only ever hears from
  // dispatch twice (founder: "is it actually still going to send the operator
  // ticket?"). Tenant-scoped — supabaseAdmin bypasses RLS.
  const crewByJob = new Map<string, { user_id: string; role: string }[]>();
  if (jobsToNotify.length > 0) {
    const { data: crewRows } = await supabaseAdmin
      .from('job_crew')
      .select('job_order_id, user_id, role')
      .eq('tenant_id', tenantId)
      .in('job_order_id', jobsToNotify.map((j) => j.id));
    for (const r of crewRows || []) {
      const list = crewByJob.get(r.job_order_id) || [];
      list.push({ user_id: r.user_id, role: r.role });
      crewByJob.set(r.job_order_id, list);
    }
  }

  // Names + phones for the operators/helpers being notified (incl. incoming
  // operators on already-dispatched jobs that were reassigned via the ledger).
  const allUserIds = new Set<string>();
  jobsToNotify.forEach((j) => {
    if (j.assigned_to) allUserIds.add(j.assigned_to);
    if (j.helper_assigned_to) allUserIds.add(j.helper_assigned_to);
    for (const c of crewByJob.get(j.id) || []) allUserIds.add(c.user_id);
  });
  reassignedAlreadyDispatched.forEach(({ job, notifyOperator, notifyHelper }) => {
    if (notifyOperator && job.assigned_to) allUserIds.add(job.assigned_to);
    if (notifyHelper && job.helper_assigned_to) allUserIds.add(job.helper_assigned_to);
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
    // Lead + helper slot + every extra job_crew member, de-duplicated.
    for (const r of resolveDispatchRecipients(job, crewByJob.get(job.id) || [])) {
      const asHelper = r.role === 'helper';
      notifications.push({
        ...base, recipient_id: r.userId,
        message: asHelper
          ? `You have been assigned as helper for ${job.customer_name} at ${job.location} on ${formattedDate}.${isMultiDay ? ' (Multi-day job)' : ''}`
          : `You have been assigned to ${job.customer_name} at ${job.location} on ${formattedDate}.${isMultiDay ? ' (Multi-day job)' : ''}`,
        metadata: asHelper ? { ...meta, is_helper: true } : meta,
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
    // Same recipient set as the in-app notifications above — every crew member
    // with a phone gets the ticket text, not just the two slot holders.
    for (const r of resolveDispatchRecipients(job, crewByJob.get(job.id) || [])) {
      if (!phoneMap.has(r.userId)) continue;
      smsPromises.push(
        sendSMS({
          to: phoneMap.get(r.userId)!,
          message: buildMsg(job, r.role),
          jobId: job.id,
        }).catch((e) => console.error('dispatch SMS failed:', e)),
      );
    }
  }

  // Incoming operators on ALREADY-dispatched jobs (per-day reassignment took
  // effect this morning): the one-time dispatch latch fired for the previous
  // operator, so explicitly notify + text the new one. Fire-and-forget.
  for (const { job, notifyOperator, notifyHelper } of reassignedAlreadyDispatched) {
    const targets: Array<{ userId: string | null; role: 'operator' | 'helper' }> = [];
    if (notifyOperator && job.assigned_to) targets.push({ userId: job.assigned_to, role: 'operator' });
    if (notifyHelper && job.helper_assigned_to) targets.push({ userId: job.helper_assigned_to, role: 'helper' });

    for (const { userId, role } of targets) {
      if (!userId) continue;
      smsPromises.push(
        sendNotification({
          userId,
          tenantId,
          category: 'job_dispatched',
          title: role === 'helper' ? "You're on a crew today 📋" : 'New job assigned 📋',
          message:
            role === 'helper'
              ? `You've been added to ${job.job_number} for ${job.customer_name || 'a customer'} today (${formattedDate}).`
              : `${job.job_number} for ${job.customer_name || 'a customer'} is yours today (${formattedDate}).`,
          inAppType: 'job_order',
          jobOrderId: job.id,
          actionUrl: '/dashboard/my-jobs',
        }).catch((e) => console.error('dispatch reassignment notify failed:', e))
      );
      if (phoneMap.has(userId)) {
        smsPromises.push(
          sendSMS({ to: phoneMap.get(userId)!, message: buildMsg(job, role), jobId: job.id }).catch((e) =>
            console.error('dispatch SMS failed:', e)
          )
        );
      }
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
