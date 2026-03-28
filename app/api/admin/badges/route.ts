/**
 * API Route: GET /api/admin/badges — List all badges (with optional filters)
 * API Route: POST /api/admin/badges — Create a new badge
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
    const facilityId = searchParams.get('facility_id');
    const operatorId = searchParams.get('operator_id');
    const status = searchParams.get('status');

    // Try the view first
    let query = supabaseAdmin
      .from('badges_with_details')
      .select('*')
      .order('facility_name')
      .order('operator_name');

    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (facilityId) query = query.eq('facility_id', facilityId);
    if (operatorId) query = query.eq('operator_id', operatorId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching badges from view:', error);
      // Fallback to base table
      let fallbackQuery = supabaseAdmin
        .from('operator_facility_badges')
        .select(`
          *,
          operator:profiles!operator_id(id, full_name, email),
          facility:facilities!facility_id(id, name)
        `)
        .order('created_at', { ascending: false });

      if (facilityId) fallbackQuery = fallbackQuery.eq('facility_id', facilityId);
      if (operatorId) fallbackQuery = fallbackQuery.eq('operator_id', operatorId);
      if (status) fallbackQuery = fallbackQuery.eq('status', status);

      const { data: fallbackData, error: fallbackError } = await fallbackQuery;

      if (fallbackError) {
        console.error('Fallback query failed:', fallbackError);
        return NextResponse.json({ error: 'Failed to fetch badges' }, { status: 500 });
      }

      const transformed = (fallbackData || []).map((b: any) => ({
        ...b,
        operator_name: b.operator?.full_name || 'Unknown',
        operator_email: b.operator?.email || '',
        facility_name: b.facility?.name || 'Unknown',
        expiry_status: !b.expiry_date ? 'no_expiry' :
          new Date(b.expiry_date) < new Date() ? 'expired' :
          new Date(b.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) ? 'expiring_soon' : 'valid',
      }));

      return NextResponse.json({ success: true, data: transformed });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/badges:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { operator_id, facility_id, badge_number, issued_date, expiry_date, notes } = body;

    if (!operator_id || !facility_id) {
      return NextResponse.json({ error: 'Operator and facility are required' }, { status: 400 });
    }

    // Check for duplicate active badge
    const { data: existing } = await supabaseAdmin
      .from('operator_facility_badges')
      .select('id')
      .eq('operator_id', operator_id)
      .eq('facility_id', facility_id)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'This operator already has an active badge at this facility' }, { status: 409 });
    }

    const tenantId = await getTenantId(auth.userId);

    const { data, error } = await supabaseAdmin
      .from('operator_facility_badges')
      .insert({
        operator_id,
        facility_id,
        badge_number: badge_number?.trim() || null,
        issued_date: issued_date || new Date().toISOString().split('T')[0],
        expiry_date: expiry_date || null,
        status: 'active',
        notes: notes?.trim() || null,
        created_by: auth.userId,
        tenant_id: tenantId || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating badge:', error);
      return NextResponse.json({ error: 'Failed to create badge' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/badges:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
