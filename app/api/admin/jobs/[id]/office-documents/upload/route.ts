export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/jobs/[id]/office-documents/upload
 *
 * Accepts a multipart/form-data POST with a `file`. Uploads it to the private
 * `office-documents` bucket under `<tenantId>/<jobId>/<timestamp>_<filename>`
 * and returns the storage path + a 30-day signed URL. The client then POSTs to
 * the sibling route to create the `office_documents` record.
 *
 * Server-side upload (vs. direct client upload) keeps the bucket private,
 * enforces the tenant prefix without trusting the client, and bounds file size.
 *
 * Roles allowed: admin, super_admin, operations_manager, supervisor, salesman.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';

const BUCKET = 'office-documents';
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — matches bucket limit
const SIGNED_URL_TTL = 60 * 60 * 24 * 30; // 30 days

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() || 'document';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'document';
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesStaff(request);
  if (!auth.authorized) return auth.response;

  const { id: jobId } = await context.params;
  const tenantId = auth.tenantId;
  if (!tenantId && auth.role !== 'super_admin') {
    return NextResponse.json({ error: 'No tenant context' }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'file missing' }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${Math.round(file.size / 1024 / 1024)}MB, max 50MB)` },
      { status: 413 }
    );
  }

  const originalName = (file as File).name || 'document';
  const safeName = sanitizeFilename(originalName);
  const mime = file.type || 'application/octet-stream';
  const prefix = tenantId || 'super-admin';
  const path = `${prefix}/${jobId}/${Date.now()}_${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const uploadRes = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: mime, upsert: false });

  if (uploadRes.error) {
    console.error('office-documents upload error:', uploadRes.error);
    return NextResponse.json({ error: 'Upload failed', details: uploadRes.error.message }, { status: 500 });
  }

  const signed = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);

  return NextResponse.json({
    success: true,
    path,
    url: signed.data?.signedUrl || null,
    file_name: safeName,
    file_size: file.size,
  });
}
