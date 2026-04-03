export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/api-auth'
import { getTenantId } from '@/lib/get-tenant-id'

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.authorized) return auth.response
  const tenantId = await getTenantId(auth.userId)

  try {
    const { inventory_id, quantity, notes } = await request.json()

    if (!inventory_id || !quantity) {
      return NextResponse.json(
        { error: 'Missing required fields: inventory_id, quantity' },
        { status: 400 }
      )
    }

    if (quantity < 1) {
      return NextResponse.json({ error: 'Quantity must be at least 1' }, { status: 400 })
    }

    let stockQuery = supabaseAdmin.from('inventory').select('quantity_in_stock').eq('id', inventory_id)
    if (tenantId) stockQuery = stockQuery.eq('tenant_id', tenantId)
    const { data: inventoryItem, error: fetchError } = await stockQuery.single()

    if (fetchError || !inventoryItem) {
      return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 })
    }

    const newQuantity = inventoryItem.quantity_in_stock + quantity

    const { data: updatedItem, error: updateError } = await supabaseAdmin
      .from('inventory')
      .update({ quantity_in_stock: newQuantity, updated_at: new Date().toISOString() })
      .eq('id', inventory_id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating inventory:', updateError)
      return NextResponse.json({ error: 'Failed to update inventory' }, { status: 500 })
    }

    Promise.resolve(
      supabaseAdmin
        .from('inventory_transactions')
        .insert({
          inventory_id,
          transaction_type: 'stock_added',
          quantity,
          performed_by: auth.userId,
          notes: notes || `Added ${quantity} units to stock`,
        })
    ).then(() => {}).catch((e: any) => console.error('Error logging transaction:', e))

    return NextResponse.json({
      success: true,
      inventory: updatedItem,
      message: `Successfully added ${quantity} units to stock`,
    })
  } catch (error: any) {
    console.error('Error in add-stock route:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
