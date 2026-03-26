/**
 * API Route: POST/PUT /api/job-orders/[id]/status
 * Update job order status with automatic timestamp tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isTableNotFoundError } from '@/lib/api-auth';

async function updateJobStatus(
  request: NextRequest,
  params: Promise<{ id: string }>
) {
  try {
    // Await params in Next.js 15+
    const { id: jobId } = await params;

    // SECURITY: Require authenticated user
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Parse request body
    const body = await request.json();
    const { status, latitude, longitude, accuracy, departure_time, ...additionalFields } = body;

    // Validate status
    const validStatuses = ['scheduled', 'assigned', 'in_route', 'in_progress', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if job exists and user has permission
    const { data: existingJob, error: checkError } = await supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', jobId)
      .single();

    if (checkError || !existingJob) {
      return NextResponse.json(
        { error: 'Job order not found' },
        { status: 404 }
      );
    }

    // Check permissions: operator can only update their own jobs, admin roles can update any
    const adminRoles = ['admin', 'super_admin', 'operations_manager'];
    if (!adminRoles.includes(auth.role || '') && existingJob.assigned_to !== auth.userId) {
      return NextResponse.json(
        { error: 'You can only update jobs assigned to you' },
        { status: 403 }
      );
    }

    // Prepare update data with automatic timestamp tracking
    const updateData: any = {
      status,
    };

    const now = new Date().toISOString();

    // Set timestamps based on status change
    // Set loading_started_at when first transitioning from assigned/scheduled to any active state
    if (['in_route', 'in_progress'].includes(status) && !existingJob.loading_started_at) {
      updateData.loading_started_at = now;
    }

    if (status === 'in_route' && !existingJob.route_started_at) {
      updateData.route_started_at = now;
      updateData.route_start_latitude = latitude;
      updateData.route_start_longitude = longitude;
      // If departure_time is provided, save it
      if (departure_time) {
        updateData.departure_time = departure_time;
      }
    }

    if (status === 'in_progress' && !existingJob.work_started_at) {
      updateData.work_started_at = now;
      updateData.work_start_latitude = latitude;
      updateData.work_start_longitude = longitude;
    }

    if (status === 'completed' && !existingJob.work_completed_at) {
      updateData.work_completed_at = now;
      updateData.work_end_latitude = latitude;
      updateData.work_end_longitude = longitude;
    }

    // Set done_for_day_at when status indicates done for the day (but not completed)
    if (additionalFields.done_for_day === true && !existingJob.done_for_day_at) {
      updateData.done_for_day_at = now;
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
      // Done for day flag (sets done_for_day_at)
      'done_for_day',
      // Loading timestamp
      'loading_started_at',
      'done_for_day_at',
    ];

    for (const field of allowedExtraFields) {
      if (additionalFields[field] !== undefined) {
        updateData[field] = additionalFields[field];
      }
    }

    // Update job order
    let updatedJob: any = null;
    const { data: fullUpdateResult, error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update(updateData)
      .eq('id', jobId)
      .select()
      .single();

    if (updateError) {
      // If the error is about unknown columns, retry with just the status field
      const errMsg = (updateError.message || '').toLowerCase();
      if (errMsg.includes('column') || errMsg.includes('does not exist') || errMsg.includes('undefined')) {
        console.log('Full update failed (likely missing columns), retrying with status only:', updateError.message);
        const { data: fallbackResult, error: fallbackError } = await supabaseAdmin
          .from('job_orders')
          .update({ status })
          .eq('id', jobId)
          .select()
          .single();

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

    // Fire-and-forget: notify admins when job is completed
    if (status === 'completed') {
      Promise.resolve((async () => {
        try {
          // Find all admin/super_admin/operations_manager profiles
          const { data: adminProfiles } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name')
            .in('role', ['admin', 'super_admin', 'operations_manager']);

          if (adminProfiles && adminProfiles.length > 0) {
            const notifications = adminProfiles.map(admin => ({
              recipient_id: admin.id,
              recipient_name: admin.full_name,
              job_order_id: jobId,
              type: 'job_completed',
              title: `Job Completed: ${existingJob.job_number || jobId.slice(0, 8)}`,
              message: `${existingJob.customer_name || 'Job'} — ${existingJob.address || existingJob.location || 'Location N/A'} is ready to invoice.`,
            }));
            await supabaseAdmin.from('schedule_notifications').insert(notifications);
          }
        } catch { /* never block */ }
      })()).catch(() => {});
    }

    // Also update operator_status_history for tracking
    const historyData: any = {
      operator_id: auth.userId,
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
