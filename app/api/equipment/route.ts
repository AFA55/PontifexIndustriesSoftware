import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    // Fetch equipment that's NOT from inventory (vehicles, tools, safety equipment added directly)
    // Equipment from inventory (blades/bits assigned to operators) should only show in "My Equipment"
    const { data: equipment, error } = await supabaseAdmin
      .from('equipment')
      .select('*')
      .or('is_from_inventory.is.null,is_from_inventory.eq.false')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching equipment:', error)
      return NextResponse.json({ error: 'Failed to fetch equipment' }, { status: 500 })
    }

    return NextResponse.json(equipment || [])
  } catch (error) {
    console.error('Error in equipment API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
