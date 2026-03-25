/**
 * POST /api/admin/schedule-board/assign
 * Assign an operator and/or helper to a job order.
 * Access: super_admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit';
import { logApiError } from '@/lib/error-logger';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { jobOrderId, operatorId, helperId } = body;

    if (!jobOrderId) {
      return NextResponse.json(
        { error: 'Missing required field: jobOrderId' },
        { status: 400 }
      );
    }

    // Build update payload
    const updateData: Record<string, unknown> = {
      assigned_to: operatorId || null,
      helper_assigned_to: helperId || null,
      updated_at: new Date().toISOString(),
    };

    // If assigning an operator, set status to 'assigned' and record timestamp
    if (operatorId) {
      updateData.status = 'assigned';
      updateData.assigned_at = new Date().toISOString();
    } else {
      // If removing operator, set back to 'scheduled'
      updateData.status = 'scheduled';
      updateData.assigned_at = null;
    }

    const { data: updated, error } = await supabaseAdmin
      .from('job_orders')
      .update(updateData)
      .eq('id', jobOrderId)
      .select('id, job_number, customer_name, assigned_to, helper_assigned_to, status')
      .single();

    if (error) {
      console.error('Error assigning job:', error);
      return NextResponse.json(
        { error: 'Failed to assign job' },
        { status: 500 }
      );
    }

    // Audit log: job assignment
    logAuditEvent({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: operatorId ? 'assign' : 'unassign',
      resourceType: 'job_order',
      resourceId: jobOrderId,
      details: { operatorId, helperId, jobNumber: updated?.job_number },
      request,
    });

    // Fire-and-forget: notify assigned operator via in-app notification
    if (operatorId && updated) {
      Promise.resolve((async () => {
        // Fetch the full job to build a meaningful message
        const { data: job } = await supabaseAdmin
          .from('job_orders')
          .select('customer_name, location, scheduled_date, arrival_time, job_type')
          .eq('id', jobOrderId)
          .single();

        const scheduledDate = job?.scheduled_date
          ? new Date(job.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          : 'TBD';

        const msg = job
          ? `${job.customer_name} at ${job.location || 'TBD'} on ${scheduledDate}.`
          : `Job ${updated.job_number} has been assigned to you.`;

        await supabaseAdmin.from('schedule_notifications').insert({
          recipient_id: operatorId,
          job_order_id: jobOrderId,
          type: 'job_assigned',
          title: `You've been assigned: ${updated.job_number}`,
          message: msg,
          metadata: {
            job_number: updated.job_number,
            customer_name: job?.customer_name,
            location: job?.location,
            scheduled_date: job?.scheduled_date,
            arrival_time: job?.arrival_time,
            job_type: job?.job_type,
          },
        });
      })()).catch(() => {});
    }

    // Fire-and-forget: notify assigned helper
    if (helperId && updated) {
      Promise.resolve((async () => {
        const { data: job } = await supabaseAdmin
          .from('job_orders')
          .select('customer_name, location, scheduled_date, arrival_time')
          .eq('id', jobOrderId)
          .single();

        const scheduledDate = job?.scheduled_date
          ? new Date(job.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          : 'TBD';

        await supabaseAdmin.from('schedule_notifications').insert({
          recipient_id: helperId,
          job_order_id: jobOrderId,
          type: 'job_assigned',
          title: `You've been assigned as helper: ${updated.job_number}`,
          message: job
            ? `${job.customer_name} at ${job.location || 'TBD'} on ${scheduledDate} (helper role).`
            : `Job ${updated.job_number} — assigned as helper.`,
          metadata: {
            job_number: updated.job_number,
            is_helper: true,
          },
        });
      })()).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: 'Job assigned successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/schedule-board/assign:', error);
    logApiError({ endpoint: '/api/admin/schedule-board/assign', method: 'POST', error: error as Error, userId: undefined, request });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
