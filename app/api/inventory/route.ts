import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth, requireAdmin } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (!auth.authorized) return auth.response

    // Get query params for pagination and filtering
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10)))
    const category = searchParams.get('category')
    const search = searchParams.get('search')

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // Build query with count
    let query = supabaseAdmin
      .from('inventory')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    // Apply optional category filter
    if (category) {
      query = query.eq('category', category)
    }

    // Apply optional text search
    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    const { data: inventory, count: total, error } = await query

    if (error) {
      console.error('Error fetching inventory:', error)
      return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 })
    }

    const totalCount = total ?? 0
    const totalPages = Math.ceil(totalCount / pageSize)

    return NextResponse.json({
      data: inventory || [],
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages,
      },
    })
  } catch (error) {
    console.error('Error in inventory API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) return auth.response

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
    const { error: transactionError } = await supabaseAdmin
      .from('inventory_transactions')
      .insert({
        inventory_id: newInventory.id,
        transaction_type: 'add_stock',
        quantity_change: inventoryData.quantity_in_stock || 0,
        quantity_before: 0,
        quantity_after: inventoryData.quantity_in_stock || 0,
        notes: `Initial stock added: ${inventoryData.quantity_in_stock || 0} units`,
        performed_by: auth.userId
      })

    if (transactionError) {
      console.error('Error creating transaction record:', transactionError)
    }

    return NextResponse.json(newInventory)
  } catch (error) {
    console.error('Error in inventory POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
