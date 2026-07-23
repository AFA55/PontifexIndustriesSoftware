export const dynamic = 'force-dynamic';

/** PATCH / DELETE /api/takeoffs/conditions/[id] */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireTakeoffsAccess } from '@/lib/takeoffs/api-guard';

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

  const update: Record<string, any> = {};
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim().slice(0, 120);
  if (typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color)) update.color = body.color;
  if (body.surface === null || ['wall', 'slab', 'curb', 'other'].includes(body.surface)) update.surface = body.surface;
  if (body.depth_in === null) update.depth_in = null;
  else if (Number(body.depth_in) > 0 && Number(body.depth_in) <= 120) update.depth_in = Number(body.depth_in);
  if (body.core_diameter_in === null) update.core_diameter_in = null;
  else if (Number(body.core_diameter_in) > 0 && Number(body.core_diameter_in) <= 72) update.core_diameter_in = Number(body.core_diameter_in);
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('takeoff_conditions')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', guard.tenantId)
    .select('id')
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: error ? 500 : 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireTakeoffsAccess(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('takeoff_conditions')
    .delete()
    .eq('id', id)
    .eq('tenant_id', guard.tenantId);
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  return NextResponse.json({ success: true });
}
