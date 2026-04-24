export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/team-profiles/[id]/credentials
 *   Returns credential/certification fields for an operator/apprentice profile.
 *
 * PUT  /api/admin/team-profiles/[id]/credentials
 *   Body: { medical_card_expiry, drivers_license_expiry, drivers_license_class,
 *           osha_10_expiry, osha_30_expiry, certifications }
 *   All fields are optional; null clears a field.
 *
 * Writes are strictly scoped to the caller's tenant_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, resolveTenantScope } from '@/lib/api-auth';

const ALLOWED_FIELDS = [
  'medical_card_expiry',
  'drivers_license_expiry',
  'drivers_license_class',
  'osha_10_expiry',
  'osha_30_expiry',
  'certifications',
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select(
        'id, medical_card_expiry, drivers_license_expiry, drivers_license_class, osha_10_expiry, osha_30_expiry, certifications'
      )
      .eq('id', id)
      .eq('tenant_id', scope.tenantId)
      .maybeSingle();

    if (error) {
      console.error('credentials GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch credentials' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Unexpected error in GET credentials:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of ALLOWED_FIELDS) {
      if (key in body) patch[key] = body[key] ?? null;
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', scope.tenantId)
      .select(
        'id, medical_card_expiry, drivers_license_expiry, drivers_license_class, osha_10_expiry, osha_30_expiry, certifications'
      )
      .single();

    if (error) {
      console.error('credentials PUT error:', error);
      return NextResponse.json({ error: 'Failed to update credentials' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Unexpected error in PUT credentials:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
