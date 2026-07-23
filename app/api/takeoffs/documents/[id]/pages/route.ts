export const dynamic = 'force-dynamic';

/**
 * POST /api/takeoffs/documents/[id]/pages — register the parsed pages.
 *
 * The CLIENT parses the PDF with pdf.js after upload (dimensions + text
 * layer + sheet-number heuristics) and posts the results here in one batch.
 * Server validates shape/limits and upserts; marks the document 'ready'.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireTakeoffsAccess } from '@/lib/takeoffs/api-guard';

const MAX_PAGES = 500;
const MAX_TEXT = 60000;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireTakeoffsAccess(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const { data: doc } = await supabaseAdmin
    .from('takeoff_documents')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', guard.tenantId)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const pages = Array.isArray(body.pages) ? body.pages : [];
  if (pages.length === 0 || pages.length > MAX_PAGES) {
    return NextResponse.json({ error: `pages must be 1..${MAX_PAGES}` }, { status: 400 });
  }

  const rows = [];
  for (const p of pages) {
    const pageNumber = Number(p.page_number);
    const widthPt = Number(p.width_pt);
    const heightPt = Number(p.height_pt);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > MAX_PAGES) {
      return NextResponse.json({ error: `bad page_number: ${p.page_number}` }, { status: 400 });
    }
    if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt) || widthPt <= 0 || heightPt <= 0 || widthPt > 20000 || heightPt > 20000) {
      return NextResponse.json({ error: `bad dimensions on page ${pageNumber}` }, { status: 400 });
    }
    rows.push({
      tenant_id: guard.tenantId,
      document_id: id,
      page_number: pageNumber,
      width_pt: widthPt,
      height_pt: heightPt,
      rotation: [0, 90, 180, 270].includes(Number(p.rotation)) ? Number(p.rotation) : 0,
      user_unit: Number(p.user_unit) > 0 && Number(p.user_unit) <= 75000 ? Number(p.user_unit) : 1,
      sheet_number: (p.sheet_number ?? '').toString().trim().slice(0, 40) || null,
      sheet_title: (p.sheet_title ?? '').toString().trim().slice(0, 200) || null,
      discipline: (p.discipline ?? '').toString().trim().slice(0, 40) || null,
      page_text: (p.page_text ?? '').toString().slice(0, MAX_TEXT) || null,
    });
  }

  const { error } = await supabaseAdmin
    .from('takeoff_pages')
    .upsert(rows, { onConflict: 'document_id,page_number' });
  if (error) {
    console.error('takeoffs pages upsert error:', error);
    return NextResponse.json({ error: 'Failed to save pages' }, { status: 500 });
  }

  await supabaseAdmin
    .from('takeoff_documents')
    .update({ page_count: rows.length, status: 'ready' })
    .eq('id', id)
    .eq('tenant_id', guard.tenantId);

  const { data: saved } = await supabaseAdmin
    .from('takeoff_pages')
    .select('id, page_number')
    .eq('document_id', id)
    .eq('tenant_id', guard.tenantId)
    .order('page_number');

  return NextResponse.json({ success: true, data: saved ?? [] }, { status: 201 });
}
