export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/po-lookup?po=12345
 * Look up a PO number in job_orders and return matching customer/location data.
 * Used by the schedule form to auto-fill customer info when a known PO is entered.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const po = searchParams.get('po');

    if (!po?.trim()) {
      return NextResponse.json({ error: 'PO number is required' }, { status: 400 });
    }

    // Find the most recent job with this PO number
    const { data, error } = await supabaseAdmin
      .from('job_orders')
      .select('customer_name, address, location, customer_contact, site_contact_phone')
      .ilike('po_number', po.trim())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      // No match found — not an error, just no data
      return NextResponse.json({ match: null });
    }

    return NextResponse.json({
      match: {
        customer_name: data.customer_name || '',
        address: data.address || '',
        location: data.location || '',
        customer_contact: data.customer_contact || '',
        site_contact_phone: data.site_contact_phone || '',
      },
    });
  } catch (error: any) {
    console.error('PO lookup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
