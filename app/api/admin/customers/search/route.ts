export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/customers/search
 * GET: Lightweight autocomplete search for customers
 * Returns top 10 matches with id, name, primary_contact_name, primary_contact_phone, address
 * Uses requireAuth (not requireAdmin) so schedule form can use it
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';

    if (!q.trim()) {
      return NextResponse.json({ success: true, data: [] });
    }

    let query = supabaseAdmin
      .from('customers')
      .select('id, name, primary_contact_name, primary_contact_phone, address')
      .ilike('name', `%${q.trim()}%`)
      .order('name', { ascending: true })
      .limit(10);

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data: customers, error } = await query;

    if (error) {
      console.error('Error searching customers:', error);
      return NextResponse.json({ error: 'Failed to search customers' }, { status: 500 });
    }

    // Map to consistent interface (name -> company_name for frontend)
    const mapped = (customers || []).map(c => ({
      id: c.id,
      company_name: c.name,
      primary_contact_name: c.primary_contact_name,
      primary_contact_phone: c.primary_contact_phone,
      address: c.address,
    }));

    return NextResponse.json({ success: true, data: mapped });
  } catch (error) {
    console.error('Unexpected error in customer search:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
