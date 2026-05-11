export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/equipment-checkouts/voice-note-upload
 *
 * Accepts a multipart/form-data POST with an `audio` file. Uploads it to the
 * `voice-checkouts` bucket under `<tenantId>/<uuid>.<ext>` and returns a
 * 30-day signed URL that the client stores on `equipment_checkouts.voice_note_url`.
 *
 * Why server-side (vs. client uploading directly to Supabase Storage)?
 *   - Lets us enforce tenant prefix in the path without trusting the client
 *   - Lets us enforce file size + MIME server-side (in addition to bucket limits)
 *   - Keeps the bucket non-public; signed URLs are time-bounded
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const UPLOAD_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager','supervisor']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav']);

function extFor(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4'))  return 'm4a';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('ogg'))  return 'ogg';
  if (mime.includes('wav'))  return 'wav';
  return 'bin';
}

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

  const audio = formData.get('audio');
  if (!(audio instanceof Blob)) return NextResponse.json({ error: 'audio file missing' }, { status: 400 });

  // Browsers vary on what MIME they hand back for MediaRecorder output:
  // Chrome → audio/webm; Safari → audio/mp4. Be permissive but bounded.
  const mime = audio.type || 'audio/webm';
  if (!ALLOWED_MIMES.has(mime.split(';')[0])) {
    return NextResponse.json({ error: `Unsupported audio type: ${mime}` }, { status: 415 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (${Math.round(audio.size / 1024)}KB, max 10MB)` }, { status: 413 });
  }
  if (audio.size === 0) return NextResponse.json({ error: 'Empty audio' }, { status: 400 });

  const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${auth.tenantId}/${id}.${extFor(mime)}`;

  // Convert Blob → ArrayBuffer for the storage client. The supabase-js storage
  // client accepts Blob/File too, but in Node runtimes (route handlers) the
  // Blob shim is sometimes missing properties; using ArrayBuffer is the most
  // portable path.
  const arrayBuffer = await audio.arrayBuffer();
  const uploadRes = await supabaseAdmin.storage
    .from('voice-checkouts')
    .upload(path, arrayBuffer, { contentType: mime, upsert: false });

  if (uploadRes.error) {
    console.error('voice-note-upload error:', uploadRes.error);
    return NextResponse.json({ error: 'Upload failed', details: uploadRes.error.message }, { status: 500 });
  }

  // Signed URL valid 30 days — long enough for audit replay while the checkout
  // is being investigated, but bounded so the URL can't be passed around forever.
  const signed = await supabaseAdmin.storage
    .from('voice-checkouts')
    .createSignedUrl(path, 60 * 60 * 24 * 30);

  return NextResponse.json({
    success: true,
    path,
    url: signed.data?.signedUrl || null,
  });
}
