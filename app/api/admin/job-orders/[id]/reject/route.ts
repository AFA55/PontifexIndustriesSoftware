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

    // Fetch the job order
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('*, profiles:created_by(id, full_name, email)')
      .eq('id', id);
    if (tenantId) { jobQuery = jobQuery.eq('tenant_id', tenantId); }
    const { data: jobOrder, error: fetchError } = await jobQuery.single();

    if (fetchError || !jobOrder) {
      return NextResponse.json({ error: 'Job order not found' }, { status: 404 });
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

      Promise.resolve(
        supabaseAdmin.from('schedule_notifications').insert({
          recipient_id: submitterId,
          recipient_name: jobOrder.profiles?.full_name || null,
          job_order_id: id,
          type: 'rejected',
          title: `Rejected: ${jobOrder.job_number} — ${jobOrder.customer_name}`,
          message: `Rejected by ${rejectorName}. Reason: ${reasonLabels[rejection_reason] || rejection_reason}. Notes: ${rejection_notes.trim()}`,
          metadata: {
            rejection_reason,
            rejection_notes: rejection_notes.trim(),
            rejected_by_name: rejectorName,
          },
        })
      ).catch(() => {});
    }

    // Audit log (fire-and-forget)
    Promise.resolve(
      supabaseAdmin.from('job_orders_history').insert({
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
      })
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Job ${jobOrder.job_number} rejected`,
      data: updatedJob,
    });
  } catch (error: any) {
    console.error('Unexpected error in reject route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
