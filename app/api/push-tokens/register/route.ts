export const dynamic = 'force-dynamic';

/**
 * POST /api/push-tokens/register
 * Registers (or refreshes) the calling user's device push token.
 * Called by the Capacitor app after the OS grants push permission and returns
 * an APNs/FCM token.
 *
 * Body: { token: string, platform: 'ios'|'android'|'web', device_id?: string }
 *
 * DELETE /api/push-tokens/register  — body { token } removes a token (logout).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

const VALID_PLATFORMS = ['ios', 'android', 'web'] as const;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json().catch(() => ({}));
    const token: string = (body.token ?? '').trim();
    const platform: string = (body.platform ?? '').trim();
    const deviceId: string | null = body.device_id ?? null;

    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });
    if (!VALID_PLATFORMS.includes(platform as typeof VALID_PLATFORMS[number])) {
      return NextResponse.json({ error: 'platform must be ios, android, or web' }, { status: 400 });
    }

    const tenantId = await getTenantId(auth.userId);

    // Upsert on (user_id, token). Refresh last_seen + tenant + device_id.
    const { error } = await supabaseAdmin
      .from('push_tokens')
      .upsert(
        {
          user_id: auth.userId,
          tenant_id: tenantId,
          token,
          platform,
          device_id: deviceId,
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' }
      );

    if (error) {
      console.error('push token upsert error:', error);
      return NextResponse.json({ error: 'Failed to register token' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /push-tokens/register:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json().catch(() => ({}));
    const token: string = (body.token ?? '').trim();
    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

    await supabaseAdmin
      .from('push_tokens')
      .delete()
      .eq('user_id', auth.userId)
      .eq('token', token);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /push-tokens/register:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
