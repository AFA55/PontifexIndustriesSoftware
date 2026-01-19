import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export async function POST(request: Request) {
  try {
    const { inventory_id, quantity, notes, user_id } = await request.json()

    // Validate required fields
    if (!inventory_id || !quantity || !user_id) {
      return NextResponse.json(
        { error: 'Missing required fields: inventory_id, quantity, user_id' },
        { status: 400 }
      )
    }

    if (quantity < 1) {
      return NextResponse.json(
        { error: 'Quantity must be at least 1' },
        { status: 400 }
      )
    }

    // Verify user has permission (admin or inventory_manager)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user_id)
      .single()

    if (!profile || (profile.role !== 'admin' && profile.role !== 'inventory_manager')) {
      return NextResponse.json(
        { error: 'Unauthorized: Insufficient permissions' },
        { status: 403 }
      )
    }

    // Get current inventory item
    const { data: inventoryItem, error: fetchError } = await supabaseAdmin
      .from('inventory')
      .select('quantity_in_stock')
      .eq('id', inventory_id)
      .single()

    if (fetchError || !inventoryItem) {
      return NextResponse.json(
        { error: 'Inventory item not found' },
        { status: 404 }
      )
    }

    // Update inventory stock
    const newQuantity = inventoryItem.quantity_in_stock + quantity

    const { data: updatedItem, error: updateError } = await supabaseAdmin
      .from('inventory')
      .update({
        quantity_in_stock: newQuantity,
        updated_at: new Date().toISOString()
      })
      .eq('id', inventory_id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating inventory:', updateError)
      return NextResponse.json(
        { error: 'Failed to update inventory' },
        { status: 500 }
      )
    }

    // Log transaction
    const { error: transactionError } = await supabaseAdmin
      .from('inventory_transactions')
      .insert({
        inventory_id: inventory_id,
        transaction_type: 'stock_added',
        quantity: quantity,
        performed_by: user_id,
        notes: notes || `Added ${quantity} units to stock`
      })

    if (transactionError) {
      console.error('Error logging transaction:', transactionError)
      // Don't fail the request if transaction logging fails
    }

    return NextResponse.json({
      success: true,
      inventory: updatedItem,
      message: `Successfully added ${quantity} units to stock`
    })

  } catch (error: any) {
    console.error('Error in add-stock route:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
