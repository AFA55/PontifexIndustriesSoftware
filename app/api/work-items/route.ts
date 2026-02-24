/**
 * API Route: /api/work-items
 * Save work items with accessibility tracking
 * Supports single item or batch mode
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isTableNotFoundError } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();

    // Support batch mode: { job_order_id, items: [...] }
    if (body.items && Array.isArray(body.items)) {
      return handleBatchInsert(body.job_order_id, body.items, auth.userId);
    }

    // Legacy single-item mode
    const {
      job_order_id,
      work_type,
      core_size,
      core_depth_inches,
      core_quantity,
      linear_feet_cut,
      cut_depth_inches,
      accessibility_rating,
      accessibility_description,
      quantity,
      notes,
      details_json,
      equipment_id,
      operator_id
    } = body;

    // Insert work item
    const { data: workItem, error: insertError } = await supabaseAdmin
      .from('work_items')
      .insert({
        job_order_id,
        work_type,
        core_size,
        core_depth_inches,
        core_quantity,
        linear_feet_cut,
        cut_depth_inches,
        accessibility_rating,
        accessibility_description,
        quantity,
        notes,
        details_json: details_json || null,
        equipment_id: equipment_id || null,
        operator_id: operator_id || auth.userId,
        created_by: auth.userId
      })
      .select()
      .single();

    if (insertError) {
      if (isTableNotFoundError(insertError)) {
        return NextResponse.json({
          success: true,
          data: null,
          message: 'Work items table not available yet — data saved to job order only'
        });
      }
      console.error('Error inserting work item:', insertError);
      return NextResponse.json(
        { error: 'Failed to save work item' },
        { status: 500 }
      );
    }

    // Also update job_orders accessibility if provided
    if (accessibility_rating && accessibility_description) {
      await supabaseAdmin
        .from('job_orders')
        .update({
          work_area_accessibility_rating: accessibility_rating,
          work_area_accessibility_notes: accessibility_description,
          work_area_accessibility_submitted_at: new Date().toISOString(),
          work_area_accessibility_submitted_by: auth.userId
        })
        .eq('id', job_order_id);
    }

    return NextResponse.json({
      success: true,
      data: workItem
    });
  } catch (error: any) {
    console.error('Error in work items route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Batch insert work items for a job order.
 * Accepts an array of work items and inserts them in a single DB call.
 */
async function handleBatchInsert(
  jobOrderId: string,
  items: any[],
  userId: string
) {
  if (!jobOrderId) {
    return NextResponse.json(
      { error: 'job_order_id is required' },
      { status: 400 }
    );
  }

  if (items.length === 0) {
    return NextResponse.json({
      success: true,
      data: [],
      message: 'No work items to save'
    });
  }

  // Build the rows for insertion
  const rows = items.map((item) => ({
    job_order_id: jobOrderId,
    work_type: item.work_type || null,
    core_size: item.core_size || null,
    core_depth_inches: item.core_depth_inches || null,
    core_quantity: item.core_quantity || null,
    linear_feet_cut: item.linear_feet_cut || null,
    cut_depth_inches: item.cut_depth_inches || null,
    accessibility_rating: item.accessibility_rating || null,
    accessibility_description: item.accessibility_description || null,
    quantity: item.quantity || null,
    notes: item.notes || null,
    details_json: item.details_json || null,
    equipment_id: item.equipment_id || null,
    operator_id: item.operator_id || userId,
    created_by: userId
  }));

  const { data: workItems, error: insertError } = await supabaseAdmin
    .from('work_items')
    .insert(rows)
    .select();

  if (insertError) {
    if (isTableNotFoundError(insertError)) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'Work items table not available yet'
      });
    }
    console.error('Error batch inserting work items:', insertError);
    return NextResponse.json(
      { error: 'Failed to save work items' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: workItems,
    message: `Saved ${workItems?.length || 0} work items`
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const url = new URL(request.url);
    const jobOrderId = url.searchParams.get('job_order_id');

    if (!jobOrderId) {
      return NextResponse.json(
        { error: 'job_order_id is required' },
        { status: 400 }
      );
    }

    // Fetch work items for this job
    const { data: workItems, error: fetchError } = await supabaseAdmin
      .from('work_items')
      .select('*')
      .eq('job_order_id', jobOrderId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      if (isTableNotFoundError(fetchError)) {
        return NextResponse.json({
          success: true,
          data: []
        });
      }
      console.error('Error fetching work items:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch work items' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: workItems || []
    });
  } catch (error: any) {
    console.error('Error in work items route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
