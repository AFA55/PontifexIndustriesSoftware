import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export async function POST(request: Request) {
  try {
    const { inventory_id, operator_id, serial_number, notes, assigned_by } = await request.json()

    // Validate required fields
    if (!inventory_id || !operator_id || !serial_number || !assigned_by) {
      return NextResponse.json(
        { error: 'Missing required fields: inventory_id, operator_id, serial_number, assigned_by' },
        { status: 400 }
      )
    }

    // Verify user has permission (admin or inventory_manager)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', assigned_by)
      .single()

    if (!profile || (profile.role !== 'admin' && profile.role !== 'inventory_manager')) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions' },
        { status: 403 }
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
        { error: `Serial number "${serial_number}" has already been used for ${existingEquipment.name}. Please use a unique serial number.` },
        { status: 400 }
      )
    }

    // Call the database function to assign equipment
    const { data, error } = await supabaseAdmin.rpc('assign_equipment_from_inventory', {
      p_inventory_id: inventory_id,
      p_operator_id: operator_id,
      p_serial_number: serial_number,
      p_assigned_by: assigned_by,
      p_notes: notes || null
    })

    if (error) {
      console.error('Error assigning equipment:', error)

      // Handle duplicate serial number error
      if (error.code === '23505' && error.message.includes('equipment_serial_number_key')) {
        return NextResponse.json(
          { error: `Serial number "${serial_number}" has already been used. Please use a unique serial number.` },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: error.message || 'Failed to assign equipment' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      equipment_id: data,
      message: 'Equipment assigned successfully'
    })

  } catch (error: any) {
    console.error('Error in assign route:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
