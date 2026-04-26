export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/maintenance-requests
 * Admin view of all open/in_progress maintenance requests for the tenant,
 * with operator name joined from profiles.
 */

import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const { tenantId } = auth;

  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant associated with your account' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status'); // optional: 'open' | 'in_progress' | 'resolved'

  let query = supabaseAdmin
    .from('equipment_maintenance_requests')
    .select(`
      *,
      operator:profiles!operator_id(id, full_name, email),
      resolver:profiles!resolved_by(id, full_name)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  } else {
    // Default: return open and in_progress only
    query = query.in('status', ['open', 'in_progress']);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching admin maintenance requests:', error);
    return NextResponse.json({ error: 'Failed to fetch maintenance requests' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data }, { status: 200 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const { userId, tenantId } = auth;

  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant associated with your account' }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, status, resolution_notes } = body;

  if (!id || !status) {
    return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
  }

  const validStatuses = ['open', 'in_progress', 'resolved'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
  }

  const updatePayload: any = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'resolved') {
    updatePayload.resolved_at = new Date().toISOString();
    updatePayload.resolved_by = userId;
    if (resolution_notes) updatePayload.resolution_notes = resolution_notes;
  }

  const { data, error } = await supabaseAdmin
    .from('equipment_maintenance_requests')
    .update(updatePayload)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) {
    console.error('Error updating maintenance request:', error);
    return NextResponse.json({ error: 'Failed to update maintenance request' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data }, { status: 200 });
}
