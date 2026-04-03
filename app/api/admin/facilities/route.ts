export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/facilities — List all facilities
 * API Route: POST /api/admin/facilities — Create a new facility
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active_only') !== 'false'; // default true

    let query = supabaseAdmin
      .from('facilities')
      .select('*')
      .order('name');

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching facilities:', error);
      return NextResponse.json({ error: 'Failed to fetch facilities' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/facilities:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { name, address, city, state, zip, special_requirements, orientation_required, badging_required, compliance_documents, notes } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Facility name is required' }, { status: 400 });
    }

    const tenantId = await getTenantId(auth.userId);

    const { data, error } = await supabaseAdmin
      .from('facilities')
      .insert({
        name: name.trim(),
        address: address?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zip: zip?.trim() || null,
        special_requirements: special_requirements?.trim() || null,
        orientation_required: orientation_required ?? false,
        badging_required: badging_required ?? false,
        compliance_documents: compliance_documents || null,
        notes: notes?.trim() || null,
        created_by: auth.userId,
        tenant_id: tenantId || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating facility:', error);
      return NextResponse.json({ error: 'Failed to create facility' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/facilities:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
