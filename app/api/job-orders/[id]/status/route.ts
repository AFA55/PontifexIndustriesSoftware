/**
 * API Route: POST/PUT /api/job-orders/[id]/status
 * Update job order status with automatic timestamp tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';

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

    // Get user's role
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    // Check permissions: operator can only update their own jobs, admin can update any
    if (profile?.role !== 'admin' && existingJob.assigned_to !== user.id) {
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
            { error: 'Failed to update job order status', details: fallbackError.message },
            { status: 500 }
          );
        }
        updatedJob = fallbackResult;
      } else {
        console.error('Error updating job order status:', updateError);
        return NextResponse.json(
          { error: 'Failed to update job order status', details: updateError.message },
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
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// Export both POST and PUT handlers
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
