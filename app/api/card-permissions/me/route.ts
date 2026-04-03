export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/card-permissions/me
 * Get the current authenticated user's dashboard card permissions.
 * Returns: { role: string, permissions: Record<string, PermissionLevel> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import type { PermissionLevel } from '@/lib/rbac';

// GET: Current user's card permissions as a map
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;
    const tenantId = await getTenantId(auth.userId);

    // Query is already user-scoped (eq user_id), tenant_id available for future use
    const { data: rows, error } = await supabaseAdmin
      .from('user_card_permissions')
      .select('card_key, permission_level')
      .eq('user_id', auth.userId);

    if (error) {
      console.error('[card-permissions/me GET] Fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch card permissions' },
        { status: 500 }
      );
    }

    // Convert rows into a Record<string, PermissionLevel> map
    const permMap: Record<string, PermissionLevel> = {};
    (rows || []).forEach((r: { card_key: string; permission_level: string }) => {
      permMap[r.card_key] = r.permission_level as PermissionLevel;
    });

    return NextResponse.json({
      success: true,
      role: auth.role,
      tenantId: tenantId || null,
      permissions: permMap,
    });
  } catch (error: any) {
    console.error('[card-permissions/me GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
