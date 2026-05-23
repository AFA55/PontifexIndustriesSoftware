export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/jobs/[id]/office-documents/[docId]
 * DELETE — remove a document record + best-effort delete its storage object.
 *
 * Roles allowed: admin, super_admin, operations_manager, supervisor, salesman.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string; docId: string }> };

const BUCKET = 'office-documents';

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId, docId } = await context.params;
    const tenantId = auth.tenantId;

    // Fetch the doc (tenant-scoped for non-super-admins) so we can also clean up storage.
    let docQuery = supabaseAdmin
      .from('office_documents')
      .select('id, file_url')
      .eq('id', docId)
      .eq('job_order_id', jobId);
    if (tenantId) docQuery = docQuery.eq('tenant_id', tenantId);

    const { data: doc, error: fetchErr } = await docQuery.maybeSingle();
    if (fetchErr) {
      console.error('Error fetching office document for delete:', fetchErr);
      return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
    }
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    // Best-effort storage cleanup. file_url may be a signed URL; the bucket path
    // is everything after `/object/.../office-documents/`. We stored the raw path
    // in a separate flow, but be defensive: derive path from the URL if present.
    const storagePath = derivePath((doc as { file_url?: string }).file_url);
    if (storagePath) {
      Promise.resolve(supabaseAdmin.storage.from(BUCKET).remove([storagePath]))
        .then(() => {})
        .catch(() => {});
    }

    let delQuery = supabaseAdmin.from('office_documents').delete().eq('id', docId).eq('job_order_id', jobId);
    if (tenantId) delQuery = delQuery.eq('tenant_id', tenantId);
    const { error: delErr } = await delQuery;
    if (delErr) {
      console.error('Error deleting office document:', delErr);
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Unexpected error in DELETE /office-documents/[docId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Extract the bucket-relative path from a stored signed/public URL, if possible. */
function derivePath(url: string | undefined): string | null {
  if (!url) return null;
  const marker = `/office-documents/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const after = url.slice(idx + marker.length);
  // Strip any query string (signed URLs append `?token=...`).
  return after.split('?')[0] || null;
}
