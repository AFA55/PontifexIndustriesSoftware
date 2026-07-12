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
    let fullUpdateQuery = supabaseAdmin
      .from('job_orders')
      .update(updateData)
      .eq('id', jobId);
    if (tenantId) fullUpdateQuery = fullUpdateQuery.eq('tenant_id', tenantId);
    const { data: fullUpdateResult, error: updateError } = await fullUpdateQuery.select().single();

    if (updateError) {
      // If the error is about unknown columns, retry with just the status field
      const errMsg = (updateError.message || '').toLowerCase();
      if (errMsg.includes('column') || errMsg.includes('does not exist') || errMsg.includes('undefined')) {
        console.log('Full update failed (likely missing columns), retrying with status only:', updateError.message);
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
