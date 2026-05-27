export const dynamic = 'force-dynamic';

/**
 * POST /api/push
 *
 * Send a push notification to a specific device token.
 * The caller supplies the token directly (typically from `push_tokens` table
 * or a token retrieved by the client from Capacitor Push Notifications).
 *
 * Body: { deviceToken: string, title: string, body: string, data?: object }
 * Auth: any authenticated user with a valid session
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { sendPushNotification } from '@/lib/apns';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  let body: {
    deviceToken?: unknown;
    title?: unknown;
    body?: unknown;
    data?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { deviceToken, title, body: messageBody, data } = body;

  if (typeof deviceToken !== 'string' || !deviceToken.trim()) {
    return NextResponse.json({ error: 'deviceToken is required' }, { status: 400 });
  }
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (typeof messageBody !== 'string' || !messageBody.trim()) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }
  if (data !== undefined && (typeof data !== 'object' || Array.isArray(data) || data === null)) {
    return NextResponse.json({ error: 'data must be a plain object' }, { status: 400 });
  }

  const result = await sendPushNotification(deviceToken.trim(), {
    title: title.trim(),
    body: messageBody.trim(),
    data: data as Record<string, unknown> | undefined,
  });

  // Fire-and-forget audit log
  Promise.resolve(
    supabaseAdmin.from('audit_logs').insert({
      action: 'push_sent',
      actor_id: auth.userId,
      resource_type: 'push_notification',
      resource_id: null,
      details: {
        device_token_prefix: deviceToken.slice(0, 8) + '…',
        title,
        success: result.success,
        error: result.error ?? null,
        tenant_id: auth.tenantId,
      },
    })
  ).then(() => {}).catch(() => {});

  if (!result.success) {
    console.error('[push] sendPushNotification failed:', result.error);
    return NextResponse.json(
      { error: result.error ?? 'Failed to send push notification' },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
