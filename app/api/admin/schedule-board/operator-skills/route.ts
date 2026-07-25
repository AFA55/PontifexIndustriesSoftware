export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/schedule-board/operator-skills
 * Returns all operators with id, full_name, skill_level_numeric.
 *
 * PATCH /api/admin/schedule-board/operator-skills
 * Updates skill_level_numeric for an operator.
 * Body: { operator_id, skill_level }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, requireSuperAdmin, resolveTenantScope } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Scope to the caller's tenant — supabaseAdmin bypasses RLS.
    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    const { data: operators, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, skill_level_numeric')
      .eq('tenant_id', tenantId)
      .eq('role', 'operator')
      .order('full_name');

    if (error) {
      console.error('Error fetching operator skills:', error);
      return NextResponse.json({ error: 'Failed to fetch operator skills' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: operators || [] });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/schedule-board/operator-skills:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.authorized) return auth.response;

    // Scope the update to the caller's tenant — supabaseAdmin bypasses RLS, so
    // without this a super_admin's PATCH could rewrite another tenant's operator.
    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    const body = await request.json();
    const { operator_id, skill_level } = body;

    if (!operator_id) {
      return NextResponse.json({ error: 'Missing required field: operator_id' }, { status: 400 });
    }

    if (skill_level !== null && (typeof skill_level !== 'number' || skill_level < 1 || skill_level > 10)) {
      return NextResponse.json({ error: 'skill_level must be between 1 and 10, or null' }, { status: 400 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update({ skill_level_numeric: skill_level })
      .eq('id', operator_id)
      .eq('tenant_id', tenantId)
      .select('id, full_name, skill_level_numeric')
      .single();

    if (error) {
      console.error('Error updating operator skill:', error);
      return NextResponse.json({ error: 'Failed to update operator skill' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/admin/schedule-board/operator-skills:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
