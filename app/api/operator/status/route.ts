/**
 * API Route: POST /api/operator/status
 * Update operator status with GPS location
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';

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

    // Create status history entry — gracefully handle missing table
    let statusEntry = null;
    const { data: statusData, error: statusError } = await supabaseAdmin
      .from('operator_status_history')
      .insert([{
        user_id: user.id,
        timecard_id: activeTimecard?.id || null,
        status: status,
        timestamp: new Date().toISOString(),
        latitude: latitude || null,
        longitude: longitude || null,
        accuracy: accuracy || null,
        notes: notes || null,
        job_id: jobId || null,
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
          { error: 'Failed to update status', details: statusError.message },
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
      { error: 'Internal server error', details: error.message },
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

    // Get latest status — gracefully handle missing table
    let latestStatus = null;
    const { data: statusData, error: statusError } = await supabaseAdmin
      .from('operator_status_history')
      .select('*')
      .eq('user_id', user.id)
      .order('timestamp', { ascending: false })
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
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
