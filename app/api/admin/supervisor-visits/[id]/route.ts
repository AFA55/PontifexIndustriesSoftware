export const dynamic = 'force-dynamic';

/**
 * GET   /api/admin/supervisor-visits/[id]   -> fetch a single visit
 * PATCH /api/admin/supervisor-visits/[id]   -> update a visit (author or admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const WRITE_ROLES = new Set(['supervisor', 'admin', 'super_admin', 'operations_manager']);

const PATCHABLE_FIELDS = [
  'arrival_time',
  'departure_time',
  'observations',
  'issues_flagged',
  'follow_up_required',
  'follow_up_notes',
  'performance_rating',
  'safety_rating',
  'cleanliness_rating',
  'photo_urls',
  'status',
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  let query = supabaseAdmin.from('supervisor_visits').select('*').eq('id', id);
  if (auth.role !== 'super_admin' && auth.tenantId) {
    query = query.eq('tenant_id', auth.tenantId);
  }
  const { data, error } = await query.single();

  if (error || !data) {
    return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
  }

  // Supervisors can only see their own; operators can see ones about themselves; admins see all-in-tenant.
  const isAdmin = ['admin', 'super_admin', 'operations_manager'].includes(auth.role);
  const isAuthor = data.supervisor_id === auth.userId;
  const isSubject = data.operator_id === auth.userId;
  if (!isAdmin && !isAuthor && !isSubject) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ success: true, data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  if (!WRITE_ROLES.has(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  // Authorize: supervisor only patches their own; admins patch any in tenant.
  let lookup = supabaseAdmin
    .from('supervisor_visits')
    .select('id, supervisor_id, tenant_id')
    .eq('id', id);
  if (auth.role !== 'super_admin' && auth.tenantId) {
    lookup = lookup.eq('tenant_id', auth.tenantId);
  }
  const { data: existing, error: lookupErr } = await lookup.single();
  if (lookupErr || !existing) {
    return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
  }

  const isAdmin = ['admin', 'super_admin', 'operations_manager'].includes(auth.role);
  if (!isAdmin && existing.supervisor_id !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const update: Record<string, unknown> = {};
  for (const f of PATCHABLE_FIELDS) {
    if (f in body) update[f] = body[f];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No patchable fields supplied' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('supervisor_visits')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('supervisor-visits PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update visit' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
