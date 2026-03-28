/**
 * API Route: POST /api/equipment-units/[id]/assign
 * Assign or unassign an operator to/from an equipment unit.
 * Admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;
    const tenantId = await getTenantId(auth.userId);

    const { id } = await params;
    const body = await request.json();
    const { operator_id } = body;

    // Fetch current unit (tenant-scoped)
    let unitQuery = supabaseAdmin.from('equipment_units').select('id, name, pontifex_id, current_operator_id, lifecycle_status').eq('id', id);
    if (tenantId) unitQuery = unitQuery.eq('tenant_id', tenantId);
    const { data: unit, error: fetchError } = await unitQuery.single();

    if (fetchError || !unit) {
      return NextResponse.json(
        { error: 'Equipment unit not found' },
        { status: 404 }
      );
    }

    // If operator_id is null/empty, this is an unassign
    const isUnassign = !operator_id;

    if (!isUnassign) {
      // Validate the operator exists and is active
      const { data: operator, error: opError } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, role, active')
        .eq('id', operator_id)
        .single();

      if (opError || !operator) {
        return NextResponse.json(
          { error: 'Operator not found' },
          { status: 404 }
        );
      }

      if (!operator.active) {
        return NextResponse.json(
          { error: 'Operator account is inactive' },
          { status: 400 }
        );
      }
    }

    // Update the unit
    const updateData: Record<string, any> = {
      current_operator_id: isUnassign ? null : operator_id,
      assigned_at: isUnassign ? null : new Date().toISOString(),
      assigned_by: isUnassign ? null : auth.userId,
      updated_at: new Date().toISOString(),
    };

    // If assigning and unit is 'available', set to 'active'
    if (!isUnassign && unit.lifecycle_status === 'available') {
      updateData.lifecycle_status = 'active';
    }

    // If unassigning and unit is 'active', set back to 'available'
    if (isUnassign && unit.lifecycle_status === 'active') {
      updateData.lifecycle_status = 'available';
    }

    const { data: updatedUnit, error: updateError } = await supabaseAdmin
      .from('equipment_units')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[equipment-units/assign POST] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update equipment assignment' },
        { status: 500 }
      );
    }

    // Create event
    const eventData: Record<string, any> = {
      unit_id: id,
      event_type: isUnassign ? 'checked_in' : 'checked_out',
      performed_by: auth.userId,
      description: isUnassign
        ? `Unit unassigned from operator ${unit.current_operator_id}`
        : `Unit assigned to operator ${operator_id}`,
      metadata: isUnassign
        ? { previous_operator_id: unit.current_operator_id }
        : { operator_id },
    };

    const { error: eventError } = await supabaseAdmin
      .from('unit_events')
      .insert(eventData);

    if (eventError) {
      console.error('[equipment-units/assign POST] Event creation error:', eventError);
      // Non-fatal
    }

    return NextResponse.json({
      success: true,
      data: updatedUnit,
    });
  } catch (error: any) {
    console.error('[equipment-units/assign POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
