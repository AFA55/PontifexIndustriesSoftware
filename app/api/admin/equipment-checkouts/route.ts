export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/equipment-checkouts
 *   List checkouts (paginated, filterable). Drives the History + Check-In tabs.
 *   Query params:
 *     - open=true         → only checkouts where checked_in_at IS NULL
 *     - operator_id=uuid  → filter by custodian
 *     - equipment_id=uuid → filter by equipment
 *     - truck_id=uuid     → filter by truck_equipment_id
 *     - search=text       → fuzzy match against operator name, equipment name,
 *                           asset_tag, or truck unit number (joined client-side
 *                           after a fast equipment lookup)
 *     - page, limit
 *
 * POST /api/admin/equipment-checkouts
 *   Create a new checkout. Atomically:
 *     1) inserts a row in equipment_checkouts (open — no checked_in_at)
 *     2) updates equipment.status to 'in_use', sets current_custodian_id +
 *        current_job_order_id
 *   Body: { equipment_id, custodian_id, job_order_id?, truck_equipment_id?,
 *           hour_meter_out?, notes? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const READ_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager','supervisor']);
const WRITE_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager','supervisor']);

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!READ_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const openOnly = searchParams.get('open') === 'true';
  const operatorId = searchParams.get('operator_id');
  const equipmentId = searchParams.get('equipment_id');
  const truckId = searchParams.get('truck_id');
  const search = searchParams.get('search')?.trim() || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(200, Math.max(10, parseInt(searchParams.get('limit') || '50', 10)));

  let query = supabaseAdmin
    .from('equipment_checkouts')
    .select(`
      id, tenant_id, equipment_id, custodian_id, job_order_id, truck_equipment_id,
      checked_out_at, checked_out_by, checked_in_at, checked_in_by,
      hour_meter_out, hour_meter_in, notes, voice_note_url, created_at
    `, { count: 'exact' })
    .order('checked_out_at', { ascending: false });

  if (auth.role !== 'super_admin' && auth.tenantId) {
    query = query.eq('tenant_id', auth.tenantId);
  }
  if (openOnly) query = query.is('checked_in_at', null);
  if (operatorId) query = query.eq('custodian_id', operatorId);
  if (equipmentId) query = query.eq('equipment_id', equipmentId);
  if (truckId) query = query.eq('truck_equipment_id', truckId);

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data: rows, error, count } = await query;
  if (error) {
    console.error('equipment-checkouts GET error:', error);
    return NextResponse.json({ error: 'Failed to load checkouts', details: error.message }, { status: 500 });
  }

  // Hydrate related rows in one round-trip each (operators, equipment, trucks, jobs).
  const checkouts = rows ?? [];
  const equipmentIds = Array.from(new Set(checkouts.map(r => r.equipment_id).filter(Boolean) as string[]));
  const truckIds = Array.from(new Set(checkouts.map(r => r.truck_equipment_id).filter(Boolean) as string[]));
  const custodianIds = Array.from(new Set(checkouts.map(r => r.custodian_id).filter(Boolean) as string[]));
  const jobIds = Array.from(new Set(checkouts.map(r => r.job_order_id).filter(Boolean) as string[]));

  const allEquipmentIds = Array.from(new Set([...equipmentIds, ...truckIds]));

  const [eqRes, custRes, jobRes] = await Promise.all([
    allEquipmentIds.length > 0
      ? supabaseAdmin.from('equipment').select('id, name, short_name, unit_number, asset_tag, kind').in('id', allEquipmentIds)
      : Promise.resolve({ data: [], error: null }),
    custodianIds.length > 0
      ? supabaseAdmin.from('profiles').select('id, full_name, email, role').in('id', custodianIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length > 0
      ? supabaseAdmin.from('job_orders').select('id, job_number, customer_name').in('id', jobIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const eqById = new Map((eqRes.data ?? []).map(e => [e.id, e]));
  const custById = new Map((custRes.data ?? []).map(c => [c.id, c]));
  const jobById = new Map((jobRes.data ?? []).map(j => [j.id, j]));

  let hydrated = checkouts.map(co => ({
    ...co,
    equipment: co.equipment_id ? eqById.get(co.equipment_id) ?? null : null,
    truck: co.truck_equipment_id ? eqById.get(co.truck_equipment_id) ?? null : null,
    custodian: co.custodian_id ? custById.get(co.custodian_id) ?? null : null,
    job: co.job_order_id ? jobById.get(co.job_order_id) ?? null : null,
  }));

  // Client-side fuzzy filter (after hydration) — keeps SQL simple
  if (search) {
    const s = search.toLowerCase();
    hydrated = hydrated.filter(co => {
      const fields = [
        co.equipment?.name, co.equipment?.short_name, co.equipment?.unit_number, co.equipment?.asset_tag,
        co.truck?.name, co.truck?.short_name, co.truck?.unit_number, co.truck?.asset_tag,
        co.custodian?.full_name, co.custodian?.email,
        co.job?.job_number, co.job?.customer_name,
      ];
      return fields.some(f => typeof f === 'string' && f.toLowerCase().includes(s));
    });
  }

  return NextResponse.json({
    success: true,
    data: hydrated,
    pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) || 1 },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!WRITE_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const equipment_id = body.equipment_id;
  const custodian_id = body.custodian_id;
  if (!equipment_id || !custodian_id) {
    return NextResponse.json({ error: 'equipment_id and custodian_id are required' }, { status: 400 });
  }

  // Verify equipment belongs to this tenant + isn't already checked out.
  const { data: equipment, error: eqError } = await supabaseAdmin
    .from('equipment')
    .select('id, tenant_id, status, name, short_name, unit_number')
    .eq('id', equipment_id)
    .single();
  if (eqError || !equipment) {
    return NextResponse.json({ error: 'Equipment not found' }, { status: 404 });
  }
  if (auth.role !== 'super_admin' && equipment.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: 'Equipment not in your tenant' }, { status: 403 });
  }
  if (equipment.status === 'in_use') {
    return NextResponse.json({
      error: 'Equipment already checked out',
      details: 'This piece of equipment is currently in use. Check it back in first.',
    }, { status: 409 });
  }
  if (equipment.status === 'retired' || equipment.status === 'out_of_service') {
    return NextResponse.json({
      error: `Equipment is ${equipment.status.replace(/_/g, ' ')} — cannot be checked out.`,
    }, { status: 409 });
  }

  // Insert checkout row
  const { data: checkout, error: coError } = await supabaseAdmin
    .from('equipment_checkouts')
    .insert({
      tenant_id: auth.tenantId,
      equipment_id,
      custodian_id,
      job_order_id: body.job_order_id || null,
      truck_equipment_id: body.truck_equipment_id || null,
      checked_out_by: auth.userId,
      hour_meter_out: typeof body.hour_meter_out === 'number' ? body.hour_meter_out : null,
      notes: body.notes?.trim() || null,
      voice_note_url: body.voice_note_url || null,
    })
    .select('*')
    .single();

  if (coError) {
    console.error('equipment-checkouts POST error:', coError);
    return NextResponse.json({ error: 'Failed to create checkout', details: coError.message }, { status: 500 });
  }

  // Flip equipment.status + set current_custodian / current_job
  const { error: updateError } = await supabaseAdmin
    .from('equipment')
    .update({
      status: 'in_use',
      current_custodian_id: custodian_id,
      current_job_order_id: body.job_order_id || null,
    })
    .eq('id', equipment_id);

  if (updateError) {
    console.error('equipment status flip error:', updateError);
    // Roll back the checkout to keep invariants
    await supabaseAdmin.from('equipment_checkouts').delete().eq('id', checkout.id);
    return NextResponse.json({ error: 'Failed to update equipment status', details: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: checkout });
}
