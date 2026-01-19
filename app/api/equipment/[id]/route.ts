import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: equipmentId } = await params

    // Fetch equipment details
    const { data: equipment, error } = await supabaseAdmin
      .from('equipment')
      .select('*')
      .eq('id', equipmentId)
      .single()

    if (error || !equipment) {
      return NextResponse.json({ error: 'Equipment not found' }, { status: 404 })
    }

    return NextResponse.json(equipment)

  } catch (error) {
    console.error('Error in equipment API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
