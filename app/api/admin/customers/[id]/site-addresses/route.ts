export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/customers/[id]/site-addresses
 * Returns all saved site addresses for a customer, ordered by use frequency.
 *
 * API Route: POST /api/admin/customers/[id]/site-addresses
 * Upserts a site address — increments use_count if exists, inserts if new.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: customerId } = await params;

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('customer_site_addresses')
      .select('id, address, location_name, use_count, last_used_at')
      .eq('customer_id', customerId)
      .eq('tenant_id', auth.tenantId)
      .order('use_count', { ascending: false })
      .order('last_used_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching site addresses:', error);
      return NextResponse.json({ success: true, data: [] });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Unexpected error in site-addresses GET:', error);
    return NextResponse.json({ success: true, data: [] });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: customerId } = await params;

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const { address, location_name, city, state, zip } = body;

    if (!address?.trim()) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    const normalizedAddress = address.trim();

    // Check if this address already exists for this customer + tenant
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('customer_site_addresses')
      .select('id, use_count')
      .eq('customer_id', customerId)
      .eq('tenant_id', auth.tenantId)
      .eq('address', normalizedAddress)
      .maybeSingle();

    if (lookupError) {
      console.error('Error looking up site address:', lookupError);
      return NextResponse.json({ success: true }); // non-critical, fail gracefully
    }

    if (existing) {
      // Increment use_count and update last_used_at
      await supabaseAdmin
        .from('customer_site_addresses')
        .update({ use_count: existing.use_count + 1, last_used_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      // Insert new record
      await supabaseAdmin
        .from('customer_site_addresses')
        .insert({
          tenant_id: auth.tenantId,
          customer_id: customerId,
          address: normalizedAddress,
          location_name: location_name || null,
          city: city || null,
          state: state || null,
          zip: zip || null,
        });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in site-addresses POST:', error);
    return NextResponse.json({ success: true }); // non-critical
  }
}
