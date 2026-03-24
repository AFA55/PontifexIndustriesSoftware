import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.authorized) return auth.response

  try {
    const { data: inventory, error } = await supabaseAdmin
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching inventory:', error)
      return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 })
    }

    return NextResponse.json(inventory || [])
  } catch (error) {
    console.error('Error in inventory API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.authorized) return auth.response

  try {
    const inventoryData = await request.json()

    const { data: newInventory, error } = await supabaseAdmin
      .from('inventory')
      .insert(inventoryData)
      .select()
      .single()

    if (error) {
      console.error('Error creating inventory:', error)
      return NextResponse.json({ error: 'Failed to create inventory item' }, { status: 500 })
    }

    // Create transaction record for the stock addition
    Promise.resolve(
      supabaseAdmin
        .from('inventory_transactions')
        .insert({
          inventory_id: newInventory.id,
          transaction_type: 'add_stock',
          quantity_change: inventoryData.quantity_in_stock || 0,
          quantity_before: 0,
          quantity_after: inventoryData.quantity_in_stock || 0,
          notes: `Initial stock added: ${inventoryData.quantity_in_stock || 0} units`,
          performed_by: auth.userId,
        })
    ).then(() => {}).catch((e: any) => console.error('Error creating transaction record:', e))

    return NextResponse.json(newInventory)
  } catch (error) {
    console.error('Error in inventory POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
