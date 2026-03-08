/**
 * API Route: GET/PATCH /api/shop/work-orders/[id]
 * Get details or update a maintenance work order.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireShopUser } from '@/lib/api-auth';

// GET: Single work order detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireShopUser(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    const { data: workOrder, error } = await supabaseAdmin
      .from('maintenance_work_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !workOrder) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    }

    // Enrich with unit info and profile names
    const [unitRes, assigneeRes, creatorRes] = await Promise.all([
      workOrder.unit_id
        ? supabaseAdmin.from('equipment_units').select('id, name, pontifex_id, category, manufacturer, model_number, lifecycle_status').eq('id', workOrder.unit_id).single()
        : { data: null },
      workOrder.assigned_to
        ? supabaseAdmin.from('profiles').select('id, full_name, email').eq('id', workOrder.assigned_to).single()
        : { data: null },
      workOrder.created_by
        ? supabaseAdmin.from('profiles').select('id, full_name').eq('id', workOrder.created_by).single()
        : { data: null },
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...workOrder,
        unit: unitRes.data || null,
        assignee: assigneeRes.data || null,
        creator: creatorRes.data || null,
      },
    });
  } catch (error: any) {
    console.error('[shop/work-orders/[id] GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: Update a work order
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireShopUser(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();

    // Fetch current work order
    const { data: current, error: fetchError } = await supabaseAdmin
      .from('maintenance_work_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    }

    // Shop hands can only update their own assigned work orders
    if (auth.role === 'shop_hand' && current.assigned_to !== auth.userId) {
      return NextResponse.json(
        { error: 'You can only update work orders assigned to you' },
        { status: 403 }
      );
    }

    // Build update object
    const updateFields: any = {};
    const allowedFields = [
      'status', 'assigned_to', 'priority', 'notes', 'started_at', 'completed_at',
      'issue_found', 'work_performed', 'parts_used', 'parts_total_cost',
      'labor_cost', 'total_cost', 'before_photos', 'after_photos',
      'actual_hours', 'estimated_hours',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateFields[field] = body[field];
      }
    }

    // Auto-set timestamps based on status changes
    if (updateFields.status === 'in_progress' && !current.started_at && !updateFields.started_at) {
      updateFields.started_at = new Date().toISOString();
    }

    if (updateFields.status === 'completed') {
      if (!updateFields.completed_at) {
        updateFields.completed_at = new Date().toISOString();
      }
      // Calculate total cost
      const partsCost = updateFields.parts_total_cost ?? current.parts_total_cost ?? 0;
      const laborCost = updateFields.labor_cost ?? current.labor_cost ?? 0;
      updateFields.total_cost = partsCost + laborCost;
    }

    // Handle assignment
    if (updateFields.assigned_to && updateFields.assigned_to !== current.assigned_to) {
      updateFields.assigned_by = auth.userId;
      updateFields.assigned_at = new Date().toISOString();
      if (current.status === 'pending') {
        updateFields.status = 'assigned';
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('maintenance_work_orders')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[shop/work-orders/[id] PATCH] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update work order' }, { status: 500 });
    }

    // When completed, update equipment unit status back to available
    if (updateFields.status === 'completed' && current.unit_id) {
      await supabaseAdmin
        .from('equipment_units')
        .update({ lifecycle_status: 'available', updated_at: new Date().toISOString() })
        .eq('id', current.unit_id)
        .in('lifecycle_status', ['needs_service', 'in_maintenance']);

      // Also create a maintenance_completed event
      await supabaseAdmin.from('unit_events').insert({
        unit_id: current.unit_id,
        event_type: 'maintenance_completed',
        performed_by: auth.userId,
        description: updateFields.work_performed || `Work order "${current.title}" completed`,
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[shop/work-orders/[id] PATCH] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
