export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/maintenance-requests
 * Shop manager / admin: list maintenance requests with pagination.
 * Auth: shop_manager, admin, super_admin, operations_manager
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const SHOP_ROLES = ['shop_manager', 'admin', 'super_admin', 'operations_manager'];

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  if (!SHOP_ROLES.includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden. Shop manager or admin access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'open';
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10));
  const limit = 20;
  const offset = page * limit;

  // Build query with joins
  let query = supabaseAdmin
    .from('maintenance_requests')
    .select(`
      id, description, priority, status, request_type, equipment_name, photo_urls,
      voice_note_url, resolution_notes, resolved_at, supervisor_visit_id,
      created_at, updated_at,
      equipment:equipment_id ( id, name, unit_number ),
      submitter:submitted_by ( id, full_name, role ),
      resolver:resolved_by ( id, full_name )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Tenant scoping
  if (auth.role !== 'super_admin' && auth.tenantId) {
    query = query.eq('tenant_id', auth.tenantId);
  }

  // Status filter — 'closed' maps to both done + cancelled
  if (status === 'closed') {
    query = query.in('status', ['done', 'cancelled']);
  } else {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('admin/maintenance-requests GET error:', error);
    return NextResponse.json({ error: 'Failed to load requests', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? [], total: count ?? 0 });
}
