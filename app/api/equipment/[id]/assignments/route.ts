import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/api-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (!auth.authorized) return auth.response

    const { id: equipmentId } = await params

    // Fetch assignment history for this equipment
    const { data: assignments, error } = await supabaseAdmin
      .from('blade_assignments')
      .select(`
        *,
        operator:users!blade_assignments_operator_id_fkey(
          full_name
        ),
        assigned_by_user:users!blade_assignments_assigned_by_fkey(
          full_name
        )
      `)
      .eq('equipment_id', equipmentId)
      .order('assigned_date', { ascending: false })

    if (error) {
      console.error('Error fetching assignments:', error)
      return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 })
    }

    return NextResponse.json(assignments || [])

  } catch (error) {
    console.error('Error in assignments API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
