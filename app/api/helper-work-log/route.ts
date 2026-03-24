/**
 * API Route: /api/helper-work-log
 * POST: Create/update a helper work log entry with time tracking
 * GET: Check if today's log exists for a given job, or get all logs for today
 *
 * Supports:
 * - Field job work logs (job_order_id required)
 * - Shop tickets (is_shop_ticket = true, no job_order_id)
 * - Time tracking via started_at / completed_at / hours_worked
 * - Smart completion: complete=true sets completed_at and calculates hours
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;
    const body = await request.json();
    const {
      job_order_id,
      work_description,
      log_date,
      complete,      // boolean: mark as completed (sets completed_at + hours)
      start_now,     // boolean: set started_at to now
      is_shop_ticket // boolean: this is an in-shop work log
    } = body;

    const today = log_date || new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    // ── SHOP TICKET ──
    if (is_shop_ticket) {
      // Check for existing shop ticket today
      const { data: existingShop } = await supabaseAdmin
        .from('helper_work_logs')
        .select('id, started_at')
        .eq('helper_id', auth.userId)
        .eq('log_date', today)
        .eq('is_shop_ticket', true)
        .maybeSingle();

      if (existingShop) {
        // Update existing shop ticket
        const updateData: Record<string, unknown> = {};
        if (work_description !== undefined) updateData.work_description = work_description;
        if (complete) {
          updateData.completed_at = now;
          if (existingShop.started_at) {
            const startMs = new Date(existingShop.started_at).getTime();
            const endMs = new Date(now).getTime();
            updateData.hours_worked = Number(((endMs - startMs) / (1000 * 60 * 60)).toFixed(2));
          }
        }

        const { error: updateError } = await supabaseAdmin
          .from('helper_work_logs')
          .update(updateData)
          .eq('id', existingShop.id);

        if (updateError) {
          console.error('Error updating shop ticket:', updateError);
          return NextResponse.json({ error: 'Failed to update shop ticket' }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          message: 'Shop ticket updated',
          data: { ...existingShop, ...updateData }
        });
      } else {
        const insertData: Record<string, unknown> = {
          helper_id: auth.userId,
          log_date: today,
          is_shop_ticket: true,
          work_description: work_description || '',
          started_at: start_now ? now : null,
        };

        const { data: newShop, error: insertError } = await supabaseAdmin
          .from('helper_work_logs')
          .insert(insertData)
          .select()
          .single();

        if (insertError) {
          console.error('Error creating shop ticket:', insertError);
          return NextResponse.json({ error: 'Failed to create shop ticket' }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          message: 'Shop ticket created',
          data: newShop
        });
      }
    }

    // ── FIELD JOB WORK LOG ──
    if (!job_order_id) {
      return NextResponse.json(
        { error: 'job_order_id is required for field job logs' },
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

    if (job.helper_assigned_to !== auth.userId && job.assigned_to !== auth.userId) {
      return NextResponse.json({ error: 'Not assigned to this job' }, { status: 403 });
    }

    // Check for existing log
    const { data: existing } = await supabaseAdmin
      .from('helper_work_logs')
      .select('id, started_at, completed_at')
      .eq('job_order_id', job_order_id)
      .eq('helper_id', auth.userId)
      .eq('log_date', today)
      .maybeSingle();

    if (existing) {
      const updateData: Record<string, unknown> = {};
      if (work_description !== undefined && work_description !== '') {
        updateData.work_description = work_description;
      }
      if (start_now && !existing.started_at) {
        updateData.started_at = now;
      }
      if (complete && !existing.completed_at) {
        updateData.completed_at = now;
        const startTime = existing.started_at || now;
        const startMs = new Date(startTime).getTime();
        const endMs = new Date(now).getTime();
        updateData.hours_worked = Number(((endMs - startMs) / (1000 * 60 * 60)).toFixed(2));
      }

      const { error: updateError } = await supabaseAdmin
        .from('helper_work_logs')
        .update(updateData)
        .eq('id', existing.id);

      if (updateError) {
        console.error('Error updating helper work log:', updateError);
        return NextResponse.json({ error: 'Failed to update work log' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Work log updated',
        data: { ...existing, ...updateData }
      });
    } else {
      // Create new log
      const insertData: Record<string, unknown> = {
        job_order_id,
        helper_id: auth.userId,
        log_date: today,
        work_description: work_description || '',
        is_shop_ticket: false,
        started_at: start_now ? now : null,
      };

      if (complete) {
        insertData.completed_at = now;
        if (insertData.started_at) {
          insertData.hours_worked = 0;
        }
      }

      // Auto-derive started_at from chain or clock-in
      if (!insertData.started_at) {
        // Check if there's a recently completed job for time chaining
        const { data: lastCompleted } = await supabaseAdmin
          .from('helper_work_logs')
          .select('completed_at')
          .eq('helper_id', auth.userId)
          .eq('log_date', today)
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastCompleted?.completed_at) {
          insertData.started_at = lastCompleted.completed_at;
        } else {
          // First job: use clock-in time
          const { data: timecard } = await supabaseAdmin
            .from('timecards')
            .select('clock_in')
            .eq('user_id', auth.userId)
            .eq('date', today)
            .is('clock_out', null)
            .maybeSingle();

          if (timecard?.clock_in) {
            insertData.started_at = timecard.clock_in;
          } else {
            insertData.started_at = now;
          }
        }
      }

      const { data: newLog, error: insertError } = await supabaseAdmin
        .from('helper_work_logs')
        .insert(insertData)
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting helper work log:', insertError);
        return NextResponse.json({ error: 'Failed to create work log' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Work log created',
        data: newLog
      });
    }
  } catch (error) {
    console.error('Unexpected error in helper-work-log POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const jobOrderId = searchParams.get('job_order_id');
    const logDate = searchParams.get('log_date') || new Date().toISOString().split('T')[0];
    const allToday = searchParams.get('all_today') === 'true';

    // Fetch all logs for today (for time summary)
    if (allToday) {
      const { data: logs, error } = await supabaseAdmin
        .from('helper_work_logs')
        .select('*')
        .eq('helper_id', auth.userId)
        .eq('log_date', logDate)
        .order('started_at', { ascending: true });

      if (error) {
        console.error('Error fetching helper work logs:', error);
        return NextResponse.json({ error: 'Failed to fetch work logs' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        data: logs || [],
        total_hours: (logs || []).reduce((sum: number, l: any) => sum + Number(l.hours_worked || 0), 0),
      });
    }

    // Fetch specific job's log
    if (!jobOrderId) {
      return NextResponse.json({ error: 'job_order_id or all_today=true is required' }, { status: 400 });
    }

    const { data: log, error } = await supabaseAdmin
      .from('helper_work_logs')
      .select('*')
      .eq('job_order_id', jobOrderId)
      .eq('helper_id', auth.userId)
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
    });
  } catch (error) {
    console.error('Unexpected error in helper-work-log GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
