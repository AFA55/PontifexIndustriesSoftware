export const dynamic = 'force-dynamic';

/**
 * POST /api/takeoffs/measurements — save a drawn measurement.
 *
 * The client sends geometry (PDF page coords) + its computed quantity for
 * instant UI feedback, but the SERVER recomputes the quantity from the
 * geometry + the page's stored scale — a tampered client can't corrupt
 * totals (plan §7).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireTakeoffsAccess } from '@/lib/takeoffs/api-guard';
import { computeQuantity, isValidGeometry } from '@/lib/takeoffs/geometry';

export async function POST(request: NextRequest) {
  const guard = await requireTakeoffsAccess(request);
  if (!guard.ok) return guard.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const conditionId = (body.condition_id ?? '').toString();
  const pageId = (body.page_id ?? '').toString();
  if (!conditionId || !pageId) {
    return NextResponse.json({ error: 'condition_id and page_id are required' }, { status: 400 });
  }
  if (!isValidGeometry(body.geometry)) {
    return NextResponse.json({ error: 'Invalid geometry' }, { status: 400 });
  }

  // Parent lookups are tenant-filtered — the composite FKs enforce this at
  // the DB layer too, but explicit checks give clean 404s.
  const [{ data: condition }, { data: page }] = await Promise.all([
    supabaseAdmin
      .from('takeoff_conditions')
      .select('id, measure_type, document_id')
      .eq('id', conditionId)
      .eq('tenant_id', guard.tenantId)
      .maybeSingle(),
    supabaseAdmin
      .from('takeoff_pages')
      .select('id, document_id, scale_feet_per_point')
      .eq('id', pageId)
      .eq('tenant_id', guard.tenantId)
      .maybeSingle(),
  ]);
  if (!condition || !page) return NextResponse.json({ error: 'Condition or page not found' }, { status: 404 });
  if (condition.document_id !== page.document_id) {
    return NextResponse.json({ error: 'Condition and page belong to different documents' }, { status: 400 });
  }
  // Geometry type must match the condition's measure_type, else computeQuantity
  // silently returns 0 (linear↔polyline, area↔polygon, count↔count).
  const expectedType = condition.measure_type === 'linear' ? 'polyline'
    : condition.measure_type === 'area' ? 'polygon' : 'count';
  if (body.geometry.type !== expectedType) {
    return NextResponse.json(
      { error: `Geometry "${body.geometry.type}" does not match a ${condition.measure_type} condition` },
      { status: 400 }
    );
  }
  if ((condition.measure_type === 'linear' || condition.measure_type === 'area') && !page.scale_feet_per_point) {
    return NextResponse.json(
      { error: 'This page has no scale set. Calibrate the page before measuring distances or areas.' },
      { status: 409 }
    );
  }

  const { quantity, rawLengthPt, rawAreaPt } = computeQuantity(
    body.geometry,
    condition.measure_type,
    page.scale_feet_per_point ? Number(page.scale_feet_per_point) : null
  );

  const { data, error } = await supabaseAdmin
    .from('takeoff_measurements')
    .insert({
      tenant_id: guard.tenantId,
      condition_id: conditionId,
      page_id: pageId,
      geometry: body.geometry,
      quantity,
      raw_length_pt: rawLengthPt,
      raw_area_pt: rawAreaPt,
      scale_used: page.scale_feet_per_point ? Number(page.scale_feet_per_point) : null,
      label: (body.label ?? '').toString().trim().slice(0, 120) || null,
      created_by: guard.userId,
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('takeoffs measurement create error:', error);
    return NextResponse.json({ error: 'Failed to save measurement' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data }, { status: 201 });
}
