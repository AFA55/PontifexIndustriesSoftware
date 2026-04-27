export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/job-orders/[id]/daily-log
 * Submit daily completion log for multi-day jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

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

    // Get job order (scoped to tenant)
    const tenantId = await getTenantId(user.id);
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Verify user is assigned to this job (primary operator or helper)
    const isOperator = job.assigned_to === user.id;
    const isHelper = job.helper_assigned_to === user.id;
    if (!isOperator && !isHelper) {
      // Allow admins/managers to bypass assignment check
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const adminRoles = ['admin', 'super_admin', 'operations_manager'];
      const isAdmin = profile && adminRoles.includes(profile.role);

      if (!isAdmin) {
        // Fallback: allow if user has existing daily_job_logs for this job
        // (handles edge cases where assignment changed after work started)
        const { data: existingLog } = await supabaseAdmin
          .from('daily_job_logs')
          .select('id')
          .eq('job_order_id', jobId)
          .eq('operator_id', user.id)
          .limit(1)
          .maybeSingle();
        if (!existingLog) {
          return NextResponse.json(
            { error: 'You are not assigned to this job' },
            { status: 403 }
          );
        }
      }
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
      if (isTableNotFoundError(logError)) {
        dailyLog = null;
      } else {
        console.error('Error creating daily log:', logError);
        return NextResponse.json(
          { error: 'Failed to create daily log' },
          { status: 500 }
        );
      }
    } else {
      dailyLog = logData;
    }

    // Persist work items to work_items table for billing
    if (workPerformed && Array.isArray(workPerformed) && workPerformed.length > 0) {
      const workItemRows = workPerformed.map((item: any) => ({
        job_order_id: jobId,
        operator_id: user.id,
        day_number: dailyLog?.day_number ?? 1,
        work_type: item.work_type || item.type || 'General',
        quantity: Number(item.quantity) || 1,
        core_quantity: item.core_quantity ? Number(item.core_quantity) : null,
        core_size: item.core_size || null,
        core_depth_inches: item.core_depth_inches ? Number(item.core_depth_inches) : null,
        linear_feet_cut: item.linear_feet_cut ? Number(item.linear_feet_cut) : null,
        cut_depth_inches: item.cut_depth_inches ? Number(item.cut_depth_inches) : null,
        accessibility_rating: typeof item.accessibility_rating === 'string'
          ? ({ easy: 1, moderate: 2, medium: 3, difficult: 4, hard: 5 } as Record<string, number>)[item.accessibility_rating] || null
          : item.accessibility_rating ? Number(item.accessibility_rating) : null,
        notes: item.notes || null,
      }));

      // Fire-and-forget — don't block the response on this
      Promise.resolve(
        supabaseAdmin.from('work_items').insert(workItemRows)
      ).then(({ error: wiError }) => {
        if (wiError) console.error('Error saving work items to DB:', wiError);
      }).catch(() => {});
    }

    if (continueNextDay) {
      // Increment total_days_worked and mark as multi-day; reset timestamps for next day
      const nextDayCount = (job.total_days_worked || 0) + 1;
      const { error: updateError } = await supabaseAdmin
        .from('job_orders')
        .update({
          is_multi_day: true,
          total_days_worked: nextDayCount,
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

      // Cancel any pending completion requests so "Awaiting approval" doesn't linger
      await supabaseAdmin
        .from('job_completion_requests')
        .update({ status: 'cancelled' })
        .eq('job_order_id', jobId)
        .eq('status', 'pending');

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

      if (workflowError && !(isTableNotFoundError(workflowError))) {
        console.error('Error resetting workflow for next day:', workflowError);
      }

      return NextResponse.json({
        success: true,
        message: 'Daily log saved. Job will continue tomorrow.',
        dailyLog,
        continueNextDay: true
      });
    } else {
      // This was the final day — if a signer was provided, this is a confirmed on-site
      // completion. Aggregate all daily logs and update job to completed as a fallback
      // (the day-complete page also calls /status PATCH, but this ensures consistency
      // even if that call is skipped or fires out of order).
      if (signerName) {
        try {
          const { data: allLogs } = await supabaseAdmin
            .from('daily_job_logs')
            .select('hours_worked, log_date, work_performed')
            .eq('job_order_id', jobId)
            .order('log_date', { ascending: true });

          const totalHours = (allLogs || []).reduce(
            (sum: number, l: any) => sum + (Number(l.hours_worked) || 0),
            0
          );
          const totalDays = (allLogs || []).length;

          // Fire-and-forget — don't block the response
          Promise.resolve(
            supabaseAdmin
              .from('job_orders')
              .update({
                status: 'completed',
                work_completed_at: now,
                total_hours_worked: Number(totalHours.toFixed(2)),
                total_days_worked: totalDays,
                is_multi_day: totalDays > 1,
                completion_signer_name: signerName,
              })
              .eq('id', jobId)
          ).then(({ error: cErr }) => {
            if (cErr) console.warn('Fallback completion update failed:', cErr.message);
          }).catch(() => {});
        } catch (finalErr) {
          console.warn('Fallback completion aggregation failed:', finalErr);
        }
      }

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
      { error: 'Internal server error' },
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

    // Verify job belongs to user's tenant
    const tenantIdGet = await getTenantId(user.id);
    if (tenantIdGet) {
      const { data: jobCheck } = await supabaseAdmin
        .from('job_orders')
        .select('id')
        .eq('id', jobId)
        .eq('tenant_id', tenantIdGet)
        .maybeSingle();
      if (!jobCheck) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
    }

    // Get all daily logs for this job — gracefully handle missing table
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('daily_job_logs')
      .select('*')
      .eq('job_order_id', jobId)
      .order('log_date', { ascending: true });

    if (logsError) {
      // If table doesn't exist yet, return empty logs
      if (isTableNotFoundError(logsError)) {
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
