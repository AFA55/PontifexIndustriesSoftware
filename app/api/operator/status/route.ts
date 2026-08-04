export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/operator/status
 * Update operator status with GPS location
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function POST(request: NextRequest) {
  try {
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
    const { status, latitude, longitude, accuracy, notes, jobId } = body;

    // Validate required fields
    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      );
    }

    // Validate status value
    const validStatuses = ['clocked_in', 'en_route', 'in_progress', 'job_completed', 'clocked_out'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // If a jobId is provided, verify it belongs to the user's tenant
    const tenantId = await getTenantId(user.id);
    if (jobId && tenantId) {
      const { data: jobTenantCheck } = await supabaseAdmin
        .from('job_orders')
        .select('id')
        .eq('id', jobId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (!jobTenantCheck) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
    }

    // Find the user's active timecard — gracefully handle missing table
    let activeTimecard: any = null;
    const { data: timecardData, error: timecardError } = await supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('user_id', user.id)
      .is('clock_out_time', null)
      .order('clock_in_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (timecardError) {
      // If timecards table doesn't exist yet, don't block the status update
      if (isTableNotFoundError(timecardError)) {
        activeTimecard = null;
      } else {
        console.error('Error fetching active timecard:', timecardError);
        return NextResponse.json(
          { error: 'Failed to fetch active timecard' },
          { status: 500 }
        );
      }
    } else {
      activeTimecard = timecardData;
    }

    // Create status history entry — gracefully handle missing table.
    // ONLY these columns exist on operator_status_history: operator_id,
    // job_order_id, status, route_started_at, work_started_at,
    // work_completed_at, tenant_id (+ id/created_at/updated_at). The previous
    // payload named user_id, timecard_id, timestamp, latitude, longitude,
    // accuracy, notes and job_id — eight columns that do not exist — so every
    // insert failed. The failure was then swallowed as "table missing", which
    // is why no operator status has ever been recorded.
    let statusEntry = null;
    const nowIso = new Date().toISOString();
    const { data: statusData, error: statusError } = await supabaseAdmin
      .from('operator_status_history')
      .insert([{
        operator_id: user.id,
        job_order_id: jobId || null,
        status,
        tenant_id: tenantId,
        ...(status === 'in_route' ? { route_started_at: nowIso } : {}),
        ...(status === 'in_progress' ? { work_started_at: nowIso } : {}),
        ...(status === 'completed' ? { work_completed_at: nowIso } : {}),
      }])
      .select()
      .single();

    if (statusError) {
      // If table doesn't exist yet, continue without blocking
      if (isTableNotFoundError(statusError)) {
        statusEntry = null;
      } else {
        console.error('Error creating status entry:', statusError);
        return NextResponse.json(
          { error: 'Failed to update status' },
          { status: 500 }
        );
      }
    } else {
      statusEntry = statusData;
    }

    // If status is 'clocked_out' and we have an active timecard, also clock it out
    if (status === 'clocked_out' && activeTimecard) {
      const now = new Date();
      const clockInTime = new Date(activeTimecard.clock_in_time);
      const milliseconds = now.getTime() - clockInTime.getTime();
      const totalHours = milliseconds / (1000 * 60 * 60);

      await supabaseAdmin
        .from('timecards')
        .update({
          clock_out_time: now.toISOString(),
          clock_out_latitude: latitude || null,
          clock_out_longitude: longitude || null,
          clock_out_accuracy: accuracy || null,
          total_hours: parseFloat(totalHours.toFixed(2)),
          current_status: 'clocked_out',
        })
        .eq('id', activeTimecard.id);
    }

    return NextResponse.json(
      {
        success: true,
        message: `Status updated to: ${status}`,
        data: statusEntry,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in operator status route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * API Route: GET /api/operator/status
 * Get current operator's status
 */
export async function GET(request: NextRequest) {
  try {
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

    // Get latest status — gracefully handle missing table.
    // THE COLUMNS ARE `operator_id` and `created_at`. They were `user_id` and
    // `timestamp` here, neither of which exists, so this threw Postgres 42703
    // on EVERY operator dashboard load — 81 errors across 30 users over 48 days
    // before anyone noticed, because 42703 is not a missing-table error and
    // nothing was alerting.
    let latestStatus = null;
    const { data: statusData, error: statusError } = await supabaseAdmin
      .from('operator_status_history')
      .select('*')
      .eq('operator_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (statusError) {
      // If table doesn't exist yet, return null status (not an error)
      if (isTableNotFoundError(statusError)) {
        latestStatus = null;
      } else {
        console.error('Error fetching status:', statusError);
        return NextResponse.json(
          { error: 'Failed to fetch status' },
          { status: 500 }
        );
      }
    } else {
      latestStatus = statusData;
    }

    return NextResponse.json(
      {
        success: true,
        data: latestStatus,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in get operator status route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
