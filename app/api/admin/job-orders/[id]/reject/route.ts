export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/admin/job-orders/[id]/reject
 * Super admin rejects a pending schedule form submission.
 *
 * Body: { rejection_reason, rejection_notes }
 * - Sets job status to 'rejected'
 * - Fills rejection fields on job_orders
 * - Creates schedule_form_submissions entry (action: 'rejected')
 * - Creates schedule_notifications for the form submitter
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin, isTableNotFoundError } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

const VALID_REASONS = [
  'missing_info',
  'incorrect_scope',
  'budget_issue',
  'scheduling_conflict',
  'compliance_issue',
  'other',
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await requireSuperAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const body = await request.json();
    const { rejection_reason, rejection_notes } = body;

    // Validate
    if (!rejection_reason || !VALID_REASONS.includes(rejection_reason)) {
      return NextResponse.json(
        { error: `Invalid rejection_reason. Must be one of: ${VALID_REASONS.join(', ')}` },
        { status: 400 }
      );
    }
    if (!rejection_notes?.trim()) {
      return NextResponse.json(
        { error: 'rejection_notes is required' },
        { status: 400 }
      );
    }

    // Fetch the job order.
    //
    // NO EMBED HERE — deliberately. This used to select
    // `'*, profiles:created_by(id, full_name, email)'`, but job_orders.created_by
    // is a foreign key to auth.users, NOT to public.profiles. PostgREST cannot
    // resolve that relationship, so it failed the WHOLE query with PGRST200 and
    // this route answered "Job order not found" for every single rejection.
    // Rejecting a project manager's ticket was impossible, and the error message
    // pointed at the wrong thing entirely.
    let jobQuery = supabaseAdmin.from('job_orders').select('*').eq('id', id);
    jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: jobOrder, error: fetchError } = await jobQuery.maybeSingle();

    if (fetchError) {
      console.error('[reject] job fetch failed', { id, fetchError });
      return NextResponse.json(
        { error: 'Could not load that job order.', details: fetchError.message },
        { status: 500 }
      );
    }
    if (!jobOrder) {
      return NextResponse.json({ error: 'Job order not found' }, { status: 404 });
    }

    // The submitter's profile, fetched separately (see above).
    let submitterName: string | null = null;
    if (jobOrder.created_by) {
      const { data: submitterProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', jobOrder.created_by)
        .maybeSingle();
      submitterName = submitterProfile?.full_name ?? null;
    }

    if (jobOrder.status !== 'pending_approval') {
      return NextResponse.json(
        { error: `Cannot reject a job with status '${jobOrder.status}'. Only pending_approval jobs can be rejected.` },
        { status: 400 }
      );
    }

    // Get rejector profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.userId)
      .single();

    const rejectorName = profile?.full_name || auth.userEmail;

    // Update job order to rejected
    const { data: updatedJob, error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update({
        status: 'rejected',
        rejection_reason,
        rejection_notes: rejection_notes.trim(),
        rejected_by: auth.userId,
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error rejecting job order:', updateError);
      return NextResponse.json({ error: 'Failed to reject job order' }, { status: 500 });
    }

    // Create schedule_form_submissions entry
    Promise.resolve(
      supabaseAdmin.from('schedule_form_submissions').insert({
        job_order_id: id,
        submitted_by: auth.userId,
        submitted_by_name: rejectorName,
        action: 'rejected',
        notes: `Reason: ${rejection_reason}. ${rejection_notes.trim()}`,
        form_snapshot: updatedJob,
      })
    ).catch(() => {});

    // Create notification for the form submitter
    const submitterId = jobOrder.created_by;
    if (submitterId) {
      const reasonLabels: Record<string, string> = {
        missing_info: 'Missing Information',
        incorrect_scope: 'Incorrect Scope',
        budget_issue: 'Budget Issue',
        scheduling_conflict: 'Scheduling Conflict',
        compliance_issue: 'Compliance Issue',
        other: 'Other',
      };

      const label = reasonLabels[rejection_reason] || rejection_reason;
      const whatWasWrong = `${label}: ${rejection_notes.trim()}`;
      // Reopens the SAME submission with everything they entered still in it —
      // the schedule form already supports ?editJobId. They fix what was
      // flagged and resubmit; they never retype the ticket.
      const reopenUrl = `/dashboard/admin/schedule-form?editJobId=${id}`;

      // AWAITED. This notification IS the hand-back — if it silently fails the
      // project manager never learns their ticket was rejected and the job just
      // stops. It is not a side effect.
      const { error: schedNotifError } = await supabaseAdmin
        .from('schedule_notifications')
        .insert({
          recipient_id: submitterId,
          recipient_name: submitterName,
          job_order_id: id,
          tenant_id: tenantId,
          type: 'rejected',
          title: `Sent back: ${jobOrder.job_number} — ${jobOrder.customer_name}`,
          message: `${rejectorName} sent this back. ${whatWasWrong}`,
          metadata: {
            rejection_reason,
            rejection_notes: rejection_notes.trim(),
            rejected_by_name: rejectorName,
            reopen_url: reopenUrl,
          },
        });
      if (schedNotifError) {
        console.error('[reject] schedule notification failed', schedNotifError);
      }

      // ALSO into `notifications` — that is what the bell reads. Writing only
      // to schedule_notifications is why hand-backs went unseen before.
      const { error: bellError } = await supabaseAdmin.from('notifications').insert({
        user_id: submitterId,
        tenant_id: tenantId,
        job_id: id,
        type: 'warning',
        priority: 'high',
        title: `Ticket sent back: ${jobOrder.job_number}`,
        message: `${rejectorName} sent your ticket back. ${whatWasWrong} Tap to reopen your form and fix it.`,
        action_url: reopenUrl,
        action_type: 'reopen_schedule_form',
      });
      if (bellError) {
        console.error('[reject] bell notification failed', bellError);
      }
    }

    // Audit — awaited and checked. This was fire-and-forget AND used a
    // change_type the CHECK constraint rejected, so every rejection went
    // unrecorded: there was no way to see who sent a ticket back, or why.
    const { error: rejectAuditError } = await supabaseAdmin
      .from('job_orders_history')
      .insert({
        job_order_id: id,
        job_number: jobOrder.job_number,
        changed_by: auth.userId,
        changed_by_name: rejectorName,
        changed_by_role: 'super_admin',
        change_type: 'rejected',
        changes: {
          status: { old: 'pending_approval', new: 'rejected' },
          rejection_reason: { old: null, new: rejection_reason },
          rejection_notes: { old: null, new: rejection_notes.trim() },
        },
        snapshot: updatedJob,
      });
    if (rejectAuditError) {
      console.error('[reject] AUDIT WRITE FAILED', { id, rejectAuditError });
    }

    return NextResponse.json({
      success: true,
      message: `Sent back to ${submitterName || 'the submitter'}. They can reopen their form and fix it.`,
      data: updatedJob,
    });
  } catch (error: any) {
    console.error('Unexpected error in reject route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
