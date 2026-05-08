export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/equipment-checkouts/[id]
 *   Mark a checkout as checked-in. Atomically:
 *     1) sets checked_in_at + checked_in_by + optional hour_meter_in/notes
 *     2) flips equipment.status to 'pending_putaway' (next stop: shop helper
 *        marks it 'available' from the Returned Equipment queue — Phase B(iii))
 *     3) clears current_custodian_id + current_job_order_id on the equipment
 *
 *   Body: { hour_meter_in?, notes?, status_after_checkin? ('available'|'pending_putaway') }
 *
 *   Tier shortcut: shop_manager can pass status_after_checkin='available' to
 *   skip the put-away queue (e.g. they took it directly to the rack). Default
 *   is 'pending_putaway' so the helper queue gets populated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const WRITE_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager','supervisor']);
const VALID_AFTER_STATUS = new Set(['available','pending_putaway']);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!WRITE_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: any;
  try { body = await request.json(); } catch { body = {}; }

  // Look up the checkout. Verify tenant ownership.
  let lookup = supabaseAdmin
    .from('equipment_checkouts')
    .select('id, tenant_id, equipment_id, checked_in_at')
    .eq('id', id);
  if (auth.role !== 'super_admin' && auth.tenantId) lookup = lookup.eq('tenant_id', auth.tenantId);
  const { data: checkout, error: lookupErr } = await lookup.single();
  if (lookupErr || !checkout) return NextResponse.json({ error: 'Checkout not found' }, { status: 404 });

  if (checkout.checked_in_at) {
    return NextResponse.json({ error: 'Already checked in' }, { status: 409 });
  }

  const statusAfter = VALID_AFTER_STATUS.has(body.status_after_checkin)
    ? body.status_after_checkin
    : 'pending_putaway';

  const updates: Record<string, unknown> = {
    checked_in_at: new Date().toISOString(),
    checked_in_by: auth.userId,
  };
  if (typeof body.hour_meter_in === 'number') updates.hour_meter_in = body.hour_meter_in;
  if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes).trim() : null;

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('equipment_checkouts')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (updateErr) {
    console.error('equipment-checkouts PATCH error:', updateErr);
    return NextResponse.json({ error: 'Failed to check in', details: updateErr.message }, { status: 500 });
  }

  // Flip equipment status + clear custodian/job
  const { error: eqErr } = await supabaseAdmin
    .from('equipment')
    .update({
      status: statusAfter,
      current_custodian_id: null,
      current_job_order_id: null,
    })
    .eq('id', checkout.equipment_id);
  if (eqErr) {
    console.error('equipment status reset error:', eqErr);
    // Don't roll back the checkout — the checked-in record is still accurate.
    // Operator can manually flip status from the equipment detail page.
    return NextResponse.json({
      success: true,
      data: updated,
      warning: 'Checked in OK but equipment status update failed — please update manually.',
    });
  }

  return NextResponse.json({ success: true, data: updated });
}
