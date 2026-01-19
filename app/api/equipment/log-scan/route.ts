import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  try {
    const { equipment_id, scan_action, notes } = await request.json()

    if (!equipment_id) {
      return NextResponse.json({ error: 'Equipment ID is required' }, { status: 400 })
    }

    // Insert scan log
    const { data, error } = await supabaseAdmin
      .from('equipment_checkout_sessions')
      .insert({
        equipment_id,
        scan_action: scan_action || 'view_equipment',
        notes: notes || null
      })
      .select()
      .single()

    if (error) {
      console.error('Error logging scan:', error)
      return NextResponse.json({ error: 'Failed to log scan' }, { status: 500 })
    }

    return NextResponse.json({ success: true, log: data })

  } catch (error) {
    console.error('Error in log-scan API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
