import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/api-auth'
import { getTenantId } from '@/lib/get-tenant-id'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (!auth.authorized) return auth.response
    const tenantId = await getTenantId(auth.userId)

    const { id: equipmentId } = await params

    // Fetch usage history for this equipment (tenant-scoped)
    let usageQuery = supabaseAdmin
      .from('blade_usage_history')
      .select(`
        *,
        operator:users!blade_usage_history_operator_id_fkey(
          full_name
        ),
        job_order:job_orders(
          location
        )
      `)
      .eq('equipment_id', equipmentId)
      .order('usage_date', { ascending: false })
    if (tenantId) usageQuery = usageQuery.eq('tenant_id', tenantId)
    const { data: usageHistory, error } = await usageQuery

    if (error) {
      console.error('Error fetching usage history:', error)
      return NextResponse.json({ error: 'Failed to fetch usage history' }, { status: 500 })
    }

    return NextResponse.json(usageHistory || [])

  } catch (error) {
    console.error('Error in usage-history API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
