export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/fleet  — list vehicles (equipment join vehicles)
 * POST /api/admin/fleet  — create equipment row (kind='vehicle') + vehicles row
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const READ_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager','supervisor','salesman']);
const WRITE_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager']);

function deriveAssetPrefix(companyCode: string | null | undefined): string {
  if (!companyCode) return 'CO';
  const upper = companyCode.toUpperCase().replace(/[^A-Z]/g, '');
  const noVowels = upper.replace(/[AEIOU]/g, '');
  if (noVowels.length >= 4) return noVowels.slice(0, 4);
  if (upper.length >= 4) return upper.slice(0, 4);
  return upper.padEnd(2, 'X').slice(0, 4) || 'CO';
}

async function nextAssetTag(tenantId: string): Promise<string> {
  const { data: tenant } = await supabaseAdmin.from('tenants').select('company_code').eq('id', tenantId).single();
  const prefix = deriveAssetPrefix(tenant?.company_code);
  const { data: existing } = await supabaseAdmin
    .from('equipment').select('asset_tag').eq('tenant_id', tenantId).like('asset_tag', `${prefix}-%`);
  let max = 0;
  for (const row of existing ?? []) {
    const m = String(row.asset_tag || '').match(/-(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!READ_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let eqQuery = supabaseAdmin
    .from('equipment')
    .select('id, asset_tag, name, short_name, unit_number, make, model, status, location, photo_url, hour_meter, created_at, tenant_id')
    .eq('kind', 'vehicle')
    .order('created_at', { ascending: false });
  if (auth.role !== 'super_admin' && auth.tenantId) eqQuery = eqQuery.eq('tenant_id', auth.tenantId);

  const { data: equipment, error: eqError } = await eqQuery;
  if (eqError) return NextResponse.json({ error: 'Failed to load fleet' }, { status: 500 });

  // Pull all vehicles rows for the tenant in one query, then merge.
  let vehQuery = supabaseAdmin.from('vehicles').select('*');
  if (auth.role !== 'super_admin' && auth.tenantId) vehQuery = vehQuery.eq('tenant_id', auth.tenantId);
  const { data: vehicles } = await vehQuery;
  const byEqId = new Map((vehicles ?? []).map((v) => [v.equipment_id, v]));

  const merged = (equipment ?? []).map((eq) => ({ ...eq, vehicle: byEqId.get(eq.id) ?? null }));
  return NextResponse.json({ success: true, data: merged });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!WRITE_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const name = String(body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  const unit_number = body.unit_number ? String(body.unit_number).trim() : null;
  if (!unit_number) return NextResponse.json({ error: 'unit_number is required (e.g. truck #5)' }, { status: 400 });

  const asset_tag = body.asset_tag?.trim() || (await nextAssetTag(auth.tenantId));

  // Step 1: insert equipment row with kind='vehicle'
  const eqInsert = {
    tenant_id: auth.tenantId,
    name,
    short_name: body.short_name?.trim() || null,
    unit_number,
    aliases: Array.isArray(body.aliases) ? body.aliases : [],
    asset_tag,
    kind: 'vehicle' as const,
    category: body.category?.trim() || null,
    make: body.make?.trim() || null,
    model: body.model?.trim() || null,
    serial_number: body.serial_number?.trim() || null,
    status: 'available',
    location: body.location?.trim() || null,
    notes: body.notes?.trim() || null,
    purchase_date: body.purchase_date || null,
    purchase_cost: typeof body.purchase_cost === 'number' ? body.purchase_cost : null,
    photo_url: body.photo_url?.trim() || null,
    requires_maintenance_schedule: true, // vehicles always need scheduled service
    created_by: auth.userId,
    type: 'vehicle',  // legacy column
  };

  const { data: equipment, error: eqError } = await supabaseAdmin
    .from('equipment').insert(eqInsert).select('*').single();
  if (eqError) {
    console.error('fleet POST equipment error:', eqError);
    return NextResponse.json({ error: 'Failed to create equipment row', details: eqError.message }, { status: 500 });
  }

  // Step 2: insert vehicles row
  const vehInsert = {
    tenant_id: auth.tenantId,
    equipment_id: equipment.id,
    vin: body.vin?.trim() || null,
    license_plate: body.license_plate?.trim() || null,
    year: typeof body.year === 'number' ? body.year : null,
    fuel_type: body.fuel_type?.trim() || null,
    odometer: typeof body.odometer === 'number' ? body.odometer : 0,
    registration_expiry: body.registration_expiry || null,
    insurance_expiry: body.insurance_expiry || null,
    inspection_expiry: body.inspection_expiry || null,
  };

  const { data: vehicle, error: vehError } = await supabaseAdmin
    .from('vehicles').insert(vehInsert).select('*').single();
  if (vehError) {
    // Roll back equipment row to keep state consistent.
    await supabaseAdmin.from('equipment').delete().eq('id', equipment.id);
    console.error('fleet POST vehicle error:', vehError);
    return NextResponse.json({ error: 'Failed to create vehicle row', details: vehError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { ...equipment, vehicle } });
}
