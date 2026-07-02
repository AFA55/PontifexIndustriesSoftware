export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/maintenance-requests/[id]
 * Shop manager / admin: triage — update status, priority, resolution notes.
 * Auth: shop_manager, admin, super_admin, operations_manager
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { sendPushToUser } from '@/lib/send-push';

const SHOP_ROLES = ['shop_manager', 'admin', 'super_admin', 'operations_manager'];
const VALID_STATUSES = ['open', 'in_progress', 'done', 'cancelled'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const VALID_EQUIPMENT_RESOLUTIONS = ['returned_to_service', 'out_of_service'];

/**
 * Map the new maintenance-request status to an equipment.status value.
 * Returns null when the equipment status should be left unchanged.
 * Valid equipment.status (per equipment_status_check):
 *   available | assigned | reserved | in_use | pending_putaway |
 *   maintenance | in_maintenance | out_of_service | retired
 */
function resolveEquipmentStatus(
  requestStatus: string,
  priority: string | undefined,
  equipmentResolution: string | undefined
): string | null {
  switch (requestStatus) {
    case 'in_progress':
      return 'in_maintenance';
    case 'open':
      // High-urgency open requests pull the asset offline proactively.
      return priority === 'critical' || priority === 'high' ? 'in_maintenance' : null;
    case 'done':
      return equipmentResolution === 'out_of_service' ? 'out_of_service' : 'available';
    case 'cancelled':
    default:
      return null;
  }
}

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

  // Sync the linked equipment's status to reflect the triage outcome.
  // Fire-and-forget, but log failures so a CHECK violation / RLS issue surfaces.
  if (existing.equipment_id && typeof update.status === 'string') {
    const equipmentResolution =
      typeof body.equipment_resolution === 'string' &&
      VALID_EQUIPMENT_RESOLUTIONS.includes(body.equipment_resolution)
        ? body.equipment_resolution
        : undefined;
    // Use the patched priority if supplied, otherwise the new request status alone drives it.
    const effectivePriority =
      typeof update.priority === 'string' ? update.priority : undefined;
    const targetEquipmentStatus = resolveEquipmentStatus(
      update.status as string,
      effectivePriority,
      equipmentResolution
    );

    if (targetEquipmentStatus) {
      const equipmentId = existing.equipment_id as string;
      Promise.resolve((async () => {
        let eqUpdate = supabaseAdmin
          .from('equipment')
          .update({ status: targetEquipmentStatus })
          .eq('id', equipmentId);
        if (auth.role !== 'super_admin' && auth.tenantId) {
          eqUpdate = eqUpdate.eq('tenant_id', auth.tenantId);
        }
        const { error: eqErr } = await eqUpdate;
        if (eqErr) {
          console.error(
            `admin/maintenance-requests: failed to sync equipment ${equipmentId} status to ${targetEquipmentStatus}:`,
            eqErr
          );
        }
      })()).catch((e) => {
        console.error('admin/maintenance-requests: equipment status sync threw:', e);
      });
    }
  }

  // Fire-and-forget: notify submitter when resolved
  if (update.status === 'done') {
    Promise.resolve((async () => {
      const equipmentLabel = existing.equipment_name ?? 'your equipment';
      // NOTE: '/dashboard/maintenance/new' is the NEW-REQUEST form, not a
      // detail/history view — linking a "resolved" notification there was
      // wrong (nothing there shows the resolved request). There is no
      // per-request detail route for submitters (the triage inbox at
      // /dashboard/admin/maintenance is role-gated to shop_manager/admin/
      // super_admin/operations_manager, which most submitters are not), so
      // the safe, always-accessible landing spot is the notifications page,
      // where this exact message (with resolution context) lives.
      await supabaseAdmin.from('notifications').insert({
        user_id: existing.submitted_by,
        tenant_id: existing.tenant_id,
        type: 'success',
        title: 'Issue Resolved',
        message: `Your maintenance request for ${equipmentLabel} has been resolved.`,
        notification_type: 'maintenance_resolved',
        related_entity_type: 'maintenance_request',
        related_entity_id: id,
        action_url: '/dashboard/notifications',
      });

      // Parallel native push to the submitter — fire-and-forget.
      sendPushToUser(existing.submitted_by, {
        title: 'Issue Resolved',
        body: `Your maintenance request for ${equipmentLabel} has been resolved.`,
        data: { route: '/dashboard/notifications' },
      }).catch(() => {});
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
