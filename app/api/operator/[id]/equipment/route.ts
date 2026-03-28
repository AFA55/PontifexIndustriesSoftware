import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getTenantId } from '@/lib/get-tenant-id'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: operatorId } = await params

    // Fetch operator info
    const { data: operator, error: operatorError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', operatorId)
      .single()

    if (operatorError) {
      return NextResponse.json(
        { error: 'Operator not found' },
        { status: 404 }
      )
    }

    // Scope equipment to operator's tenant
    const tenantId = await getTenantId(operatorId)
    let equipmentQuery = supabaseAdmin
      .from('equipment')
      .select(`
        id,
        name,
        type,
        manufacturer,
        model_number,
        size,
        equipment_for,
        serial_number,
        status,
        purchase_price,
        assigned_date,
        is_from_inventory,
        inventory_id
      `)
      .eq('assigned_to_operator', operatorId)
      .order('assigned_date', { ascending: false })
    if (tenantId) equipmentQuery = equipmentQuery.eq('tenant_id', tenantId)

    // Fetch equipment assigned to operator
    const { data: equipment, error: equipmentError } = await equipmentQuery

    if (equipmentError) {
      console.error('Error fetching equipment:', equipmentError)
      return NextResponse.json(
        { error: equipmentError.message },
        { status: 500 }
      )
    }

    // Fetch inventory details for equipment
    const inventoryIds = equipment?.filter(e => e.inventory_id).map(e => e.inventory_id) || []
    let inventoryMap: any = {}

    if (inventoryIds.length > 0) {
      const { data: inventoryData } = await supabaseAdmin
        .from('inventory')
        .select('id, name, category')
        .in('id', inventoryIds)

      inventoryData?.forEach(inv => {
        inventoryMap[inv.id] = inv
      })
    }

    // Enrich equipment with inventory data
    const enrichedEquipment = equipment?.map(e => ({
      ...e,
      inventory: e.inventory_id ? inventoryMap[e.inventory_id] : null
    }))

    return NextResponse.json({
      success: true,
      operator,
      equipment: enrichedEquipment || []
    })

  } catch (error: any) {
    console.error('Error in operator equipment route:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
