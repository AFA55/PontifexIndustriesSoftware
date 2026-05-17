export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/fleet/[id]/service-records  — list service records for a vehicle
 * POST /api/admin/fleet/[id]/service-records  — add a new service record
 *
 * [id] is the equipment.id (kind='vehicle').
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const READ_ROLES  = new Set(['shop_manager','admin','super_admin','operations_manager','supervisor','shop_help']);
const WRITE_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager']);

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!READ_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: vehicleId } = await params;

  // Verify the equipment row belongs to caller's tenant
  let lookup = supabaseAdmin
    .from('equipment')
    .select('id, tenant_id')
    .eq('id', vehicleId)
    .eq('kind', 'vehicle');
  if (auth.role !== 'super_admin' && auth.tenantId) lookup = lookup.eq('tenant_id', auth.tenantId);
  const { data: eq, error: eqErr } = await lookup.single();
  if (eqErr || !eq) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

  const { data: records, error } = await supabaseAdmin
    .from('vehicle_service_records')
    .select(`
      *,
      performer:performed_by ( id, full_name ),
      creator:created_by    ( id, full_name )
    `)
    .eq('vehicle_id', vehicleId)
    .order('service_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('service-records GET error:', error);
    return NextResponse.json({ error: 'Failed to load service records' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: records ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!WRITE_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: vehicleId } = await params;

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { service_date, service_type, odometer_miles, cost, vendor, notes, performed_by } = body;

  if (!service_date || !service_type) {
    return NextResponse.json({ error: 'service_date and service_type are required' }, { status: 400 });
  }

  // Verify vehicle belongs to caller's tenant
  let lookup = supabaseAdmin
    .from('equipment')
    .select('id, tenant_id')
    .eq('id', vehicleId)
    .eq('kind', 'vehicle');
  if (auth.role !== 'super_admin' && auth.tenantId) lookup = lookup.eq('tenant_id', auth.tenantId);
  const { data: eq, error: eqErr } = await lookup.single();
  if (eqErr || !eq) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

  const tenantId = eq.tenant_id as string;

  // Insert service record
  const { data: record, error: insertErr } = await supabaseAdmin
    .from('vehicle_service_records')
    .insert({
      tenant_id:     tenantId,
      vehicle_id:    vehicleId,
      service_date,
      service_type,
      odometer_miles: odometer_miles ? Number(odometer_miles) : null,
      cost:           cost != null && cost !== '' ? Number(cost) : null,
      vendor:         vendor || null,
      notes:          notes || null,
      performed_by:   performed_by || null,
      created_by:     auth.userId,
    })
    .select()
    .single();

  if (insertErr || !record) {
    console.error('service-records POST insert error:', insertErr);
    return NextResponse.json({ error: 'Failed to create service record' }, { status: 500 });
  }

  // If odometer was provided, update vehicles summary columns if this is
  // the most recent service for this vehicle.
  if (odometer_miles) {
    const newOdo = Number(odometer_miles);

    // Fetch current last_service_odometer from vehicles table
    const { data: veh } = await supabaseAdmin
      .from('vehicles')
      .select('last_service_odometer, last_service_date')
      .eq('equipment_id', vehicleId)
      .maybeSingle();

    const currentOdo = veh?.last_service_odometer ?? 0;

    if (newOdo > (currentOdo ?? 0)) {
      await supabaseAdmin
        .from('vehicles')
        .update({
          last_service_date:     service_date,
          last_service_odometer: newOdo,
        })
        .eq('equipment_id', vehicleId);
    }
  }

  return NextResponse.json({ success: true, data: record }, { status: 201 });
}
