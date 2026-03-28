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

    // Fetch equipment details (tenant-scoped)
    let eqQuery = supabaseAdmin.from('equipment').select('*').eq('id', equipmentId)
    if (tenantId) eqQuery = eqQuery.eq('tenant_id', tenantId)
    const { data: equipment, error } = await eqQuery.single()

    if (error || !equipment) {
      return NextResponse.json({ error: 'Equipment not found' }, { status: 404 })
    }

    return NextResponse.json(equipment)

  } catch (error) {
    console.error('Error in equipment API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
