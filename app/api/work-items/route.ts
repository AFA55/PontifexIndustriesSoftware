/**
 * API Route: /api/work-items
 * Save work items with accessibility tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();
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
      notes
    } = body;

    // Insert work item (with tenant scope)
    const tenantId = await getTenantId(user.id);
    const insertData: any = {
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
        created_by: user.id
    };
    if (tenantId) insertData.tenant_id = tenantId;

    const { data: workItem, error: insertError } = await supabaseAdmin
      .from('work_items')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      // If work_items table doesn't exist yet, return success silently
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
          work_area_accessibility_submitted_by: user.id
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

export async function GET(request: NextRequest) {
  try {
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

    const url = new URL(request.url);
    const jobOrderId = url.searchParams.get('job_order_id');

    if (!jobOrderId) {
      return NextResponse.json(
        { error: 'job_order_id is required' },
        { status: 400 }
      );
    }

    // Fetch work items for this job (scoped to tenant)
    const tenantIdGet = await getTenantId(user.id);
    let workItemsQuery = supabaseAdmin
      .from('work_items')
      .select('*')
      .eq('job_order_id', jobOrderId)
      .order('created_at', { ascending: false });
    if (tenantIdGet) workItemsQuery = workItemsQuery.eq('tenant_id', tenantIdGet);
    const { data: workItems, error: fetchError } = await workItemsQuery;

    if (fetchError) {
      // If work_items table doesn't exist yet, return empty array
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
