export const dynamic = 'force-dynamic';

/**
 * POST /api/push/register
 *
 * Called from the iOS app after APNs registration succeeds.
 * Stores (or refreshes) the device push token in the `push_tokens` table.
 *
 * The `push_tokens` table has a UNIQUE (user_id, token) constraint so
 * repeated calls for the same token are idempotent (upsert on conflict).
 *
 * Body:
 *   deviceToken: string  — the raw APNs hex device token from Capacitor
 *   deviceId?:   string  — optional stable device identifier (e.g. UUID from Capacitor Device plugin)
 *   platform?:   'ios' | 'android' | 'web'  (defaults to 'ios')
 *
 * Auth: any authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  let body: {
    deviceToken?: unknown;
    deviceId?: unknown;
    platform?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { deviceToken, deviceId, platform = 'ios' } = body;

  if (typeof deviceToken !== 'string' || !deviceToken.trim()) {
    return NextResponse.json({ error: 'deviceToken is required' }, { status: 400 });
  }

  const validPlatforms = ['ios', 'android', 'web'] as const;
  const resolvedPlatform =
    typeof platform === 'string' && validPlatforms.includes(platform as 'ios')
      ? (platform as 'ios' | 'android' | 'web')
      : 'ios';

  const token = deviceToken.trim();

  // Upsert: if (user_id, token) already exists just refresh last_seen.
  const { error } = await supabaseAdmin.from('push_tokens').upsert(
    {
      user_id: auth.userId,
      tenant_id: auth.tenantId,
      token,
      platform: resolvedPlatform,
      device_id: typeof deviceId === 'string' ? deviceId.trim() || null : null,
      last_seen: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,token',
      ignoreDuplicates: false, // update last_seen on re-register
    }
  );

  if (error) {
    console.error('[push/register] upsert error:', error);
    return NextResponse.json({ error: 'Failed to register device token' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/push/register
 *
 * Called when the user logs out or explicitly revokes push permission.
 * Removes all tokens for the authenticated user (or a specific token if
 * `deviceToken` query param is provided).
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const specificToken = searchParams.get('deviceToken');

  let query = supabaseAdmin.from('push_tokens').delete().eq('user_id', auth.userId);

  if (specificToken) {
    query = query.eq('token', specificToken);
  }

  const { error } = await query;

  if (error) {
    console.error('[push/register] delete error:', error);
    return NextResponse.json({ error: 'Failed to remove device token' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
