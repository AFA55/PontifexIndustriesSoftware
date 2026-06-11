export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/access-requests
 * List access requests for the caller's tenant — including "unclaimed" rows
 * (tenant_id IS NULL): the public /request-access form has no tenant context,
 * so every request arrives unclaimed and is stamped with the acting admin's
 * tenant when approved/denied.
 *
 * Auth: requireAdmin (admin / super_admin / operations_manager).
 * super_admin may target another tenant via ?tenantId= (resolveTenantScope).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, resolveTenantScope } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ACCESS_REQUEST_SELECT, tenantOrUnclaimedFilter } from '@/lib/access-requests';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;

    const { data, error } = await supabaseAdmin
      .from('access_requests')
      .select(ACCESS_REQUEST_SELECT)
      .or(tenantOrUnclaimedFilter(scope.tenantId))
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[admin/access-requests] GET error:', error);
      return NextResponse.json({ error: 'Failed to load access requests' }, { status: 500 });
    }

    const requests = data || [];
    const pendingCount = requests.filter((r) => r.status === 'pending').length;

    return NextResponse.json({ success: true, data: { requests, pendingCount } });
  } catch (err) {
    console.error('[admin/access-requests] GET unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
