export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/schedule-board/operators
 * Fetch all operators and helpers (apprentices) for the schedule board dropdowns.
 * Access: admin, super_admin, salesman
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    // Fetch operators (role = 'operator')
    let opQuery = supabaseAdmin
      .from('profiles')
      .select('id, full_name, role')
      .eq('role', 'operator')
      .order('full_name');
    opQuery = opQuery.eq('tenant_id', tenantId);
    const { data: operators, error: opError } = await opQuery;

    if (opError) {
      console.error('Error fetching operators:', opError);
      return NextResponse.json(
        { error: 'Failed to fetch operators' },
        { status: 500 }
      );
    }

    // Fetch helpers (role = 'apprentice')
    let helpQuery = supabaseAdmin
      .from('profiles')
      .select('id, full_name, role')
      .eq('role', 'apprentice')
      .order('full_name');
    helpQuery = helpQuery.eq('tenant_id', tenantId);
    const { data: helpers, error: helpError } = await helpQuery;

    if (helpError) {
      console.error('Error fetching helpers:', helpError);
      return NextResponse.json(
        { error: 'Failed to fetch helpers' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        operators: (operators || []).map(p => ({ id: p.id, name: p.full_name || 'Unknown' })),
        helpers: (helpers || []).map(p => ({ id: p.id, name: p.full_name || 'Unknown' })),
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/schedule-board/operators:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
