/**
 * API Route: GET /api/equipment/my-blades
 * Returns the current operator's assigned blades grouped by saw type.
 * Used by the work-performed page for auto-matching blade usage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Query active blade assignments for this operator, joined with equipment details
    const { data: assignments, error: queryError } = await supabaseAdmin
      .from('blade_assignments')
      .select(`
        id,
        equipment_id,
        status,
        assigned_date,
        equipment:equipment_id (
          id,
          name,
          serial_number,
          manufacturer,
          model_number,
          size,
          equipment_for,
          equipment_category,
          total_usage_linear_feet,
          purchase_price
        )
      `)
      .eq('operator_id', user.id)
      .eq('status', 'active');

    if (queryError) {
      console.error('Error fetching operator blades:', queryError);
      return NextResponse.json(
        { error: 'Failed to fetch assigned blades' },
        { status: 500 }
      );
    }

    // Group blades by equipment_for (saw type)
    const grouped: Record<string, any[]> = {};

    for (const assignment of assignments || []) {
      const equip = Array.isArray(assignment.equipment)
        ? assignment.equipment[0]
        : assignment.equipment;

      if (!equip) continue;

      const sawType = equip.equipment_for || 'other';

      if (!grouped[sawType]) {
        grouped[sawType] = [];
      }

      grouped[sawType].push({
        assignment_id: assignment.id,
        equipment_id: equip.id,
        name: equip.name,
        serial_number: equip.serial_number,
        manufacturer: equip.manufacturer,
        model_number: equip.model_number,
        size: equip.size,
        equipment_for: equip.equipment_for,
        equipment_category: equip.equipment_category,
        total_usage_linear_feet: equip.total_usage_linear_feet || 0,
        purchase_price: equip.purchase_price,
        assigned_date: assignment.assigned_date,
      });
    }

    return NextResponse.json({
      success: true,
      blades: grouped,
      total: assignments?.length || 0,
    });
  } catch (error: any) {
    console.error('Error in my-blades route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
