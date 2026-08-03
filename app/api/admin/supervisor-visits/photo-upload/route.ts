export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/supervisor-visits/photo-upload
 *
 * Accepts multipart/form-data with a `photo` file — either a jobsite photo or
 * an equipment-issue photo captured during a supervisor site visit. Uploads it
 * to the PRIVATE `maintenance-photos` bucket under `<tenantId>/visits/<uuid>`
 * and returns the storage path plus a short-lived preview URL.
 *
 * WHY THIS EXISTS: the wizard used to upload straight from the browser with the
 * anon key, into a bucket that did not exist. Every upload failed with nothing
 * but a console.error, so supervisors believed photos had attached when none
 * had (the one production visit row has zero photos). The bucket is created by
 * 20260802b_maintenance_photos_bucket.sql as private with NO storage policies,
 * matching timecard-photos / blade-checkout-photos — which means uploads MUST
 * come through here, on the service-role client.
 *
 * Mirrors /api/admin/equipment-checkouts/blade-photo-upload exactly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { signStoragePath } from '@/lib/signed-urls';
import { requireAuth, resolveTenantScope } from '@/lib/api-auth';

const BUCKET = 'maintenance-photos';
// Same set that may CREATE a visit report (see the POST guard in ../route.ts).
const UPLOAD_ROLES = new Set(['supervisor', 'super_admin', 'operations_manager']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — matches the bucket's file_size_limit
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!UPLOAD_ROLES.has(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await resolveTenantScope(request, auth);
  if ('response' in scope) return scope.response;
  const tenantId = scope.tenantId;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const photo = formData.get('photo');
  if (!(photo instanceof Blob)) {
    return NextResponse.json({ error: 'No photo was attached to the request.' }, { status: 400 });
  }

  const mime = (photo.type || 'image/jpeg').split(';')[0];
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json(
      { error: `That image type isn't supported (${mime}). Use JPEG, PNG or WebP.` },
      { status: 415 }
    );
  }
  if (photo.size === 0) {
    return NextResponse.json({ error: 'That photo was empty. Try taking it again.' }, { status: 400 });
  }
  if (photo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Photo too large (${Math.round(photo.size / 1024 / 1024)}MB). Maximum is 10MB.` },
      { status: 413 }
    );
  }

  // `kind` only shapes the path for humans browsing the bucket; it is not trusted.
  const kind = formData.get('kind') === 'issue' ? 'issues' : 'site';
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Tenant prefix is server-derived — never taken from the client.
  const path = `${tenantId}/visits/${kind}/${id}.${EXT[mime]}`;

  const buffer = Buffer.from(await photo.arrayBuffer());

  // The bucket is owned by the migration and is PRIVATE with no policies. We do
  // NOT create it at runtime — that would make the security posture depend on
  // whichever request happened to run first.
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: false });

  if (uploadError) {
    console.error('[supervisor-visits/photo-upload] Storage error:', uploadError);
    return NextResponse.json(
      { error: 'Could not save the photo. Please try again.' },
      { status: 500 }
    );
  }

  // Short signed URL purely so the wizard can show a thumbnail right now.
  const previewUrl = await signStoragePath(BUCKET, path, 60 * 60);

  // What gets PERSISTED into supervisor_visits.photo_urls is the public-form
  // URL. It does not resolve on its own (the bucket is private — correct by
  // default), but it never expires as a string and lib/storage-url-server.ts
  // re-signs it on every read. Storing a signed URL instead would bake in an
  // expiry: the old client-side code stored 30-day links, so photos silently
  // 404ed a month after the visit.
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const storedUrl = `${base}/storage/v1/object/public/${BUCKET}/${path}`;

  return NextResponse.json({ success: true, path, storedUrl, url: previewUrl });
}
