export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/jobs/[id]/office-complete
 *
 * Management closes out a job the operator never closed, and says why.
 *
 * WHY THIS EXISTS (founder, Aug 2026): the BWC job finished on site but never
 * finished in the software. The operator logged three full days and pressed
 * "Done for Today" each time, never "Complete Job", so the customer-facing job
 * sat open with no way for the office to close it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO — this is the important part:
 *   • It does NOT touch the operator's completion fields. His record is his.
 *   • It does NOT wipe the job off his schedule. It stays on the days he worked
 *     so he can look back at what he did.
 *   • It does NOT lock him out mid-day. He can finish the day he is on; the
 *     ticket goes read-only once that day is submitted (see canOperatorEdit in
 *     lib/office-completion.ts).
 * Closing the office side must never cost us the work record — collecting that
 * record is the whole point of the ticket.
 *
 * DELETE /api/admin/jobs/[id]/office-complete reverses it (closed by mistake).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Who may close a job on the office's behalf.
 * Supervisors are included on the founder's instruction — they are on site and
 * usually the first to know a job actually finished. Operators are NOT: the
 * whole point is that this is the path for when the operator didn't do it.
 */
const CAN_OFFICE_COMPLETE = ['admin', 'super_admin', 'operations_manager', 'supervisor'];

const MAX_REASON = 1000;

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    if (!CAN_OFFICE_COMPLETE.includes(auth.role || '')) {
      return NextResponse.json(
        { error: 'Only office staff, an operations manager or a supervisor can close a job this way.' },
        { status: 403 }
      );
    }

    const { id: jobId } = await context.params;
    const tenantId = await getTenantId(auth.userId);
    const body = await request.json().catch(() => ({}));

    // The reason is the point of the feature — a close with no explanation is
    // just a job that vanished.
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return NextResponse.json(
        { error: 'Please say why you are closing this job.' },
        { status: 400 }
      );
    }
    if (reason.length > MAX_REASON) {
      return NextResponse.json(
        { error: `Keep the reason under ${MAX_REASON} characters.` },
        { status: 400 }
      );
    }

    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, job_number, status, assigned_to, tenant_id, office_completed_at')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job } = await jobQuery.maybeSingle();

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (job.office_completed_at) {
      return NextResponse.json(
        { error: 'This job has already been closed by the office.' },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update({
        office_completed_at: now,
        office_completed_by: auth.userId,
        office_completion_reason: reason,
        // The job is done as far as the customer and the schedule are
        // concerned. The operator's own completion fields are untouched.
        status: 'completed',
        work_completed_at: now,
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('[office-complete] update failed:', updateError);
      return NextResponse.json(
        { error: 'Could not close the job. Nothing was changed — try again.' },
        { status: 500 }
      );
    }

    // Audit — who closed it, when, and why. AWAITED, not fire-and-forget:
    // this is the record of a management decision about someone else's work,
    // and a detached promise can be killed when the response returns (it was —
    // the first live test wrote zero audit rows). Logging is best-effort;
    // recording WHO closed a job is not.
    const { error: auditError } = await supabaseAdmin.from('job_orders_history').insert({
      job_order_id: jobId,
      job_number: job.job_number,
      changed_by: auth.userId,
      changed_by_name: auth.userEmail,
      changed_by_role: auth.role,
      change_type: 'office_completed',
      changes: { reason, previous_status: job.status },
    });
    if (auditError) {
      console.error('[office-complete] AUDIT WRITE FAILED', { jobId, auditError });
    }

    // Tell the operator, so he knows to wrap up his side rather than keep
    // working a job the office considers finished.
    if (job.assigned_to) {
      Promise.resolve(
        supabaseAdmin.from('notifications').insert({
          user_id: job.assigned_to,
          tenant_id: job.tenant_id,
          job_id: jobId,
          type: 'warning',
          priority: 'high',
          title: 'The office closed this job',
          message:
            `${job.job_number || 'This job'} was marked complete by the office: ${reason} ` +
            `Finish the day you're on and submit it — your ticket stays open until you do.`,
          action_url: `/dashboard/my-jobs/${jobId}`,
        })
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: { office_completed_at: now, reason },
      message: 'Job closed. The operator can still submit the day he is on.',
    });
  } catch (error) {
    console.error('Unexpected error in office-complete:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Undo an office close made by mistake. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;
    if (!CAN_OFFICE_COMPLETE.includes(auth.role || '')) {
      return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
    }

    const { id: jobId } = await context.params;
    const tenantId = await getTenantId(auth.userId);

    let q = supabaseAdmin
      .from('job_orders')
      .update({
        office_completed_at: null,
        office_completed_by: null,
        office_completion_reason: null,
        status: 'in_progress',
        work_completed_at: null,
      })
      .eq('id', jobId)
      .not('office_completed_at', 'is', null);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data: rows, error } = await q.select('id');

    if (error) {
      return NextResponse.json({ error: 'Could not reopen the job.' }, { status: 500 });
    }
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'That job was not closed by the office.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Job reopened.' });
  } catch (error) {
    console.error('Unexpected error reopening job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
