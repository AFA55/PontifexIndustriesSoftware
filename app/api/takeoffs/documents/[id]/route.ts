export const dynamic = 'force-dynamic';

/**
 * GET    /api/takeoffs/documents/[id] — document + pages + conditions +
 *        measurements + a signed download URL for the PDF (1h).
 * PATCH  /api/takeoffs/documents/[id] — rename / set customer / status.
 * DELETE /api/takeoffs/documents/[id] — delete rows AND storage objects
 *        (cascades handle children; storage cleanup is explicit).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireTakeoffsAccess } from '@/lib/takeoffs/api-guard';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireTakeoffsAccess(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const { data: doc, error } = await supabaseAdmin
    .from('takeoff_documents')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', guard.tenantId)
    .maybeSingle();
  if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const [{ data: pages }, { data: conditions }, { data: signed }] = await Promise.all([
    supabaseAdmin
      .from('takeoff_pages')
      .select('id, page_number, width_pt, height_pt, rotation, user_unit, sheet_number, sheet_title, discipline, scale_feet_per_point, scale_label, ai_page_summary')
      .eq('document_id', id)
      .eq('tenant_id', guard.tenantId)
      .order('page_number'),
    supabaseAdmin
      .from('takeoff_conditions')
      .select('*')
      .eq('document_id', id)
      .eq('tenant_id', guard.tenantId)
      .order('sort_order')
      .order('created_at'),
    supabaseAdmin.storage.from('takeoff-documents').createSignedUrl(doc.storage_path, 3600),
  ]);

  const pageIds = (pages ?? []).map((p: any) => p.id);
  let measurements: any[] = [];
  if (pageIds.length > 0) {
    const { data: m } = await supabaseAdmin
      .from('takeoff_measurements')
      .select('id, condition_id, page_id, geometry, quantity, raw_length_pt, scale_used, label')
      .eq('tenant_id', guard.tenantId)
      .in('page_id', pageIds);
    measurements = m ?? [];
  }

  return NextResponse.json({
    success: true,
    data: {
      document: doc,
      pages: pages ?? [],
      conditions: conditions ?? [],
      measurements,
      fileUrl: signed?.signedUrl ?? null,
    },
  });
}

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
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim().slice(0, 200);
  if (typeof body.customer_name === 'string') update.customer_name = body.customer_name.trim().slice(0, 200) || null;
  if (typeof body.status === 'string' && ['ready', 'failed'].includes(body.status)) update.status = body.status;
  if (typeof body.page_count === 'number' && body.page_count >= 0 && body.page_count < 10000) update.page_count = Math.floor(body.page_count);
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('takeoff_documents')
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

  const { data: doc } = await supabaseAdmin
    .from('takeoff_documents')
    .select('id, storage_path')
    .eq('id', id)
    .eq('tenant_id', guard.tenantId)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  // Storage first (RLS-audit M3: cascades never clean the bucket).
  const { data: thumbs } = await supabaseAdmin
    .from('takeoff_pages')
    .select('thumbnail_path')
    .eq('document_id', id)
    .eq('tenant_id', guard.tenantId)
    .not('thumbnail_path', 'is', null);
  const objects = [doc.storage_path, ...(thumbs ?? []).map((t: any) => t.thumbnail_path)].filter(Boolean);
  if (objects.length > 0) {
    await supabaseAdmin.storage.from('takeoff-documents').remove(objects);
  }

  const { error } = await supabaseAdmin
    .from('takeoff_documents')
    .delete()
    .eq('id', id)
    .eq('tenant_id', guard.tenantId);
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  return NextResponse.json({ success: true });
}
