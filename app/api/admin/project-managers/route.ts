export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/project-managers
 * Lists the office people eligible to be a job's project manager —
 * managers & admins (operations_manager, admin, super_admin). Field roles
 * (operator/apprentice) are never PMs. Tenant-scoped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

// Who can own a job as its project manager (founder decision: managers & admins).
const PM_ROLES = ['super_admin', 'operations_manager', 'admin'];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    let query = supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, email')
      .in('role', PM_ROLES)
      .order('full_name', { ascending: true });

    // Tenant scope (super_admin may have no tenant → sees all).
    if (auth.tenantId) query = query.eq('tenant_id', auth.tenantId);

    const { data, error } = await query;
    if (error) {
      console.error('Error listing project managers:', error);
      return NextResponse.json({ error: 'Failed to load project managers' }, { status: 500 });
    }

    // Drop rows with no name so the picker never shows a blank option.
    const managers = (data || [])
      .filter((p: any) => (p.full_name || '').trim())
      .map((p: any) => ({ id: p.id, name: p.full_name, role: p.role }));

    return NextResponse.json({ success: true, data: managers });
  } catch (error) {
    console.error('Unexpected error in project-managers GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
