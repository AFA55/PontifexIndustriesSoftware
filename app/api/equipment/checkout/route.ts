import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  try {
    const { equipment_id, operator_id, assignment_date, notes } = await request.json()

    if (!equipment_id || !operator_id) {
      return NextResponse.json({ error: 'Equipment ID and Operator ID are required' }, { status: 400 })
    }

    // Check if equipment is already checked out
    const { data: existingEquipment } = await supabaseAdmin
      .from('equipment')
      .select('is_checked_out, name')
      .eq('id', equipment_id)
      .single()

    if (existingEquipment?.is_checked_out) {
      return NextResponse.json({ error: 'Equipment is already checked out' }, { status: 400 })
    }

    // Create assignment record
    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from('blade_assignments')
      .insert({
        equipment_id,
        operator_id,
        assigned_date: assignment_date || new Date().toISOString(),
        checkout_notes: notes || null,
        status: 'active'
      })
      .select()
      .single()

    if (assignmentError) {
      console.error('Error creating assignment:', assignmentError)
      return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
    }

    // Update equipment status
    const { error: updateError } = await supabaseAdmin
      .from('equipment')
      .update({ is_checked_out: true })
      .eq('id', equipment_id)

    if (updateError) {
      console.error('Error updating equipment:', updateError)
      // Rollback assignment
      await supabaseAdmin.from('blade_assignments').delete().eq('id', assignment.id)
      return NextResponse.json({ error: 'Failed to update equipment status' }, { status: 500 })
    }

    // Log checkout session
    await supabaseAdmin
      .from('equipment_checkout_sessions')
      .insert({
        equipment_id,
        scan_action: 'assign_equipment',
        notes: `Assigned to operator ${operator_id}`
      })

    return NextResponse.json({
      success: true,
      message: 'Equipment checked out successfully',
      assignment
    })

  } catch (error) {
    console.error('Error in checkout API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
