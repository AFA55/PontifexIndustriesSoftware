export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/card-permissions/me
 * Get the current authenticated user's dashboard card permissions.
 * Returns: { role: string, permissions: Record<string, PermissionLevel> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { loadUserCardPermissionsResult } from '@/lib/card-permissions-server';
import type { PermissionLevel } from '@/lib/rbac';

// GET: Current user's card permissions as a map
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;
    const tenantId = await getTenantId(auth.userId);

    // Same loader the API guards use (lib/card-permissions-server.ts), so what
    // the browser is told and what the server will enforce can never disagree —
    // including the tenant scoping, which matters because supabaseAdmin bypasses
    // RLS.
    const { permissions, lookupFailed } = await loadUserCardPermissionsResult(auth.userId, tenantId);

    // A failed READ must not be reported as "you have no overrides". That is
    // indistinguishable, to the browser, from a real empty result — and the
    // page would quietly drop to the role preset and take Amanda's payroll
    // controls away with no explanation. Say so instead; the hook retries.
    if (lookupFailed) {
      return NextResponse.json(
        { error: 'Could not read card permissions', code: 'card_permission_unavailable' },
        { status: 503 }
      );
    }

    const permMap: Record<string, PermissionLevel> = permissions ?? {};

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
