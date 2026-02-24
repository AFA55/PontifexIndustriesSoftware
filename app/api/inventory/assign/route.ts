import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) return auth.response

    const { inventory_id, operator_id, serial_number, notes } = await request.json()

    // Validate required fields
    if (!inventory_id || !operator_id || !serial_number) {
      return NextResponse.json(
        { error: 'Missing required fields: inventory_id, operator_id, serial_number' },
        { status: 400 }
      )
    }

    // Check if serial number already exists
    const { data: existingEquipment } = await supabaseAdmin
      .from('equipment')
      .select('id, serial_number, name')
      .eq('serial_number', serial_number)
      .single()

    if (existingEquipment) {
      return NextResponse.json(
        { error: 'Serial number has already been used. Please use a unique serial number.' },
        { status: 400 }
      )
    }

    // Call the database function to assign equipment
    // Use auth.userId from JWT token instead of body param
    const { data, error } = await supabaseAdmin.rpc('assign_equipment_from_inventory', {
      p_inventory_id: inventory_id,
      p_operator_id: operator_id,
      p_serial_number: serial_number,
      p_assigned_by: auth.userId,
      p_notes: notes || null
    })

    if (error) {
      console.error('Error assigning equipment:', error)

      // Handle duplicate serial number error
      if (error.code === '23505' && error.message.includes('equipment_serial_number_key')) {
        return NextResponse.json(
          { error: 'Serial number has already been used. Please use a unique serial number.' },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: 'Failed to assign equipment' },
        { status: 500 }
      )
    }

    // Also create a blade_assignments record so track-usage can find this blade
    if (data) {
      const { error: bladeAssignError } = await supabaseAdmin
        .from('blade_assignments')
        .insert({
          equipment_id: data,
          operator_id,
          assigned_by: auth.userId,
          assigned_date: new Date().toISOString(),
          status: 'active',
          checkout_notes: notes || 'Assigned from inventory'
        })

      if (bladeAssignError) {
        console.error('Warning: blade_assignments insert failed:', bladeAssignError)
      }
    }

    return NextResponse.json({
      success: true,
      equipment_id: data,
      message: 'Equipment assigned successfully'
    })

  } catch (error) {
    console.error('Error in assign route:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
