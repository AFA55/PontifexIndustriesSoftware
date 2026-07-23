export const dynamic = 'force-dynamic';

/**
 * POST /api/takeoffs/conditions — create a scope bucket ("Wall Saw 12in",
 * linear/LF, color, depth/diameter/surface — the trade-specific fields).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireTakeoffsAccess } from '@/lib/takeoffs/api-guard';

export async function POST(request: NextRequest) {
  const guard = await requireTakeoffsAccess(request);
  if (!guard.ok) return guard.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const documentId = (body.document_id ?? '').toString();
  const name = (body.name ?? '').toString().trim().slice(0, 120);
  const measureType = (body.measure_type ?? '').toString();
  if (!documentId || !name) return NextResponse.json({ error: 'document_id and name are required' }, { status: 400 });
  if (!['count', 'linear', 'area'].includes(measureType)) {
    return NextResponse.json({ error: 'measure_type must be count | linear | area' }, { status: 400 });
  }

  const { data: doc } = await supabaseAdmin
    .from('takeoff_documents')
    .select('id')
    .eq('id', documentId)
    .eq('tenant_id', guard.tenantId)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const unit = measureType === 'count' ? 'EA' : measureType === 'area' ? 'SF' : 'LF';
  const color = /^#[0-9a-fA-F]{6}$/.test(body.color ?? '') ? body.color : '#7C3AED';
  const surface = ['wall', 'slab', 'curb', 'other'].includes(body.surface) ? body.surface : null;
  const depthIn = Number(body.depth_in) > 0 && Number(body.depth_in) <= 120 ? Number(body.depth_in) : null;
  const coreDiaIn = Number(body.core_diameter_in) > 0 && Number(body.core_diameter_in) <= 72 ? Number(body.core_diameter_in) : null;

  const { data, error } = await supabaseAdmin
    .from('takeoff_conditions')
    .insert({
      tenant_id: guard.tenantId,
      document_id: documentId,
      name,
      measure_type: measureType,
      unit,
      color,
      surface,
      depth_in: depthIn,
      core_diameter_in: coreDiaIn,
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('takeoffs condition create error:', error);
    return NextResponse.json({ error: 'Failed to create condition' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data }, { status: 201 });
}
