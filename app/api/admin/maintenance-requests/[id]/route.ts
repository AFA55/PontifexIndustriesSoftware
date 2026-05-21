export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/maintenance-requests/[id]
 * Shop manager / admin: triage — update status, priority, resolution notes.
 * Auth: shop_manager, admin, super_admin, operations_manager
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const SHOP_ROLES = ['shop_manager', 'admin', 'super_admin', 'operations_manager'];
const VALID_STATUSES = ['open', 'in_progress', 'done', 'cancelled'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  if (!SHOP_ROLES.includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden. Shop manager or admin access required.' }, { status: 403 });
  }

  const { id } = await params;

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  // Verify request exists in tenant
  let lookup = supabaseAdmin
    .from('maintenance_requests')
    .select('id, tenant_id, status, equipment_name, equipment_id, submitted_by')
    .eq('id', id);
  if (auth.role !== 'super_admin' && auth.tenantId) {
    lookup = lookup.eq('tenant_id', auth.tenantId);
  }
  const { data: existing, error: lookupErr } = await lookup.single();
  if (lookupErr || !existing) {
    return NextResponse.json({ error: 'Maintenance request not found' }, { status: 404 });
  }

  const update: Record<string, unknown> = {};

  if ('status' in body && VALID_STATUSES.includes(body.status)) {
    update.status = body.status;
    if (body.status === 'done') {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = auth.userId;
    }
  }
  if ('priority' in body && VALID_PRIORITIES.includes(body.priority)) {
    update.priority = body.priority;
  }
  if ('resolution_notes' in body) {
    update.resolution_notes = (body.resolution_notes ?? '').trim() || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No patchable fields supplied' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('maintenance_requests')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('admin/maintenance-requests PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update request', details: error.message }, { status: 500 });
  }

  // Fire-and-forget: notify submitter when resolved
  if (update.status === 'done') {
    Promise.resolve((async () => {
      const equipmentLabel = existing.equipment_name ?? 'your equipment';
      await supabaseAdmin.from('notifications').insert({
        user_id: existing.submitted_by,
        tenant_id: existing.tenant_id,
        type: 'success',
        title: 'Issue Resolved',
        message: `Your maintenance request for ${equipmentLabel} has been resolved.`,
        notification_type: 'maintenance_resolved',
        related_entity_type: 'maintenance_request',
        related_entity_id: id,
        action_url: '/dashboard/maintenance/new',
      });
    })()).catch(() => {});

    // Fire-and-forget: if the equipment is a vehicle, auto-create a service record
    if (existing.equipment_id) {
      Promise.resolve((async () => {
        // Check if this equipment is a vehicle
        const { data: eq } = await supabaseAdmin
          .from('equipment')
          .select('id, kind')
          .eq('id', existing.equipment_id)
          .maybeSingle();

        if (eq?.kind !== 'vehicle') return;

        // Look up the vehicles row by equipment_id to get the vehicle UUID
        const { data: vehicle } = await supabaseAdmin
          .from('vehicles')
          .select('id')
          .eq('equipment_id', existing.equipment_id)
          .maybeSingle();

        if (!vehicle?.id) return;

        // Build a human-readable note from the maintenance request fields
        const noteParts: string[] = [];
        if (data.equipment_name) noteParts.push(data.equipment_name);
        if (data.description) noteParts.push(data.description);
        if (data.resolution_notes) noteParts.push(`Resolution: ${data.resolution_notes}`);
        const notes = noteParts.join(' — ') || 'Maintenance completed';

        await supabaseAdmin.from('vehicle_service_records').insert({
          tenant_id:              existing.tenant_id,
          vehicle_id:             vehicle.id,
          service_type:           'repair',
          notes,
          service_date:           new Date().toISOString().slice(0, 10), // YYYY-MM-DD
          maintenance_request_id: id,
          vendor:                 'Maintenance System (auto)',
          created_by:             auth.userId,
        });
      })()).catch(() => {});
    }
  }

  return NextResponse.json({ success: true, data });
}
