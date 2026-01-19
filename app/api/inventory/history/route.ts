import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key'

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionType = searchParams.get('type')
    const inventoryId = searchParams.get('inventory_id')
    const limit = parseInt(searchParams.get('limit') || '100')

    // Build query - Note: operator_id and performed_by reference auth.users, not profiles
    let query = supabaseAdmin
      .from('inventory_transactions')
      .select(`
        id,
        transaction_type,
        quantity_change,
        quantity_before,
        quantity_after,
        operator_id,
        performed_by,
        serial_number,
        notes,
        transaction_date,
        inventory:inventory_id (
          id,
          name,
          category,
          manufacturer,
          model_number,
          size
        ),
        equipment:equipment_id (
          id,
          serial_number,
          status
        )
      `)
      .order('transaction_date', { ascending: false })

    // Apply filters
    if (transactionType && transactionType !== 'all') {
      query = query.eq('transaction_type', transactionType)
    }

    if (inventoryId) {
      query = query.eq('inventory_id', inventoryId)
    }

    query = query.limit(limit)

    const { data: transactions, error } = await query

    if (error) {
      console.error('Error fetching inventory history:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    // Now fetch operator and performed_by names from profiles
    const operatorIds = [...new Set(transactions?.map(t => t.operator_id).filter(Boolean) || [])]
    const performedByIds = [...new Set(transactions?.map(t => t.performed_by).filter(Boolean) || [])]
    const allUserIds = [...new Set([...operatorIds, ...performedByIds])]

    let userProfiles: any = {}
    if (allUserIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', allUserIds)

      profiles?.forEach(profile => {
        userProfiles[profile.id] = profile
      })
    }

    // Enrich transactions with user data
    const enrichedData = transactions?.map(t => ({
      ...t,
      operator: t.operator_id ? userProfiles[t.operator_id] : null,
      performed_by_user: t.performed_by ? userProfiles[t.performed_by] : null
    }))

    return NextResponse.json({
      success: true,
      data: enrichedData || []
    })

  } catch (error: any) {
    console.error('Error in history route:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
