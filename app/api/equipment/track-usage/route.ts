import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  try {
    const { job_order_id, work_items } = await request.json()

    if (!job_order_id || !work_items || !Array.isArray(work_items)) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
    }

    const usageRecords = []

    // Process each work item to track blade usage
    for (const item of work_items) {
      // Check if this is a sawing work item
      if (item.details && item.details.cuts && Array.isArray(item.details.cuts)) {
        for (const cut of item.details.cuts) {
          if (cut.linearFeet && cut.linearFeet > 0) {
            // Extract saw type from work item name
            const sawType = item.name.toLowerCase()
            let equipmentType = ''

            if (sawType.includes('slab saw')) equipmentType = 'slab_saw'
            else if (sawType.includes('wall saw')) equipmentType = 'wall_saw'
            else if (sawType.includes('hand saw') || sawType.includes('flush cut')) equipmentType = 'hand_saw_flush_cut'
            else if (sawType.includes('chop saw')) equipmentType = 'chop_saw'

            // Find assigned blades for this operator and equipment type
            const { data: assignedBlades } = await supabaseAdmin
              .from('blade_assignments')
              .select(`
                equipment_id,
                equipment:equipment_id(
                  id,
                  name,
                  equipment_for,
                  size,
                  manufacturer,
                  model_number
                )
              `)
              .eq('status', 'active')

            // Filter for matching equipment type
            const matchingBlades = assignedBlades?.filter(
              (assignment: any) => {
                const equipment = Array.isArray(assignment.equipment) ? assignment.equipment[0] : assignment.equipment
                return equipment?.equipment_for === equipmentType
              }
            ) || []

            // Create usage record for each matching blade
            for (const assignment of matchingBlades) {
              const equipment = Array.isArray(assignment.equipment) ? assignment.equipment[0] : assignment.equipment
              usageRecords.push({
                equipment_id: assignment.equipment_id,
                job_order_id,
                usage_date: new Date().toISOString().split('T')[0],
                linear_feet_cut: cut.linearFeet,
                equipment_type_used: equipmentType,
                blade_size: equipment?.size,
                notes: `${item.name} - Cut depth: ${cut.cutDepth}"${cut.cutSteel ? ' (Cut steel)' : ''}`
              })
            }

            // If no assigned blades found, log warning but continue
            if (matchingBlades.length === 0) {
              console.warn(`No ${equipmentType} blade assigned for job ${job_order_id}`)
            }
          }
        }
      }
    }

    // Insert usage records
    if (usageRecords.length > 0) {
      const { data: insertedRecords, error: insertError } = await supabaseAdmin
        .from('blade_usage_history')
        .insert(usageRecords)
        .select()

      if (insertError) {
        console.error('Error inserting blade usage:', insertError)
        return NextResponse.json({ error: 'Failed to track blade usage', details: insertError.message }, { status: 500 })
      }

      // The trigger should automatically update the total_usage_linear_feet
      // But we'll verify the records were created
      return NextResponse.json({
        success: true,
        message: `Tracked usage for ${insertedRecords.length} blade(s)`,
        usageRecords: insertedRecords
      })
    } else {
      // No sawing work or no blades to track
      return NextResponse.json({
        success: true,
        message: 'No blade usage to track for this work',
        usageRecords: []
      })
    }

  } catch (error) {
    console.error('Error in track-usage API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
