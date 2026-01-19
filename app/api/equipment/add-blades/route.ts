import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  try {
    // Note: Using supabaseAdmin for server-side operations
    // Authentication should be handled by middleware or client-side

    const { equipment } = await request.json()

    if (!equipment || !Array.isArray(equipment) || equipment.length === 0) {
      return NextResponse.json({ error: 'Invalid equipment data' }, { status: 400 })
    }

    // Prepare equipment records for insertion
    const equipmentRecords = equipment.map(item => ({
      name: `${item.manufacturer} ${item.model_number} ${item.size}`,
      type: item.equipment_category === 'blade' ? 'blade' : 'tool',
      equipment_category: item.equipment_category,
      manufacturer: item.manufacturer,
      model_number: item.model_number,
      size: item.size,
      equipment_for: item.equipment_for,
      purchase_date: item.purchase_date,
      purchase_price: item.purchase_price,
      serial_number: item.serial_number,
      unique_identification_code: item.unique_identification_code,
      qr_code_data: item.qr_code_data,
      location: item.location || null,
      notes: item.notes || null,
      status: 'available',
      is_checked_out: false,
      total_usage_linear_feet: 0,
      quantity_in_stock: 1
    }))

    // Insert equipment into database
    const { data: insertedEquipment, error: insertError } = await supabaseAdmin
      .from('equipment')
      .insert(equipmentRecords)
      .select()

    if (insertError) {
      console.error('Error inserting equipment:', insertError)
      return NextResponse.json({ error: 'Failed to add equipment', details: insertError.message }, { status: 500 })
    }

    // Store QR code images in storage bucket (optional)
    // This would require setting up a storage bucket in Supabase
    // For now, we'll store the QR code data in the database

    return NextResponse.json({
      success: true,
      message: `Successfully added ${insertedEquipment.length} equipment item(s)`,
      equipment: insertedEquipment
    })

  } catch (error) {
    console.error('Error in add-blades API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
