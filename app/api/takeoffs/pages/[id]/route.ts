export const dynamic = 'force-dynamic';

/**
 * PATCH /api/takeoffs/pages/[id] — set sheet metadata and/or scale.
 *
 * Scale changes RECOMPUTE every linear measurement on the page from its
 * stored scale-free raw_length_pt (plan §7: recalibration is a recompute,
 * never a geometry re-read). `apply_to_all: true` copies the scale to every
 * page of the document and recomputes across all of them.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireTakeoffsAccess } from '@/lib/takeoffs/api-guard';

async function recomputePages(tenantId: string, pageIds: string[], feetPerPoint: number) {
  if (pageIds.length === 0) return;
  const { data: ms } = await supabaseAdmin
    .from('takeoff_measurements')
    .select('id, raw_length_pt')
    .eq('tenant_id', tenantId)
    .in('page_id', pageIds)
    .not('raw_length_pt', 'is', null);
  for (const m of ms ?? []) {
    await supabaseAdmin
      .from('takeoff_measurements')
      .update({ quantity: Number(m.raw_length_pt) * feetPerPoint, scale_used: feetPerPoint })
      .eq('id', m.id)
      .eq('tenant_id', tenantId);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireTakeoffsAccess(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const { data: page } = await supabaseAdmin
    .from('takeoff_pages')
    .select('id, document_id')
    .eq('id', id)
    .eq('tenant_id', guard.tenantId)
    .maybeSingle();
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const update: Record<string, any> = {};
  if (typeof body.sheet_number === 'string') update.sheet_number = body.sheet_number.trim().slice(0, 40) || null;
  if (typeof body.sheet_title === 'string') update.sheet_title = body.sheet_title.trim().slice(0, 200) || null;
  if (typeof body.discipline === 'string') update.discipline = body.discipline.trim().slice(0, 40) || null;

  let scaleChanged = false;
  if (body.scale_feet_per_point !== undefined) {
    const fpp = Number(body.scale_feet_per_point);
    if (!Number.isFinite(fpp) || fpp <= 0 || fpp > 100) {
      return NextResponse.json({ error: 'Invalid scale' }, { status: 400 });
    }
    update.scale_feet_per_point = fpp;
    update.scale_label = (body.scale_label ?? 'Calibrated').toString().slice(0, 60);
    scaleChanged = true;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const applyToAll = scaleChanged && body.apply_to_all === true;
  if (applyToAll) {
    const { error } = await supabaseAdmin
      .from('takeoff_pages')
      .update({ scale_feet_per_point: update.scale_feet_per_point, scale_label: update.scale_label })
      .eq('document_id', page.document_id)
      .eq('tenant_id', guard.tenantId);
    if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    // Non-scale fields still apply to just this page.
    const rest = { ...update };
    delete rest.scale_feet_per_point;
    delete rest.scale_label;
    if (Object.keys(rest).length > 0) {
      await supabaseAdmin.from('takeoff_pages').update(rest).eq('id', id).eq('tenant_id', guard.tenantId);
    }
    const { data: allPages } = await supabaseAdmin
      .from('takeoff_pages')
      .select('id')
      .eq('document_id', page.document_id)
      .eq('tenant_id', guard.tenantId);
    await recomputePages(guard.tenantId, (allPages ?? []).map((p: any) => p.id), update.scale_feet_per_point);
  } else {
    const { error } = await supabaseAdmin
      .from('takeoff_pages')
      .update(update)
      .eq('id', id)
      .eq('tenant_id', guard.tenantId);
    if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    if (scaleChanged) await recomputePages(guard.tenantId, [id], update.scale_feet_per_point);
  }

  return NextResponse.json({ success: true });
}
