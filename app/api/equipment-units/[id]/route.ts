/**
 * API Route: GET/PATCH/DELETE /api/equipment-units/[id]
 * Get, update, or soft-delete a single equipment unit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

// GET: Fetch a single unit with recent events and maintenance count
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;
    const tenantId = await getTenantId(auth.userId);

    const { id } = await params;

    // Fetch the unit (tenant-scoped)
    let unitQuery = supabaseAdmin.from('equipment_units').select('*').eq('id', id);
    if (tenantId) unitQuery = unitQuery.eq('tenant_id', tenantId);
    const { data: unit, error: unitError } = await unitQuery.single();

    if (unitError || !unit) {
      return NextResponse.json(
        { error: 'Equipment unit not found' },
        { status: 404 }
      );
    }

    // Fetch recent events (last 20)
    const { data: recentEvents, error: eventsError } = await supabaseAdmin
      .from('unit_events')
      .select('*')
      .eq('unit_id', id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (eventsError) {
      console.error('[equipment-units/:id GET] Events fetch error:', eventsError);
    }

    // Fetch maintenance history count
    const { count: maintenanceCount, error: maintError } = await supabaseAdmin
      .from('unit_events')
      .select('*', { count: 'exact', head: true })
      .eq('unit_id', id)
      .in('event_type', ['maintenance_requested', 'maintenance_completed', 'serviced']);

    if (maintError) {
      console.error('[equipment-units/:id GET] Maintenance count error:', maintError);
    }

    return NextResponse.json({
      success: true,
      data: {
        unit,
        recentEvents: recentEvents || [],
        maintenanceCount: maintenanceCount ?? 0,
      },
    });
  } catch (error: any) {
    console.error('[equipment-units/:id GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: Update unit fields (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;
    const tenantId = await getTenantId(auth.userId);

    const { id } = await params;
    const body = await request.json();

    // Fetch the current unit to detect changes (tenant-scoped)
    let fetchQuery = supabaseAdmin.from('equipment_units').select('*').eq('id', id);
    if (tenantId) fetchQuery = fetchQuery.eq('tenant_id', tenantId);
    const { data: currentUnit, error: fetchError } = await fetchQuery.single();

    if (fetchError || !currentUnit) {
      return NextResponse.json(
        { error: 'Equipment unit not found' },
        { status: 404 }
      );
    }

    // Build update payload from allowed fields
    const allowedFields = [
      'name', 'category', 'equipment_type', 'manufacturer', 'model_number',
      'size', 'manufacturer_serial', 'purchase_price', 'purchase_date',
      'inventory_id', 'estimated_life_linear_feet', 'lifecycle_status',
      'current_operator_id', 'notes', 'photo_url', 'nfc_tag_id',
    ];

    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    updateData.updated_at = new Date().toISOString();

    // Update the unit
    const { data: updatedUnit, error: updateError } = await supabaseAdmin
      .from('equipment_units')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[equipment-units/:id PATCH] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update equipment unit' },
        { status: 500 }
      );
    }

    // Create events based on changes detected
    const events: Record<string, any>[] = [];

    // Lifecycle status change
    if (body.lifecycle_status && body.lifecycle_status !== currentUnit.lifecycle_status) {
      events.push({
        unit_id: id,
        event_type: 'status_changed',
        performed_by: auth.userId,
        description: `Status changed from "${currentUnit.lifecycle_status}" to "${body.lifecycle_status}"`,
        metadata: {
          previous_status: currentUnit.lifecycle_status,
          new_status: body.lifecycle_status,
        },
      });
    }

    // Operator assignment (checked_out)
    if (
      'current_operator_id' in body &&
      body.current_operator_id &&
      body.current_operator_id !== currentUnit.current_operator_id
    ) {
      events.push({
        unit_id: id,
        event_type: 'checked_out',
        performed_by: auth.userId,
        description: `Unit checked out to operator ${body.current_operator_id}`,
        metadata: {
          operator_id: body.current_operator_id,
        },
      });
    }

    // Operator unassignment (checked_in)
    if (
      'current_operator_id' in body &&
      !body.current_operator_id &&
      currentUnit.current_operator_id
    ) {
      events.push({
        unit_id: id,
        event_type: 'checked_in',
        performed_by: auth.userId,
        description: `Unit checked in from operator ${currentUnit.current_operator_id}`,
        metadata: {
          previous_operator_id: currentUnit.current_operator_id,
        },
      });
    }

    // Insert events if any
    if (events.length > 0) {
      const { error: eventError } = await supabaseAdmin
        .from('unit_events')
        .insert(events);

      if (eventError) {
        console.error('[equipment-units/:id PATCH] Event creation error:', eventError);
        // Non-fatal
      }
    }

    return NextResponse.json({ success: true, data: updatedUnit });
  } catch (error: any) {
    console.error('[equipment-units/:id PATCH] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Soft-delete (retire) unit (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;
    const tenantId = await getTenantId(auth.userId);

    const { id } = await params;

    // Verify unit exists (tenant-scoped)
    let delQuery = supabaseAdmin.from('equipment_units').select('id, name, lifecycle_status').eq('id', id);
    if (tenantId) delQuery = delQuery.eq('tenant_id', tenantId);
    const { data: unit, error: fetchError } = await delQuery.single();

    if (fetchError || !unit) {
      return NextResponse.json(
        { error: 'Equipment unit not found' },
        { status: 404 }
      );
    }

    if (unit.lifecycle_status === 'retired') {
      return NextResponse.json(
        { error: 'Unit is already retired' },
        { status: 400 }
      );
    }

    // Soft delete: set lifecycle_status to 'retired'
    const { data: retiredUnit, error: updateError } = await supabaseAdmin
      .from('equipment_units')
      .update({
        lifecycle_status: 'retired',
        retired_at: new Date().toISOString(),
        retired_by: auth.userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[equipment-units/:id DELETE] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to retire equipment unit' },
        { status: 500 }
      );
    }

    // Create retirement event
    const { error: eventError } = await supabaseAdmin
      .from('unit_events')
      .insert({
        unit_id: id,
        event_type: 'status_changed',
        performed_by: auth.userId,
        description: `Unit "${unit.name}" retired`,
        metadata: {
          previous_status: unit.lifecycle_status,
          new_status: 'retired',
        },
      });

    if (eventError) {
      console.error('[equipment-units/:id DELETE] Event creation error:', eventError);
    }

    return NextResponse.json({ success: true, data: retiredUnit });
  } catch (error: any) {
    console.error('[equipment-units/:id DELETE] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
