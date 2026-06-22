export const dynamic = 'force-dynamic';

/**
 * POST /api/timecard/photo-upload
 *
 * Accepts a multipart/form-data POST with a `photo` file (the selfie/arrival
 * photo captured during a REMOTE clock-in or remote clock-out). Uploads it to
 * the PRIVATE `timecard-photos` bucket under `<tenantId>/<userId>/<ts>.jpg` and
 * returns the storage PATH (not a URL).
 *
 * Why server-side (vs. the client uploading directly to Supabase Storage)?
 *   - These are employee face photos = PII, so the bucket is PRIVATE. Reads are
 *     via short-lived signed URLs generated server-side at view time.
 *   - Lets us enforce the tenant/user path prefix without trusting the client.
 *   - Lets us enforce file size + MIME server-side (in addition to bucket limits).
 *
 * Mirrors /api/admin/equipment-checkouts/voice-note-upload (private bucket,
 * server-side upload) and the auto-create-bucket retry from /api/upload/avatar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const BUCKET = 'timecard-photos';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
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

  const path = `${auth.tenantId}/${auth.userId}/${Date.now()}.jpg`;
  const buffer = Buffer.from(await photo.arrayBuffer());

  // The bucket is owned by the migration (20260622_timecard_photos_bucket.sql) and
  // is PRIVATE with no public/authenticated policies. We do NOT create it at runtime
  // — a runtime createBucket would make the security posture non-deterministic.
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: true });

  if (uploadError) {
    console.error('[timecard/photo-upload] Storage error:', uploadError);
    return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 });
  }

  return NextResponse.json({ success: true, path });
}
