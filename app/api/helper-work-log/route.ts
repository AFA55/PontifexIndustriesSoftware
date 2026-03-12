/**
 * API Route: /api/helper-work-log
 * POST: Create/update a helper work log entry (upsert by job_order_id + helper_id + log_date)
 * GET: Check if today's log exists for a given job
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { job_order_id, work_description, log_date } = body;

    if (!job_order_id || !work_description) {
      return NextResponse.json(
        { error: 'job_order_id and work_description are required' },
        { status: 400 }
      );
    }

    // Verify user is a helper/apprentice on this job
    const { data: job } = await supabaseAdmin
      .from('job_orders')
      .select('helper_assigned_to, assigned_to')
      .eq('id', job_order_id)
      .single();

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Allow if user is the helper OR the assigned operator
    if (job.helper_assigned_to !== user.id && job.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Not assigned to this job' }, { status: 403 });
    }

    const today = log_date || new Date().toISOString().split('T')[0];

    // Upsert: update if exists for this job+helper+date, otherwise insert
    const { data: existing } = await supabaseAdmin
      .from('helper_work_logs')
      .select('id')
      .eq('job_order_id', job_order_id)
      .eq('helper_id', user.id)
      .eq('log_date', today)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabaseAdmin
        .from('helper_work_logs')
        .update({ work_description })
        .eq('id', existing.id);

      if (updateError) {
        console.error('Error updating helper work log:', updateError);
        return NextResponse.json({ error: 'Failed to update work log' }, { status: 500 });
      }
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('helper_work_logs')
        .insert({
          job_order_id,
          helper_id: user.id,
          log_date: today,
          work_description,
        });

      if (insertError) {
        console.error('Error inserting helper work log:', insertError);
        return NextResponse.json({ error: 'Failed to create work log' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: 'Work log saved' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error in helper-work-log POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobOrderId = searchParams.get('job_order_id');
    const logDate = searchParams.get('log_date') || new Date().toISOString().split('T')[0];

    if (!jobOrderId) {
      return NextResponse.json({ error: 'job_order_id is required' }, { status: 400 });
    }

    const { data: log, error } = await supabaseAdmin
      .from('helper_work_logs')
      .select('*')
      .eq('job_order_id', jobOrderId)
      .eq('helper_id', user.id)
      .eq('log_date', logDate)
      .maybeSingle();

    if (error) {
      console.error('Error fetching helper work log:', error);
      return NextResponse.json({ error: 'Failed to fetch work log' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: log,
      has_log: !!log,
    }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error in helper-work-log GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
