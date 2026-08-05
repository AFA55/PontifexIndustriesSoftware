export const dynamic = 'force-dynamic';

/**
 * API Route: POST/PUT /api/job-orders/[id]/status
 * Update job order status with automatic timestamp tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';
import { notifySalesperson } from '@/lib/notify-salesperson';
import { notifyCustomer } from '@/lib/notify-customer';
import { isValidTransition, validateTransitionTimestamp } from '@/lib/job-status';
import { sequenceBlocks } from '@/lib/reassign';

async function updateJobStatus(
  request: NextRequest,
  params: Promise<{ id: string }>
) {
  try {
    // Await params in Next.js 15+
    const { id: jobId } = await params;

    // Get user from Supabase session (server-side)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { status, latitude, longitude, accuracy, departure_time, ...additionalFields } = body;

    // Validate status value is in the recognized set
    const validStatuses = ['scheduled', 'assigned', 'in_route', 'on_site', 'in_progress', 'pending_completion', 'completed', 'cancelled', 'archived'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Legal status transitions — operators may only walk forward through the
    // pipeline. Cancellation/archival are admin-only (enforced after we
    // resolve the user's role below).
    const LEGAL_TRANSITIONS: Record<string, string[]> = {
      pending_approval: ['scheduled', 'cancelled'],
      scheduled: ['assigned', 'in_route', 'cancelled'],
      assigned: ['in_route', 'scheduled', 'cancelled'],
      in_route: ['on_site', 'in_progress', 'cancelled'],
      on_site: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'pending_completion', 'cancelled'],
      pending_completion: ['completed', 'in_progress', 'scheduled'],  // admin can approve or reopen
      completed: ['archived'],
      cancelled: [],
      archived: [],
    };

    // Resolve tenant scope — supabaseAdmin bypasses RLS, must scope manually
    const tenantId = await getTenantId(user.id);

    // Role is resolved after this point; fetch it early to gate the tenantId null check.
    // We must guard before any DB query so a null tenantId never returns cross-tenant data.
    const { data: earlyProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    const earlyRole = earlyProfile?.role || 'operator';

    if (!tenantId && earlyRole !== 'super_admin') {
      return NextResponse.json(
        { error: 'Tenant context required' },
        { status: 403 }
      );
    }

    // Check if job exists and user has permission (scoped to tenant)
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: existingJob, error: checkError } = await jobQuery.single();

    if (checkError || !existingJob) {
      return NextResponse.json(
        { error: 'Job order not found' },
        { status: 404 }
      );
    }

    // Use the role already fetched for the tenantId guard above (avoids a second profile query)
    const profile = earlyProfile;

    // Check permissions: operator/helper can update their own jobs, admin roles can update any
    const adminRoles = ['admin', 'super_admin', 'operations_manager'];
    const isAdmin = adminRoles.includes(profile?.role || '');
    const isAssignedOperator = existingJob.assigned_to === user.id;
    const isAssignedHelper = existingJob.helper_assigned_to === user.id;
    if (!isAdmin && !isAssignedOperator && !isAssignedHelper) {
      return NextResponse.json(
        { error: 'You can only update jobs assigned to you' },
        { status: 403 }
      );
    }

    // Enforce legal status transition. Operators must walk the pipeline
    // forward; only admins may cancel or archive.
    const currentStatus: string = existingJob.status ?? 'scheduled';
    const allowedNext = LEGAL_TRANSITIONS[currentStatus] ?? [];
    if (currentStatus !== status && !allowedNext.includes(status)) {
      return NextResponse.json(
        {
          error: `Illegal status transition: ${currentStatus} → ${status}. Allowed next states: ${allowedNext.join(', ') || '(none)'}`,
        },
        { status: 400 }
      );
    }
    if ((status === 'cancelled' || status === 'archived') && !isAdmin) {
      return NextResponse.json(
        { error: `Only admins may set status='${status}'` },
        { status: 403 }
      );
    }

    // Secondary forward-only guard (defense-in-depth alongside LEGAL_TRANSITIONS).
    // Conservative: log a warning rather than hard-reject so we never block a
    // legitimate live operator flow the LEGAL_TRANSITIONS map already permitted.
    if (!isValidTransition(currentStatus, status)) {
      console.warn(
        `[job-status] non-forward transition for job ${jobId}: ${currentStatus} -> ${status} (by ${user.id})`
      );
    }

    // Tenant-local "today" — used by the overdue-ticket gate and the
    // same-day sequence gate below.
    let tenantTz = 'America/New_York';
    if (!isAdmin && (status === 'in_route' || status === 'in_progress')) {
      try {
        if (existingJob.tenant_id) {
          const { data: tzRow } = await supabaseAdmin
            .from('tenants')
            .select('timezone')
            .eq('id', existingJob.tenant_id)
            .maybeSingle();
          if (tzRow?.timezone) tenantTz = tzRow.timezone;
        }
      } catch { /* fall back */ }
    }
    const tenantToday = new Date().toLocaleDateString('en-CA', { timeZone: tenantTz });

    // ── Overdue-ticket gate (founder Jul 21): an operator may NOT start a
    // NEW job while a ticket from a previous day is still unfinished — they
    // complete it first (late completion books to its scheduled day), THEN
    // start today's. The morning clock-in modal points them there; this is
    // the server-side enforcement so the order can't be skipped.
    if (status === 'in_route' && isAssignedOperator && !isAdmin) {
      try {
        const today = tenantToday;
        const { data: overdueCandidates } = await supabaseAdmin
          .from('job_orders')
          .select('id, job_number, customer_name, scheduled_date, end_date')
          .eq('assigned_to', user.id)
          .neq('id', jobId)
          .lt('scheduled_date', today)
          .not('dispatched_at', 'is', null)
          .is('work_completed_at', null)
          .not('status', 'in', '("cancelled","completed","pending_completion")');
        // Multi-day jobs still running today are NOT overdue.
        const blocking = (overdueCandidates ?? []).filter(
          (j: any) => !(j.end_date && j.end_date >= today)
        );
        if (blocking.length > 0) {
          return NextResponse.json(
            {
              error: `Finish your unfinished ticket first: ${blocking[0].job_number} (${blocking[0].customer_name}). Complete it, then start this job — the office needs that information.`,
              block_type: 'overdue_ticket_block',
              overdue_jobs: blocking.map((j: any) => ({
                id: j.id,
                job_number: j.job_number,
                customer_name: j.customer_name,
                scheduled_date: j.scheduled_date,
              })),
            },
            { status: 409 }
          );
        }
      } catch {
        // Gate fails OPEN on unexpected errors — never strand a live crew.
      }
    }

    // ── Same-day SEQUENCE gate (founder Aug 2: multiple jobs per operator
    // per day, sequenced). If today's per-day ledger gives this operator a
    // LOWER-sequence job that isn't finished for the day yet, they cannot
    // start this one (in_route / in_progress). What blocks is decided by
    // lib/reassign.sequenceBlocks: NOT blocked by completed/cancelled jobs,
    // jobs parked on_hold, jobs with a day-completed daily log today, or
    // stale ledger rows whose job was moved off today. No ledger rows for
    // this job today → no gate.
    // Fails OPEN on unexpected errors — never strand a live crew.
    if ((status === 'in_route' || status === 'in_progress') && isAssignedOperator && !isAdmin) {
      try {
        const { data: myTodayRows } = await supabaseAdmin
          .from('job_daily_assignments')
          .select('job_order_id, day_sequence')
          .eq('operator_id', user.id)
          .eq('assignment_date', tenantToday);

        const rows = myTodayRows || [];
        const mine = rows.find((r: any) => r.job_order_id === jobId);
        const lowerRows = mine
          ? rows.filter((r: any) => r.job_order_id !== jobId && (r.day_sequence ?? 1) < (mine.day_sequence ?? 1))
          : [];

        if (mine && lowerRows.length > 0) {
          const lowerIds = lowerRows.map((r: any) => r.job_order_id);
          const [lowerJobsRes, doneLogsRes] = await Promise.all([
            supabaseAdmin
              .from('job_orders')
              // scheduled_date/end_date: a job MOVED to another date can leave
              // a stale ledger row for today — sequenceBlocks skips jobs whose
              // window no longer covers today (guardian B4).
              .select('id, job_number, customer_name, status, work_completed_at, scheduled_date, end_date')
              .in('id', lowerIds)
              .eq('tenant_id', existingJob.tenant_id || ''),
            supabaseAdmin
              .from('daily_job_logs')
              .select('job_order_id')
              .in('job_order_id', lowerIds)
              .eq('log_date', tenantToday)
              .not('day_completed_at', 'is', null),
          ]);
          // Fail OPEN if EITHER query errored — a failed done-log lookup must
          // not make a day-completed job look unfinished (guardian NIT1).
          if (lowerJobsRes.error || doneLogsRes.error) {
            console.warn(
              '[job-status] sequence gate lookup failed — failing open:',
              lowerJobsRes.error?.message || doneLogsRes.error?.message
            );
            throw new Error('sequence gate lookup failed');
          }
          const doneToday = new Set((doneLogsRes.data || []).map((l: any) => l.job_order_id));
          const blocking = (lowerJobsRes.data || []).find((j: any) =>
            sequenceBlocks(j, doneToday.has(j.id), tenantToday)
          );
          if (blocking) {
            const seq = rows.find((r: any) => r.job_order_id === blocking.id)?.day_sequence ?? 1;
            return NextResponse.json(
              {
                error: `Complete ${blocking.job_number} (${blocking.customer_name}) first — it's your #${seq} job today. This one starts after it's done.`,
                block_type: 'sequence_block',
                first_job: {
                  id: blocking.id,
                  job_number: blocking.job_number,
                  customer_name: blocking.customer_name,
                },
              },
              { status: 403 }
            );
          }
        }
      } catch {
        // Gate fails OPEN — sequencing must never strand a live crew.
      }
    }

    // Prepare update data with automatic timestamp tracking
    const updateData: any = {
      status,
    };

    const now = new Date().toISOString();

    // Set timestamps based on status change
    if (status === 'in_route' && !existingJob.route_started_at) {
      updateData.route_started_at = now;
      updateData.route_start_latitude = latitude;
      updateData.route_start_longitude = longitude;
      // If departure_time is provided, save it
      if (departure_time) {
        updateData.departure_time = departure_time;
      }
    }

    // NOTE: in_route_at / work_completed_at are NO LONGER stamped via this
    // shared update. They are the notification-dedup keys, so they're written
    // by a separate atomically-guarded update below (claimTransition) whose
    // RETURNING result tells us whether THIS request actually performed the
    // transition. Stamping them here (read-then-write off the pre-update row)
    // is racy: two concurrent identical POSTs both read null and both notify.

    // Set arrived_at_jobsite_at on first transition to on_site
    if (status === 'on_site' && !existingJob.arrived_at_jobsite_at) {
      updateData.arrived_at_jobsite_at = now;
    }

    if (status === 'in_progress' && !existingJob.work_started_at) {
      updateData.work_started_at = now;
      updateData.work_start_latitude = latitude;
      updateData.work_start_longitude = longitude;
      // The operator flow no longer has a separate "Arrived" (on_site) tap — it
      // goes in_route → in_progress directly. Stamp arrival = work start so the
      // admin/portal/signature timelines still show a real arrival time.
      if (!existingJob.arrived_at_jobsite_at) {
        updateData.arrived_at_jobsite_at = now;
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Atomically CLAIM the first transition into in_route / completed.
    //
    // in_route_at and work_completed_at are the customer-notification dedup
    // keys. To make "first transition" detection retry/race-safe, we set them
    // with a guarded update that only writes when the column is currently NULL
    // (`.is(col, null)`), and we use RETURNING to see if a row was affected.
    // Exactly ONE of two concurrent identical POSTs wins the claim; only the
    // winner gets a returned row and only the winner notifies the customer.
    // ─────────────────────────────────────────────────────────────────────
    let claimedInRoute = false;
    let claimedCompleted = false;

    if (status === 'in_route' && !existingJob.in_route_at) {
      let claimQuery = supabaseAdmin
        .from('job_orders')
        .update({ in_route_at: now })
        .eq('id', jobId)
        .is('in_route_at', null);
      if (tenantId) claimQuery = claimQuery.eq('tenant_id', tenantId);
      const { data: claimRows } = await claimQuery.select('id');
      claimedInRoute = !!(claimRows && claimRows.length > 0);
    }

    if (status === 'completed' && !existingJob.work_completed_at) {
      let claimQuery = supabaseAdmin
        .from('job_orders')
        .update({ work_completed_at: now })
        .eq('id', jobId)
        .is('work_completed_at', null);
      if (tenantId) claimQuery = claimQuery.eq('tenant_id', tenantId);
      const { data: claimRows } = await claimQuery.select('id');
      claimedCompleted = !!(claimRows && claimRows.length > 0);
    }

    // Only the request that actually claimed the completion transition writes
    // the completion-side fields + runs the (idempotent-but-redundant) daily-log
    // aggregation. This mirrors the prior "first completed" gate, now race-safe.
    if (claimedCompleted) {
      updateData.work_end_latitude = latitude;
      updateData.work_end_longitude = longitude;

      // Aggregate total hours and days worked from all daily_job_logs for this job
      try {
        const { data: logsAgg } = await supabaseAdmin
          .from('daily_job_logs')
          .select('hours_worked, log_date')
          .eq('job_order_id', jobId);

        if (logsAgg && logsAgg.length > 0) {
          const totalHours = logsAgg.reduce(
            (sum: number, log: any) => sum + (Number(log.hours_worked) || 0),
            0
          );
          // DISTINCT calendar dates, NOT row count: on a crew job the operator
          // AND the helper each log the same day (one row apiece), so
          // logs.length is ~2× the real day count (caught by the 60-day
          // stress test, Jul 12). Matches the DB trigger's own definition.
          const distinctDays = new Set(logsAgg.map((l: any) => String(l.log_date))).size;
          updateData.total_hours_worked = Number(totalHours.toFixed(2));
          updateData.total_days_worked = distinctDays;
          updateData.is_multi_day = distinctDays > 1;
        }
      } catch (aggErr) {
        // Non-fatal — aggregation is best-effort
        console.warn('Failed to aggregate daily logs on completion:', aggErr);
      }
    }

    // Allow additional known fields to be updated (whitelisted for safety)
    const allowedExtraFields = [
      // Liability release fields
      'liability_release_signed_by', 'liability_release_signature',
      'liability_release_signed_at', 'liability_release_customer_name',
      'liability_release_customer_email',
      // Customer signature / completion fields
      'completion_signature', 'completion_signer_name', 'completion_signed_at',
      'completion_notes', 'contact_not_on_site',
      // Canonical customer-signature columns (must mirror the remote-sign path
      // in app/api/public/signature/[token]/route.ts so onsite-signed jobs are
      // queryable by the same columns as remote-signed ones).
      'customer_signature', 'customer_signed_at', 'customer_signature_method',
      'customer_cleanliness_rating', 'customer_communication_rating',
      'customer_overall_rating', 'customer_feedback_comments',
      // Work order agreement fields
      'work_order_signed', 'work_order_signature', 'work_order_signer_name',
      'work_order_signer_title', 'work_order_signed_at',
      'cut_through_authorized', 'cut_through_signature',
      // Arrival time
      'arrival_time',
      // Job feedback fields
      'job_difficulty_rating', 'job_access_rating',
      'job_difficulty_notes', 'job_access_notes',
      'feedback_submitted_at',
      // Equipment confirmation tracking (per-operator)
      'equipment_confirmed_by',
      // Job survey (smart post-work survey)
      'job_survey',
    ];

    // Client-supplied timestamp fields that must be validated/clamped against
    // the server clock — a corrupted/retried request could otherwise write a
    // far-future or wildly-backdated time. Invalid values fall back to `now`.
    const clientTimestampFields = new Set<string>([
      'liability_release_signed_at',
      'completion_signed_at',
      'work_order_signed_at',
      'feedback_submitted_at',
    ]);

    const nowDate = new Date(now);
    for (const field of allowedExtraFields) {
      if (additionalFields[field] === undefined) continue;
      if (clientTimestampFields.has(field)) {
        // Prefer the validated client time; if it's corrupt/out-of-range,
        // stamp server-side now() instead of trusting the client.
        updateData[field] =
          validateTransitionTimestamp(additionalFields[field], nowDate) ?? now;
      } else {
        updateData[field] = additionalFields[field];
      }
    }

    // Update job order (scoped to tenant)
    let updatedJob: any = null;
    /** Set when the DB refused some columns — surfaced so nothing claims a clean save. */
    let partialSaveWarning: { dropped_fields: string[]; reason: string } | null = null;
    let fullUpdateQuery = supabaseAdmin
      .from('job_orders')
      .update(updateData)
      .eq('id', jobId);
    if (tenantId) fullUpdateQuery = fullUpdateQuery.eq('tenant_id', tenantId);
    const { data: fullUpdateResult, error: updateError } = await fullUpdateQuery.select().single();

    if (updateError) {
      // ── THE SILENT FALLBACK THAT ATE EVERY SIGNATURE ────────────────────
      // This used to catch an unknown-column error, quietly retry with
      // `{status}` ALONE, and return HTTP 200. The operator saw "Job Complete"
      // while the customer's signature, the signer's name, customer_signed_at
      // and total_hours_worked were all thrown away — which is why NOT ONE
      // signature existed in production across every completed job.
      //
      // An unknown column is a BUG (a migration that never ran), not a
      // condition to paper over. The fallback still runs so the job isn't left
      // in a wrong STATUS mid-flow, but it now names the columns it dropped,
      // reports them to the caller, and — critically — is loud enough to
      // notice. Silence on the path that carries a signed record is a defect.
      const errMsg = (updateError.message || '').toLowerCase();
      if (errMsg.includes('column') || errMsg.includes('does not exist') || errMsg.includes('undefined')) {
        const droppedFields = Object.keys(updateData).filter((k) => k !== 'status');
        console.error(
          '[status] SCHEMA DRIFT — the job_orders update was rejected and these fields were DROPPED:',
          droppedFields.join(', '),
          '| postgres said:', updateError.message
        );
        let fallbackQuery = supabaseAdmin
          .from('job_orders')
          .update({ status })
          .eq('id', jobId);
        if (tenantId) fallbackQuery = fallbackQuery.eq('tenant_id', tenantId);
        const { data: fallbackResult, error: fallbackError } = await fallbackQuery.select().single();

        if (fallbackError) {
          console.error('Fallback status update also failed:', fallbackError);
          return NextResponse.json(
            { error: 'Failed to update job order status' },
            { status: 500 }
          );
        }
        updatedJob = fallbackResult;
        // Tell the caller the truth so a UI can stop claiming success.
        partialSaveWarning = {
          dropped_fields: droppedFields,
          reason: updateError.message,
        };
      } else {
        console.error('Error updating job order status:', updateError);
        return NextResponse.json(
          { error: 'Failed to update job order status' },
          { status: 500 }
        );
      }
    } else {
      updatedJob = fullUpdateResult;
    }

    // Also update operator_status_history for tracking
    const historyData: any = {
      operator_id: user.id,
      job_order_id: jobId,
      status: status,
    };

    // Set appropriate timestamps based on status
    if (status === 'in_route') {
      historyData.route_started_at = now;
    } else if (status === 'in_progress') {
      historyData.work_started_at = now;
    } else if (status === 'completed') {
      historyData.work_completed_at = now;
    }

    // Upsert to operator_status_history — gracefully handle missing table
    const { error: historyUpsertError } = await supabaseAdmin
      .from('operator_status_history')
      .upsert(historyData, {
        onConflict: 'operator_id,job_order_id'
      });

    if (historyUpsertError) {
      // operator_status_history is optional — log but never block
      console.log('Operator status history skipped (table may not exist):', historyUpsertError.message || historyUpsertError.code || 'unknown');
    }

    // Always record an authoritative job_status_history row on a real status
    // change. Canonical columns (verified against the live schema):
    //   job_id, old_status, new_status, changed_by, changed_at, notes
    // Non-blocking, but failures are logged (NOT swallowed silently) so a
    // missing history row is observable rather than invisible.
    if (currentStatus !== status) {
      const { error: jobHistoryError } = await supabaseAdmin
        .from('job_status_history')
        .insert({
          job_id: jobId,
          old_status: currentStatus,
          new_status: status,
          changed_by: user.id,
          changed_at: now,
        });

      if (jobHistoryError) {
        console.error(
          `[job-status] FAILED to write job_status_history for job ${jobId} ` +
            `(${currentStatus} -> ${status}):`,
          jobHistoryError.message || jobHistoryError.code || jobHistoryError
        );
      }
    }

    // Fire-and-forget salesperson notifications on key status transitions.
    try {
      const oldStatus = existingJob.status;
      const salespersonId = existingJob.created_by;
      if (salespersonId) {
        if (status === 'in_progress' && oldStatus !== 'in_progress') {
          notifySalesperson({
            event: 'job_active',
            jobOrderId: jobId,
            recipientUserId: salespersonId,
            tenantId: existingJob.tenant_id || null,
            subjectName: existingJob.job_number || jobId,
            customerName: existingJob.customer_name || undefined,
          }).catch(() => {});
        } else if (status === 'completed' && oldStatus !== 'completed') {
          notifySalesperson({
            event: 'job_completed',
            jobOrderId: jobId,
            recipientUserId: salespersonId,
            tenantId: existingJob.tenant_id || null,
            subjectName: existingJob.job_number || jobId,
            customerName: existingJob.customer_name || undefined,
          }).catch(() => {});
        }
      }
    } catch {
      // never block on notification dispatch
    }

    // Fire-and-forget CUSTOMER notifications (email always if present + best-effort
    // SMS). Dedup: only fire on the FIRST real transition into the state. We key
    // off the ATOMIC CLAIM above (the guarded `.is(col, null)` update that wrote
    // in_route_at / work_completed_at) — `claimedInRoute` / `claimedCompleted`
    // are true ONLY for the single request that actually performed the
    // transition. Two near-simultaneous identical POSTs → exactly one claim →
    // exactly one customer email. (Previously this read the pre-update row, so
    // both racers saw null and both notified.) No-ops when there's no customer
    // email/phone. Reuses the customer_portal_tokens magic-link.
    try {
      const firstInRoute = claimedInRoute;
      const firstCompleted = claimedCompleted;
      if (firstInRoute || firstCompleted) {
        notifyCustomer({
          event: firstInRoute ? 'en_route' : 'completed',
          job: {
            id: jobId,
            tenant_id: existingJob.tenant_id || null,
            customer_name: existingJob.customer_name,
            customer_email: existingJob.customer_email,
            site_contact_phone: existingJob.site_contact_phone,
            foreman_phone: existingJob.foreman_phone,
            customer_contact: existingJob.customer_contact,
            job_number: existingJob.job_number,
            address: existingJob.address,
            location: existingJob.location,
          },
          triggeredBy: user.id,
        }).catch(() => {});
      }
    } catch {
      // never block on customer-notification dispatch
    }

    return NextResponse.json(
      {
        success: true,
        message: `Job status updated to: ${status}`,
        data: updatedJob,
        // Non-null when the database refused part of the payload. Callers that
        // record something legally meaningful (a signature) must NOT report a
        // clean save when this is present.
        partial_save: partialSaveWarning,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in update job status route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Export POST, PUT, and PATCH handlers (day-complete page uses PATCH)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return updateJobStatus(request, params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return updateJobStatus(request, params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return updateJobStatus(request, params);
}
