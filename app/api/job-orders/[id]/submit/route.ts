/**
 * API Route: PUT /api/job-orders/[id]/submit
 * Submit job completion data from operator
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    // Check permissions: operator can only submit data for their own jobs
    if (existingJob.assigned_to !== user.id) {
      return NextResponse.json(
        { error: 'You can only submit data for jobs assigned to you' },
        { status: 403 }
      );
    }

    // Prepare submission data
    const submissionData: any = {
      status: 'completed',
    };

    // Add work completion timestamp if not already set
    if (!existingJob.work_completed_at) {
      submissionData.work_completed_at = new Date().toISOString();
    }

    // Add operator submission fields
    if (body.work_performed !== undefined) {
      submissionData.work_performed = body.work_performed;
    }

    if (body.materials_used !== undefined) {
      submissionData.materials_used = body.materials_used;
    }

    if (body.equipment_used !== undefined) {
      submissionData.equipment_used = body.equipment_used;
    }

    if (body.operator_notes !== undefined) {
      submissionData.operator_notes = body.operator_notes;
    }

    if (body.issues_encountered !== undefined) {
      submissionData.issues_encountered = body.issues_encountered;
    }

    if (body.customer_signature !== undefined) {
      submissionData.customer_signature = body.customer_signature;
      submissionData.customer_signed_at = new Date().toISOString();
    }

    if (body.customer_satisfied !== undefined) {
      submissionData.customer_satisfied = body.customer_satisfied;
    }

    if (body.photo_urls !== undefined && Array.isArray(body.photo_urls)) {
      submissionData.photo_urls = body.photo_urls;
    }

    // Add location data if provided
    if (body.latitude && body.longitude) {
      submissionData.work_end_latitude = body.latitude;
      submissionData.work_end_longitude = body.longitude;
    }

    // Update job order with submission data
    const { data: updatedJob, error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update(submissionData)
      .eq('id', jobId)
      .select()
      .single();

    if (updateError) {
      console.error('Error submitting job completion data:', updateError);
      return NextResponse.json(
        { error: 'Failed to submit job completion data', details: updateError.message },
        { status: 500 }
      );
    }

    // Update operator status history — gracefully handle missing table
    const { error: statusHistoryError } = await supabaseAdmin
      .from('operator_status_history')
      .insert({
        user_id: user.id,
        status: 'job_completed',
        latitude: body.latitude,
        longitude: body.longitude,
        accuracy: body.accuracy,
        job_id: jobId,
        notes: 'Job completed and data submitted',
      });

    if (statusHistoryError && !(statusHistoryError.code === 'PGRST204' || statusHistoryError.code === 'PGRST205' || statusHistoryError.code === '42P01' || statusHistoryError.message?.includes('does not exist'))) {
      console.error('Error updating operator status history:', statusHistoryError);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Job completion data submitted successfully',
        data: updatedJob,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in submit job route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
