export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/jobs/[id]/completion-request
 * Admin reviews and approves or rejects a job completion request.
 *
 * GET — requireSalesStaff; returns the latest completion request for the job
 * PUT — requireSalesStaff; approve or reject
 *   Body: { action: 'approve' | 'reject', review_notes?: string }
 *
 * On approve:
 *   - completion_requests.status = 'approved'
 *   - job_orders.status = 'completed', actual_end_date = today
 *   - Notify operator
 *
 * On reject:
 *   - completion_requests.status = 'rejected'
 *   - job_orders.status = 'in_progress', clear completion_submitted_at
 *   - Notify operator
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    const { data: completionRequest, error } = await supabaseAdmin
      .from('job_completion_requests')
      .select(`
        id,
        status,
        operator_notes,
        submitted_at,
        review_notes,
        reviewed_at,
        submitted_by,
        reviewed_by,
        profiles!job_completion_requests_submitted_by_fkey(full_name, email)
      `)
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // No request found — return null gracefully
      if (error.code === 'PGRST116') {
        return NextResponse.json({ success: true, data: null });
      }
      console.error('Error fetching completion request:', error);
      return NextResponse.json({ error: 'Failed to fetch completion request' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: completionRequest.id,
        status: completionRequest.status,
        operator_notes: completionRequest.operator_notes,
        submitted_at: completionRequest.submitted_at,
        review_notes: completionRequest.review_notes,
        reviewed_at: completionRequest.reviewed_at,
        submitted_by: completionRequest.submitted_by,
        submitted_by_name: (completionRequest.profiles as any)?.full_name ?? null,
        submitted_by_email: (completionRequest.profiles as any)?.email ?? null,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /completion-request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PUT ─────────────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    const body = await request.json();

    const { action, review_notes } = body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Fetch the latest pending completion request for this job
    const { data: completionRequest, error: fetchError } = await supabaseAdmin
      .from('job_completion_requests')
      .select('id, status, submitted_by, job_order_id')
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !completionRequest) {
      return NextResponse.json(
        { error: 'No pending completion request found for this job' },
        { status: 404 }
      );
    }

    // Fetch the job for the job_number
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('job_number')
      .eq('id', jobId)
      .eq('tenant_id', tenantId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    if (action === 'approve') {
      // Update completion request
      const { error: updateReqError } = await supabaseAdmin
        .from('job_completion_requests')
        .update({
          status: 'approved',
          reviewed_by: auth.userId,
          reviewed_at: now,
          review_notes: review_notes || null,
          updated_at: now,
        })
        .eq('id', completionRequest.id);

      if (updateReqError) {
        console.error('Error approving completion request:', updateReqError);
        return NextResponse.json({ error: 'Failed to approve request' }, { status: 500 });
      }

      // Update job status to completed
      const { error: updateJobError } = await supabaseAdmin
        .from('job_orders')
        .update({
          status: 'completed',
          actual_end_date: today,
          updated_at: now,
        })
        .eq('id', jobId)
        .eq('tenant_id', tenantId);

      if (updateJobError) {
        console.error('Error updating job to completed:', updateJobError);
        // Non-fatal — continue and notify
      }

      // Notify the operator
      Promise.resolve(
        supabaseAdmin.from('notifications').insert({
          tenant_id: tenantId,
          user_id: completionRequest.submitted_by,
          type: 'job_approved',
          notification_type: 'job_approved',
          title: 'Job Completion Approved',
          message: `Your job ${job.job_number} has been approved as complete.${review_notes ? ' Note: ' + review_notes : ''}`,
          action_url: `/dashboard/my-jobs`,
          related_entity_type: 'job_order',
          related_entity_id: jobId,
          is_read: false,
          read: false,
          created_at: now,
        })
      )
        .then(({ error }) => {
          if (error) console.error('Failed to send approval notification:', error);
        })
        .catch(() => {});

      return NextResponse.json({
        success: true,
        data: { action: 'approved', job_id: jobId },
      });
    } else {
      // Reject
      const { error: updateReqError } = await supabaseAdmin
        .from('job_completion_requests')
        .update({
          status: 'rejected',
          reviewed_by: auth.userId,
          reviewed_at: now,
          review_notes: review_notes || null,
          updated_at: now,
        })
        .eq('id', completionRequest.id);

      if (updateReqError) {
        console.error('Error rejecting completion request:', updateReqError);
        return NextResponse.json({ error: 'Failed to reject request' }, { status: 500 });
      }

      // Revert job back to in_progress and clear completion_submitted_at
      const { error: updateJobError } = await supabaseAdmin
        .from('job_orders')
        .update({
          status: 'in_progress',
          completion_submitted_at: null,
          updated_at: now,
        })
        .eq('id', jobId)
        .eq('tenant_id', tenantId);

      if (updateJobError) {
        console.error('Error reverting job status:', updateJobError);
      }

      // Notify the operator with rejection reason
      Promise.resolve(
        supabaseAdmin.from('notifications').insert({
          tenant_id: tenantId,
          user_id: completionRequest.submitted_by,
          type: 'job_rejected',
          notification_type: 'job_rejected',
          title: 'Completion Rejected',
          message: `Completion of ${job.job_number} was rejected.${review_notes ? ' Reason: ' + review_notes : ''}`,
          action_url: `/dashboard/my-jobs`,
          related_entity_type: 'job_order',
          related_entity_id: jobId,
          is_read: false,
          read: false,
          created_at: now,
        })
      )
        .then(({ error }) => {
          if (error) console.error('Failed to send rejection notification:', error);
        })
        .catch(() => {});

      return NextResponse.json({
        success: true,
        data: { action: 'rejected', job_id: jobId },
      });
    }
  } catch (error: unknown) {
    console.error('Unexpected error in PUT /completion-request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
