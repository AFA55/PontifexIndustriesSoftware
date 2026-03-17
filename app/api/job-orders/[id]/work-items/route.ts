/**
 * API Route: /api/job-orders/[id]/work-items
 * Save and retrieve work performed items for a job
 *
 * POST - Save work items to the database (replaces localStorage)
 * GET - Retrieve all work items for a job
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await params;
    const body = await request.json();
    const { items, dayNumber } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'At least one work item is required' },
        { status: 400 }
      );
    }

    // Verify job exists
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('id, assigned_to, helper_assigned_to, status')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Verify user is assigned to this job (operator or helper) or is admin
    const isAssigned = job.assigned_to === auth.userId || job.helper_assigned_to === auth.userId;
    const isAdmin = ['admin', 'super_admin', 'operations_manager'].includes(auth.role);

    if (!isAssigned && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized for this job' }, { status: 403 });
    }

    // Delete existing work items for this job + day (replace pattern)
    const effectiveDay = dayNumber || 1;
    await supabaseAdmin
      .from('work_items')
      .delete()
      .eq('job_order_id', jobId)
      .eq('day_number', effectiveDay);

    // Map frontend work items to database rows
    const workItemRows = items.map((item: any) => {
      const row: any = {
        job_order_id: jobId,
        operator_id: auth.userId,
        work_type: item.name,
        quantity: item.quantity || 1,
        notes: item.notes || null,
        day_number: effectiveDay,
        details_json: null,
      };

      // Extract specific fields from details based on work type
      if (item.details) {
        row.details_json = item.details;

        // Core drilling specifics
        if (item.details.holes && item.details.holes.length > 0) {
          const firstHole = item.details.holes[0];
          row.core_size = firstHole.bitSize || null;
          row.core_depth_inches = firstHole.depthInches || null;
          row.core_quantity = item.details.holes.reduce((sum: number, h: any) => sum + (h.quantity || 1), 0);
        }

        // Sawing specifics
        if (item.details.cuts && item.details.cuts.length > 0) {
          row.linear_feet_cut = item.details.cuts.reduce((sum: number, c: any) => sum + (c.linearFeet || 0), 0);
          row.cut_depth_inches = item.details.cuts[0].cutDepth || null;
        }
      }

      return row;
    });

    // Insert all work items
    const { data: savedItems, error: insertError } = await supabaseAdmin
      .from('work_items')
      .insert(workItemRows)
      .select();

    if (insertError) {
      console.error('Error saving work items:', insertError);
      return NextResponse.json(
        { error: 'Failed to save work items' },
        { status: 500 }
      );
    }

    // Build a comprehensive work_performed summary from ALL days (not just today)
    // This prevents multi-day jobs from losing previous days' summaries
    const { data: allWorkItems } = await supabaseAdmin
      .from('work_items')
      .select('work_type, quantity, core_quantity, linear_feet_cut, day_number')
      .eq('job_order_id', jobId)
      .order('day_number', { ascending: true });

    let workSummary = '';
    if (allWorkItems && allWorkItems.length > 0) {
      // Group by day
      const byDay: Record<number, typeof allWorkItems> = {};
      allWorkItems.forEach(wi => {
        const d = wi.day_number || 1;
        if (!byDay[d]) byDay[d] = [];
        byDay[d].push(wi);
      });

      const dayKeys = Object.keys(byDay).map(Number).sort((a, b) => a - b);
      if (dayKeys.length === 1) {
        // Single day — no prefix
        workSummary = byDay[dayKeys[0]].map(wi => {
          let desc = `${wi.work_type} x${wi.quantity || 1}`;
          if (wi.core_quantity) desc += ` (${wi.core_quantity} cores)`;
          if (wi.linear_feet_cut) desc += ` (${wi.linear_feet_cut} LF)`;
          return desc;
        }).join('; ');
      } else {
        // Multi-day — prefix each day
        workSummary = dayKeys.map(d =>
          `Day ${d}: ${byDay[d].map(wi => {
            let desc = `${wi.work_type} x${wi.quantity || 1}`;
            if (wi.core_quantity) desc += ` (${wi.core_quantity} cores)`;
            if (wi.linear_feet_cut) desc += ` (${wi.linear_feet_cut} LF)`;
            return desc;
          }).join(', ')}`
        ).join(' | ');
      }
    }

    await supabaseAdmin
      .from('job_orders')
      .update({ work_performed: workSummary })
      .eq('id', jobId);

    return NextResponse.json({
      success: true,
      data: savedItems,
      message: `${savedItems.length} work items saved`
    });

  } catch (error: any) {
    console.error('Error in work-items POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await params;

    const { data: items, error } = await supabaseAdmin
      .from('work_items')
      .select('*')
      .eq('job_order_id', jobId)
      .order('day_number', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching work items:', error);
      return NextResponse.json(
        { error: 'Failed to fetch work items' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: items || []
    });

  } catch (error: any) {
    console.error('Error in work-items GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
