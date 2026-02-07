import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { STANDBY_POLICY_VERSION, STANDBY_HOURLY_RATE, calculateStandbyCharge } from '@/lib/legal/standby-policy';

/**
 * POST /api/standby - Start a standby log
 * Body: { jobId, reason, clientName, clientSignature, startedAt }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Authorization required' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { jobId, reason, startedAt } = body;

    // Validate required fields
    if (!jobId || !reason) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: jobId and reason' },
        { status: 400 }
      );
    }

    // Create standby log - jobId is already a UUID
    const { data: standbyLog, error: insertError } = await supabaseAdmin
      .from('standby_logs')
      .insert({
        job_order_id: jobId,
        operator_id: user.id,
        started_at: startedAt || new Date().toISOString(),
        ended_at: null,
        reason: reason,
        status: 'active'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating standby log:', insertError);
      console.error('Insert error details:', JSON.stringify(insertError, null, 2));
      console.error('Request body was:', { jobId, reason, startedAt, user_id: user.id });
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create standby log',
          details: insertError.message,
          code: insertError.code,
          hint: insertError.hint
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: standbyLog
    });

  } catch (error: any) {
    console.error('Standby POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/standby - End a standby log
 * Body: { standbyLogId, endedAt }
 */
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Authorization required' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { standbyLogId, endedAt } = body;

    // Validate required fields
    if (!standbyLogId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: standbyLogId' },
        { status: 400 }
      );
    }

    // Get standby log
    const { data: standbyLog, error: fetchError } = await supabaseAdmin
      .from('standby_logs')
      .select('*')
      .eq('id', standbyLogId)
      .eq('operator_id', user.id)
      .single();

    if (fetchError || !standbyLog) {
      return NextResponse.json(
        { success: false, error: 'Standby log not found' },
        { status: 404 }
      );
    }

    // Calculate duration
    const startTime = new Date(standbyLog.started_at);
    const endTime = new Date(endedAt || new Date().toISOString());
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationHours = durationMs / 3600000; // Convert ms to hours

    // Update standby log with end time and duration
    const { data: updatedLog, error: updateError } = await supabaseAdmin
      .from('standby_logs')
      .update({
        ended_at: endedAt || new Date().toISOString(),
        duration_hours: durationHours,
        status: 'completed'
      })
      .eq('id', standbyLogId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating standby log:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update standby log' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedLog
    });

  } catch (error: any) {
    console.error('Standby PUT error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/standby - Get standby logs
 * Query params: ?jobId=xxx or ?operatorId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Authorization required' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const operatorId = searchParams.get('operatorId');

    let query = supabaseAdmin
      .from('standby_logs')
      .select('*')
      .order('started_at', { ascending: false });

    if (jobId) {
      query = query.eq('job_order_id', jobId);
    }

    if (operatorId) {
      query = query.eq('operator_id', operatorId);
    }

    const { data: logs, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching standby logs:', fetchError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch standby logs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: logs || []
    });

  } catch (error: any) {
    console.error('Standby GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
