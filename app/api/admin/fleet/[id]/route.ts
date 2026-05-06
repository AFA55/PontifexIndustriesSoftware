export const dynamic = 'force-dynamic';

/**
 * GET   /api/admin/fleet/[id]   — vehicle detail (equipment + vehicles join)
 * PATCH /api/admin/fleet/[id]   — update mutable equipment + vehicle fields
 *
 * Note: [id] is the equipment.id (the public identifier). The vehicles row is
 * looked up via vehicles.equipment_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const READ_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager','supervisor','salesman']);
const WRITE_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager']);

const EQ_PATCHABLE = ['name','short_name','unit_number','make','model','serial_number','status','location','notes','photo_url'] as const;
const VEH_PATCHABLE = ['vin','license_plate','year','fuel_type','odometer','registration_expiry','insurance_expiry','inspection_expiry'] as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!READ_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let q = supabaseAdmin.from('equipment').select('*').eq('id', id).eq('kind', 'vehicle');
  if (auth.role !== 'super_admin' && auth.tenantId) q = q.eq('tenant_id', auth.tenantId);
  const { data: equipment, error } = await q.single();
  if (error || !equipment) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

  const { data: vehicle } = await supabaseAdmin.from('vehicles').select('*').eq('equipment_id', id).maybeSingle();
  return NextResponse.json({ success: true, data: { ...equipment, vehicle } });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!WRITE_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Verify ownership
  let lookup = supabaseAdmin.from('equipment').select('id, tenant_id').eq('id', id).eq('kind', 'vehicle');
  if (auth.role !== 'super_admin' && auth.tenantId) lookup = lookup.eq('tenant_id', auth.tenantId);
  const { data: existing, error: lookupErr } = await lookup.single();
  if (lookupErr || !existing) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

  const eqUpdate: Record<string, unknown> = {};
  for (const k of EQ_PATCHABLE) if (k in body) eqUpdate[k] = body[k];

  const vehUpdate: Record<string, unknown> = {};
  for (const k of VEH_PATCHABLE) if (k in body) vehUpdate[k] = body[k];

  if (Object.keys(eqUpdate).length === 0 && Object.keys(vehUpdate).length === 0) {
    return NextResponse.json({ error: 'No patchable fields' }, { status: 400 });
  }

  if (Object.keys(eqUpdate).length > 0) {
    const { error } = await supabaseAdmin.from('equipment').update(eqUpdate).eq('id', id);
    if (error) {
      console.error('fleet PATCH equipment error:', error);
      return NextResponse.json({ error: 'Failed to update equipment', details: error.message }, { status: 500 });
    }
  }
  if (Object.keys(vehUpdate).length > 0) {
    const { error } = await supabaseAdmin.from('vehicles').update(vehUpdate).eq('equipment_id', id);
    if (error) {
      console.error('fleet PATCH vehicle error:', error);
      return NextResponse.json({ error: 'Failed to update vehicle', details: error.message }, { status: 500 });
    }
  }

  // Return fresh
  const { data: equipment } = await supabaseAdmin.from('equipment').select('*').eq('id', id).single();
  const { data: vehicle } = await supabaseAdmin.from('vehicles').select('*').eq('equipment_id', id).maybeSingle();
  return NextResponse.json({ success: true, data: { ...equipment, vehicle } });
}
