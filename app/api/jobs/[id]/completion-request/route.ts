export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/jobs/[id]/completion-request
 * Operator submits a job for completion approval.
 *
 * POST — authenticated (any logged-in user / operator)
 *   1. Creates a job_completion_requests record
 *   2. Updates job_orders.completion_submitted_at and status = 'pending_completion'
 *   3. Notifies the salesperson / admin who created the job
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    const body = await request.json().catch(() => ({}));
    const { operator_notes } = body;

    // Fetch the job to validate and get job_number / salesperson info
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, status, created_by, assigned_to, tenant_id')
      .eq('id', jobId)
      .eq('tenant_id', tenantId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status === 'completed') {
      return NextResponse.json({ error: 'Job is already completed' }, { status: 409 });
    }

    if (job.status === 'pending_completion') {
      return NextResponse.json(
        { error: 'A completion request is already pending for this job' },
        { status: 409 }
      );
    }

    // Create the completion request record
    const { data: completionRequest, error: createError } = await supabaseAdmin
      .from('job_completion_requests')
      .insert({
        tenant_id: tenantId,
        job_order_id: jobId,
        submitted_by: auth.userId,
        submitted_at: new Date().toISOString(),
        operator_notes: operator_notes || null,
        status: 'pending',
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating completion request:', createError);
      return NextResponse.json({ error: 'Failed to submit completion request' }, { status: 500 });
    }

    // Update job_orders status and completion_submitted_at
    const { error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update({
        status: 'pending_completion',
        completion_submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('Error updating job status to pending_completion:', updateError);
      // Non-fatal — request was created, continue
    }

    // Determine who to notify: created_by is the salesperson/admin who created the job
    const notifyUserId = job.created_by || null;
    if (notifyUserId) {
      Promise.resolve(
        supabaseAdmin.from('notifications').insert({
          tenant_id: tenantId,
          user_id: notifyUserId,
          type: 'completion_review',
          notification_type: 'completion_review',
          title: 'Job Completion Review Required',
          message: `Operator has submitted ${job.job_number} for completion approval. Please review and confirm.`,
          action_url: `/dashboard/admin/jobs/${jobId}`,
          related_entity_type: 'job_order',
          related_entity_id: jobId,
          is_read: false,
          read: false,
          created_at: new Date().toISOString(),
        })
      )
        .then(({ error }) => {
          if (error) console.error('Failed to send completion review notification:', error);
        })
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: {
        request_id: completionRequest.id,
        message: 'Submitted for review',
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in POST /completion-request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
