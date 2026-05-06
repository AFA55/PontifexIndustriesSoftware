export const dynamic = 'force-dynamic';

/**
 * GET    /api/admin/equipment/[id]   — fetch one
 * PATCH  /api/admin/equipment/[id]   — update mutable fields
 * DELETE /api/admin/equipment/[id]   — soft-delete (status='retired')
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const READ_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager','supervisor','salesman']);
const WRITE_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager']);

const VALID_KIND = ['powered','hand_tool','accessory','vehicle','trailer'];
const VALID_POWER_SOURCE = ['diesel','gas','hydraulic','electric','pneumatic'];
const VALID_STATUS = ['available','assigned','reserved','in_use','pending_putaway','maintenance','in_maintenance','out_of_service','retired'];

const PATCHABLE = [
  'name','short_name','unit_number','aliases','kind','category',
  'make','model','serial_number','power_source','requires_maintenance_schedule',
  'status','location','notes','purchase_date','purchase_cost','photo_url','asset_tag',
] as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!READ_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let q = supabaseAdmin.from('equipment').select('*').eq('id', id);
  if (auth.role !== 'super_admin' && auth.tenantId) q = q.eq('tenant_id', auth.tenantId);
  const { data, error } = await q.single();
  if (error || !data) return NextResponse.json({ error: 'Equipment not found' }, { status: 404 });

  // Also fetch the vehicle row when kind='vehicle'.
  let vehicle: any = null;
  if (data.kind === 'vehicle') {
    const { data: v } = await supabaseAdmin.from('vehicles').select('*').eq('equipment_id', id).maybeSingle();
    vehicle = v;
  }

  return NextResponse.json({ success: true, data: { ...data, vehicle } });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!WRITE_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Verify ownership
  let lookup = supabaseAdmin.from('equipment').select('id, tenant_id').eq('id', id);
  if (auth.role !== 'super_admin' && auth.tenantId) lookup = lookup.eq('tenant_id', auth.tenantId);
  const { data: existing, error: lookupErr } = await lookup.single();
  if (lookupErr || !existing) return NextResponse.json({ error: 'Equipment not found' }, { status: 404 });

  const update: Record<string, unknown> = {};
  for (const k of PATCHABLE) {
    if (k in body) update[k] = body[k];
  }

  // Validate enums
  if ('kind' in update && update.kind && !VALID_KIND.includes(update.kind as string)) {
    return NextResponse.json({ error: `Invalid kind` }, { status: 400 });
  }
  if ('power_source' in update && update.power_source && !VALID_POWER_SOURCE.includes(update.power_source as string)) {
    return NextResponse.json({ error: `Invalid power_source` }, { status: 400 });
  }
  if ('status' in update && update.status && !VALID_STATUS.includes(update.status as string)) {
    return NextResponse.json({ error: `Invalid status` }, { status: 400 });
  }
  if ('aliases' in update) {
    update.aliases = Array.isArray(body.aliases)
      ? body.aliases.filter((x: unknown) => typeof x === 'string' && x.trim()).map((s: string) => s.trim())
      : typeof body.aliases === 'string'
      ? body.aliases.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No patchable fields supplied' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('equipment')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('equipment PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update equipment', details: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!WRITE_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  // Soft delete: flip status to retired. Keep history intact.
  let q = supabaseAdmin.from('equipment').update({ status: 'retired' }).eq('id', id);
  if (auth.role !== 'super_admin' && auth.tenantId) q = q.eq('tenant_id', auth.tenantId);
  const { error } = await q;
  if (error) {
    console.error('equipment DELETE error:', error);
    return NextResponse.json({ error: 'Failed to retire equipment', details: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
