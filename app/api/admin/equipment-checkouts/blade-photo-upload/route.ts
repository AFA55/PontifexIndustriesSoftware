export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/equipment-checkouts/blade-photo-upload
 *
 * Accepts a multipart/form-data POST with a `photo` file (the blade/bit
 * sticker photo captured at checkout time). Uploads it to the PRIVATE
 * `blade-checkout-photos` bucket under `<tenantId>/<uuid>.jpg` and returns the
 * storage PATH (not a URL) — the client stores that path in the checkout's
 * blade_details.photo_url until submit, then it's persisted on
 * equipment_checkouts.blade_details via the checkout call.
 *
 * Mirrors /api/timecard/photo-upload and
 * /api/admin/equipment-checkouts/voice-note-upload (private bucket,
 * server-side upload, no client-trusted path).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { signStoragePath } from '@/lib/signed-urls';
import { requireAuth } from '@/lib/api-auth';

const BUCKET = 'blade-checkout-photos';
const UPLOAD_ROLES = new Set(['shop_manager', 'admin', 'super_admin', 'operations_manager', 'supervisor']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!UPLOAD_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!auth.tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const photo = formData.get('photo');
  if (!(photo instanceof Blob)) {
    return NextResponse.json({ error: 'photo file missing' }, { status: 400 });
  }

  const mime = (photo.type || 'image/jpeg').split(';')[0];
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json({ error: `Unsupported image type: ${mime}` }, { status: 415 });
  }
  if (photo.size === 0) {
    return NextResponse.json({ error: 'Empty photo' }, { status: 400 });
  }
  if (photo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${Math.round(photo.size / 1024)}KB, max 10MB)` },
      { status: 413 }
    );
  }

  const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${auth.tenantId}/${id}.jpg`;
  const buffer = Buffer.from(await photo.arrayBuffer());

  // The bucket is owned by the migration (20260701e_blade_checkout_photos_bucket.sql)
  // and is PRIVATE with no public/authenticated policies. We do NOT create it at
  // runtime — a runtime createBucket would make the security posture non-deterministic.
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: true });

  if (uploadError) {
    console.error('[blade-photo-upload] Storage error:', uploadError);
    return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 });
  }

  // Short signed URL for immediate preview in the checkout form. The path
  // (not the URL) is what gets persisted on blade_details.photo_url — reads
  // later re-sign on demand (see the GET-side pattern in
  // app/api/admin/equipment-checkouts/[id]/voice-note/route.ts).
  const previewUrl = await signStoragePath(BUCKET, path, 60 * 60); // 1 hour, for immediate display only

  return NextResponse.json({ success: true, path, url: previewUrl });
}
