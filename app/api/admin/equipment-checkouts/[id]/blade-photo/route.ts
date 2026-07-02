export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/equipment-checkouts/[id]/blade-photo
 *
 * Mints a fresh signed URL for a checkout's blade sticker photo
 * (equipment_checkouts.blade_details.photo_url is a storage PATH, not a URL —
 * see /api/admin/equipment-checkouts/blade-photo-upload). Call this instead of
 * storing a long-lived signed URL, so the private blade-checkout-photos bucket
 * never needs public/authenticated storage policies.
 *
 * Response: { success: true, url: '<signed URL>' }
 * Mirrors app/api/admin/equipment-checkouts/[id]/voice-note/route.ts.
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
    .select('id, tenant_id, blade_details')
    .eq('id', checkoutId)
    .maybeSingle();

  if (!checkout) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.role !== 'super_admin' && checkout.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const photoPath = (checkout.blade_details as { photo_url?: string } | null)?.photo_url;
  if (!photoPath) {
    return NextResponse.json({ error: 'No blade photo for this checkout' }, { status: 404 });
  }

  // photo_url is stored as a bare storage path ("<tenantId>/<uuid>.jpg"), not a
  // full URL — sign it directly against the blade-checkout-photos bucket.
  const signedUrl = await signStoragePath('blade-checkout-photos', photoPath, 60 * 60 * 24 * 30);

  if (!signedUrl) {
    return NextResponse.json({ error: 'Failed to sign URL' }, { status: 500 });
  }

  return NextResponse.json({ success: true, url: signedUrl });
}
