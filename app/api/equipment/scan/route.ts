import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const uniqueId = searchParams.get('uniqueId')

    if (!uniqueId) {
      return NextResponse.json({ error: 'Unique ID is required' }, { status: 400 })
    }

    // Query equipment by unique identification code
    const { data: equipment, error } = await supabaseAdmin
      .from('equipment')
      .select('*')
      .eq('unique_identification_code', uniqueId)
      .single()

    if (error || !equipment) {
      return NextResponse.json({ error: 'Equipment not found' }, { status: 404 })
    }

    // Get current assignment if checked out
    if (equipment.is_checked_out) {
      const { data: assignment } = await supabaseAdmin
        .from('blade_assignments')
        .select(`
          operator_id,
          assigned_date,
          users!blade_assignments_operator_id_fkey(
            full_name
          )
        `)
        .eq('equipment_id', equipment.id)
        .eq('status', 'active')
        .order('assigned_date', { ascending: false })
        .limit(1)
        .single()

      if (assignment) {
        equipment.current_operator = assignment.users
      }
    }

    return NextResponse.json(equipment)

  } catch (error) {
    console.error('Error in scan API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
