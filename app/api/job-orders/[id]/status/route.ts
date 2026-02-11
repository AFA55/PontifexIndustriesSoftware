/**
 * API Route: POST/PUT /api/job-orders/[id]/status
 * Update job order status with automatic timestamp tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

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
    const { status, latitude, longitude, accuracy, departure_time } = body;

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

    // Update job order
    const { data: updatedJob, error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update(updateData)
      .eq('id', jobId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating job order status:', updateError);
      return NextResponse.json(
        { error: 'Failed to update job order status', details: updateError.message },
        { status: 500 }
      );
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

    if (historyUpsertError && !(historyUpsertError.code === 'PGRST204' || historyUpsertError.code === 'PGRST205' || historyUpsertError.code === '42P01' || historyUpsertError.message?.includes('does not exist'))) {
      console.error('Error updating operator status history:', historyUpsertError);
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
