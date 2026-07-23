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
    let invQuery = supabaseAdmin.from('inventory').select('*').order('created_at', { ascending: false })
    if (tenantId) invQuery = invQuery.eq('tenant_id', tenantId)
    const { data: inventory, error } = await invQuery

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
  const tenantId = await getTenantId(auth.userId)

  try {
    const inventoryData = await request.json()

    // Allowlist writable columns instead of spreading the whole body — a raw
    // spread let a client set id/created_by/total_value/etc. (mass assignment,
    // security audit M4). tenant_id + created_by are server-derived.
    const insertRow: Record<string, unknown> = {
      tenant_id: tenantId || null,
      created_by: auth.userId,
    }
    for (const k of [
      'name', 'category', 'manufacturer', 'model_number', 'size', 'equipment_for',
      'quantity_in_stock', 'quantity_assigned', 'reorder_level', 'unit_price',
      'total_value', 'qr_code_data', 'qr_code_url', 'notes', 'location',
    ] as const) {
      if (inventoryData[k] !== undefined) insertRow[k] = inventoryData[k]
    }

    const { data: newInventory, error } = await supabaseAdmin
      .from('inventory')
      .insert(insertRow)
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
