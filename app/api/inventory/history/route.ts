export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/api-auth'
import { getTenantId } from '@/lib/get-tenant-id'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.authorized) return auth.response
  const tenantId = await getTenantId(auth.userId)

  try {
    const { searchParams } = new URL(request.url)
    const transactionType = searchParams.get('type')
    const inventoryId = searchParams.get('inventory_id')
    const limit = parseInt(searchParams.get('limit') || '100')

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
          id, name, category, manufacturer, model_number, size
        ),
        equipment:equipment_id (
          id, serial_number, status
        )
      `)
      .order('transaction_date', { ascending: false })

    if (tenantId) query = query.eq('tenant_id', tenantId)
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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const operatorIds = [...new Set(transactions?.map((t: any) => t.operator_id).filter(Boolean) || [])]
    const performedByIds = [...new Set(transactions?.map((t: any) => t.performed_by).filter(Boolean) || [])]
    const allUserIds = [...new Set([...operatorIds, ...performedByIds])]

    let userProfiles: Record<string, any> = {}
    if (allUserIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', allUserIds)
      profiles?.forEach((profile: any) => { userProfiles[profile.id] = profile })
    }

    const enrichedData = transactions?.map((t: any) => ({
      ...t,
      operator: t.operator_id ? userProfiles[t.operator_id] : null,
      performed_by_user: t.performed_by ? userProfiles[t.performed_by] : null,
    }))

    return NextResponse.json({ success: true, data: enrichedData || [] })
  } catch (error: any) {
    console.error('Error in history route:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
