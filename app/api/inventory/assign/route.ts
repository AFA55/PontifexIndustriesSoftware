import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/api-auth'
import { getTenantId } from '@/lib/get-tenant-id'

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.authorized) return auth.response
  const tenantId = await getTenantId(auth.userId)

  try {
    const { inventory_id, operator_id, serial_number, notes } = await request.json()

    if (!inventory_id || !operator_id || !serial_number) {
      return NextResponse.json(
        { error: 'Missing required fields: inventory_id, operator_id, serial_number' },
        { status: 400 }
      )
    }

    // Check if serial number already exists (tenant-scoped)
    let serialCheck = supabaseAdmin.from('equipment').select('id, serial_number, name').eq('serial_number', serial_number)
    if (tenantId) serialCheck = serialCheck.eq('tenant_id', tenantId)
    const { data: existingEquipment } = await serialCheck.single()

    if (existingEquipment) {
      return NextResponse.json(
        { error: `Serial number "${serial_number}" has already been used for ${existingEquipment.name}. Please use a unique serial number.` },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin.rpc('assign_equipment_from_inventory', {
      p_inventory_id: inventory_id,
      p_operator_id: operator_id,
      p_serial_number: serial_number,
      p_assigned_by: auth.userId,
      p_notes: notes || null
    })

    if (error) {
      console.error('Error assigning equipment:', error)
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
