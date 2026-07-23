export const dynamic = 'force-dynamic';

/** PATCH (geometry edit → server recompute) / DELETE a measurement. */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireTakeoffsAccess } from '@/lib/takeoffs/api-guard';
import { computeQuantity, isValidGeometry } from '@/lib/takeoffs/geometry';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireTakeoffsAccess(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from('takeoff_measurements')
    .select('id, condition_id, page_id')
    .eq('id', id)
    .eq('tenant_id', guard.tenantId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });

  const update: Record<string, any> = {};
  if (typeof body.label === 'string') update.label = body.label.trim().slice(0, 120) || null;

  if (body.geometry !== undefined) {
    if (!isValidGeometry(body.geometry)) return NextResponse.json({ error: 'Invalid geometry' }, { status: 400 });
    const [{ data: condition }, { data: page }] = await Promise.all([
      supabaseAdmin
        .from('takeoff_conditions')
        .select('measure_type')
        .eq('id', existing.condition_id)
        .eq('tenant_id', guard.tenantId)
        .maybeSingle(),
      supabaseAdmin
        .from('takeoff_pages')
        .select('scale_feet_per_point')
        .eq('id', existing.page_id)
        .eq('tenant_id', guard.tenantId)
        .maybeSingle(),
    ]);
    if (!condition || !page) return NextResponse.json({ error: 'Parents not found' }, { status: 404 });
    const { quantity, rawLengthPt } = computeQuantity(
      body.geometry,
      condition.measure_type,
      page.scale_feet_per_point ? Number(page.scale_feet_per_point) : null
    );
    update.geometry = body.geometry;
    update.quantity = quantity;
    update.raw_length_pt = rawLengthPt;
    update.scale_used = page.scale_feet_per_point ? Number(page.scale_feet_per_point) : null;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('takeoff_measurements')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', guard.tenantId)
    .select('*')
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: error ? 500 : 404 });
  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireTakeoffsAccess(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('takeoff_measurements')
    .delete()
    .eq('id', id)
    .eq('tenant_id', guard.tenantId);
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  return NextResponse.json({ success: true });
}
