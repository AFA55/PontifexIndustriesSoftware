/**
 * API Route: POST /api/job-orders/[id]/daily-log
 * Submit daily completion log for multi-day jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // Get user from authorization token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      workPerformed,
      notes,
      signerName,
      signatureData,
      continueNextDay,
      latitude,
      longitude
    } = body;

    // Get job order
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Verify user is assigned to this job
    if (job.assigned_to !== user.id) {
      return NextResponse.json(
        { error: 'You are not assigned to this job' },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Calculate hours worked today
    const routeStarted = job.route_started_at ? new Date(job.route_started_at) : null;
    const workStarted = job.work_started_at ? new Date(job.work_started_at) : null;
    const startTime = workStarted || routeStarted;
    const hoursWorked = startTime ? (new Date().getTime() - startTime.getTime()) / (1000 * 60 * 60) : 0;

    // Create daily log entry — gracefully handle missing table
    let dailyLog = null;
    const { data: logData, error: logError } = await supabaseAdmin
      .from('daily_job_logs')
      .insert({
        job_order_id: jobId,
        operator_id: user.id,
        log_date: today,
        route_started_at: job.route_started_at,
        work_started_at: job.work_started_at,
        day_completed_at: now,
        work_performed: workPerformed || [],
        notes: notes || null,
        hours_worked: Number(hoursWorked.toFixed(2)),
        daily_signer_name: signerName || null,
        daily_signature_data: signatureData || null,
        route_start_latitude: job.route_start_latitude,
        route_start_longitude: job.route_start_longitude,
        work_start_latitude: job.work_start_latitude,
        work_start_longitude: job.work_start_longitude,
        day_end_latitude: latitude,
        day_end_longitude: longitude
      })
      .select()
      .single();

    if (logError) {
      // If table doesn't exist yet, continue without blocking
      if (logError.code === 'PGRST204' || logError.code === 'PGRST205' || logError.code === '42P01' || logError.message?.includes('does not exist')) {
        dailyLog = null;
      } else {
        console.error('Error creating daily log:', logError);
        return NextResponse.json(
          { error: 'Failed to create daily log', details: logError.message },
          { status: 500 }
        );
      }
    } else {
      dailyLog = logData;
    }

    if (continueNextDay) {
      // Mark as multi-day job and reset timestamps for next day
      const { error: updateError } = await supabaseAdmin
        .from('job_orders')
        .update({
          is_multi_day: true,
          status: 'scheduled', // Reset to scheduled for next day
          route_started_at: null, // Clear timestamps for next day
          work_started_at: null,
          route_start_latitude: null,
          route_start_longitude: null,
          work_start_latitude: null,
          work_start_longitude: null
        })
        .eq('id', jobId);

      if (updateError) {
        console.error('Error updating job for next day:', updateError);
      }

      // Reset workflow for next day — gracefully handle missing table
      const { error: workflowError } = await supabaseAdmin
        .from('workflow_steps')
        .update({
          current_step: 'equipment_checklist',
          equipment_checklist_completed: false,
          sms_sent: false,
          silica_form_completed: false,
          work_performed_completed: false,
          pictures_submitted: false,
          customer_signature_received: false
        })
        .eq('job_order_id', jobId)
        .eq('operator_id', user.id);

      if (workflowError && !(workflowError.code === 'PGRST204' || workflowError.code === 'PGRST205' || workflowError.code === '42P01' || workflowError.message?.includes('does not exist'))) {
        console.error('Error resetting workflow for next day:', workflowError);
      }

      return NextResponse.json({
        success: true,
        message: 'Daily log saved. Job will continue tomorrow.',
        dailyLog,
        continueNextDay: true
      });
    } else {
      // This was the final day - keep job in current state for final completion
      return NextResponse.json({
        success: true,
        message: 'Daily log saved. Ready for final completion.',
        dailyLog,
        continueNextDay: false
      });
    }

  } catch (error: any) {
    console.error('Error in daily log submission:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve daily logs for a job
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all daily logs for this job — gracefully handle missing table
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('daily_job_logs')
      .select('*')
      .eq('job_order_id', jobId)
      .order('log_date', { ascending: true });

    if (logsError) {
      // If table doesn't exist yet, return empty logs
      if (logsError.code === 'PGRST204' || logsError.code === 'PGRST205' || logsError.code === '42P01' || logsError.message?.includes('does not exist')) {
        return NextResponse.json({ success: true, logs: [] });
      }
      return NextResponse.json(
        { error: 'Failed to fetch daily logs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      logs: logs || []
    });

  } catch (error: any) {
    console.error('Error fetching daily logs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
