import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key'

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

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

    // Fetch equipment assigned to operator
    const { data: equipment, error: equipmentError } = await supabaseAdmin
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
