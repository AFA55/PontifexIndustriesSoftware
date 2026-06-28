export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/equipment-checkouts/[checkoutId]/voice-note
 *
 * Re-signs the Supabase Storage URL for a checkout's voice note.
 * equipment_checkouts.voice_note_url is a 30-day signed URL; after expiry
 * it 404s. Call this endpoint instead of using the stored URL directly for
 * audit replay — it re-generates a fresh 30-day signed URL on demand.
 *
 * Response: { success: true, url: '<new signed URL>' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { signStoragePath } from '@/lib/signed-urls';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id: checkoutId } = await params;

  const { data: checkout } = await supabaseAdmin
    .from('equipment_checkouts')
    .select('id, tenant_id, voice_note_url')
    .eq('id', checkoutId)
    .maybeSingle();

  if (!checkout) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.role !== 'super_admin' && checkout.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!checkout.voice_note_url) {
    return NextResponse.json({ error: 'No voice note for this checkout' }, { status: 404 });
  }

  // Extract the storage path from the existing URL.
  // URL format: .../storage/v1/object/sign/voice-checkouts/<tenantId>/<uuid>.<ext>?token=...
  let urlObj: URL;
  try {
    urlObj = new URL(checkout.voice_note_url);
  } catch {
    return NextResponse.json({ error: 'Stored voice_note_url is malformed' }, { status: 500 });
  }

  const pathMatch = urlObj.pathname.match(/\/object\/sign\/(.+)$/);
  if (!pathMatch) {
    return NextResponse.json({ error: 'Cannot parse storage path from voice_note_url' }, { status: 500 });
  }

  const storagePath = pathMatch[1]; // e.g. "voice-checkouts/tenantId/uuid.webm"
  const [bucket, ...rest] = storagePath.split('/');
  const filePath = rest.join('/');

  const signedUrl = await signStoragePath(bucket, filePath, 60 * 60 * 24 * 30); // 30 more days

  if (!signedUrl) {
    return NextResponse.json(
      { error: 'Failed to re-sign URL' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, url: signedUrl });
}
