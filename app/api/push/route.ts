export const dynamic = 'force-dynamic';

/**
 * POST /api/push
 *
 * Send a push notification. Two mutually-exclusive targeting modes:
 *
 *   1. By user (preferred) — fans out to every device the user has registered
 *      in `push_tokens`, via `sendPushToUser`. Any authenticated user may push
 *      to THEMSELVES; pushing to ANOTHER user requires an admin role.
 *        Body: { userId: string, title, body, data?, badge? }
 *
 *   2. By raw device token (legacy / direct) — admin only, since the caller is
 *      addressing an arbitrary device rather than a user they own.
 *        Body: { deviceToken: string, title, body, data? }
 *
 * Response: { success: true, data: { sent, failed, configured } } or
 *           { error } with an appropriate HTTP status.
 *
 * NOTE: in-app + multi-channel delivery normally flows through
 * `lib/send-reminder.ts -> sendNotification()`, which already calls
 * `sendPushToUser`. This route is the thin HTTP surface for the iOS client and
 * for ad-hoc/admin sends.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, ADMIN_ROLES } from '@/lib/api-auth';
import { sendPushNotification } from '@/lib/apns';
import { sendPushToUser, type PushResult } from '@/lib/send-push';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  let body: {
    userId?: unknown;
    deviceToken?: unknown;
    title?: unknown;
    body?: unknown;
    data?: unknown;
    badge?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { userId, deviceToken, title, body: messageBody, data, badge } = body;

  // ── Shared field validation ───────────────────────────────────────────────
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (typeof messageBody !== 'string' || !messageBody.trim()) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }
  if (data !== undefined && (typeof data !== 'object' || Array.isArray(data) || data === null)) {
    return NextResponse.json({ error: 'data must be a plain object' }, { status: 400 });
  }
  if (badge !== undefined && (typeof badge !== 'number' || !Number.isFinite(badge))) {
    return NextResponse.json({ error: 'badge must be a number' }, { status: 400 });
  }

  const hasUserId = typeof userId === 'string' && userId.trim().length > 0;
  const hasDeviceToken = typeof deviceToken === 'string' && deviceToken.trim().length > 0;

  if (hasUserId && hasDeviceToken) {
    return NextResponse.json(
      { error: 'Provide exactly one of userId or deviceToken, not both' },
      { status: 400 }
    );
  }
  if (!hasUserId && !hasDeviceToken) {
    return NextResponse.json(
      { error: 'Either userId or deviceToken is required' },
      { status: 400 }
    );
  }

  const isAdmin = ADMIN_ROLES.includes(auth.role);
  const cleanTitle = title.trim();
  const cleanBody = messageBody.trim();
  const cleanData = data as Record<string, unknown> | undefined;

  // ── Mode 1: target by user (fan-out to all their devices) ──────────────────
  if (hasUserId) {
    const targetUserId = (userId as string).trim();

    // A user may push to themselves; pushing to anyone else requires admin.
    if (targetUserId !== auth.userId && !isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden. Admin access required to push to another user.' },
        { status: 403 }
      );
    }

    // Tenant isolation: a non-super-admin admin can only target users in their
    // own tenant. (Self-push is always allowed and skips this check.)
    if (targetUserId !== auth.userId && auth.role !== 'super_admin' && auth.tenantId) {
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('tenant_id')
        .eq('id', targetUserId)
        .maybeSingle();
      if (!targetProfile || targetProfile.tenant_id !== auth.tenantId) {
        return NextResponse.json(
          { error: 'Forbidden. Target user is not in your tenant.' },
          { status: 403 }
        );
      }
    }

    let result: PushResult;
    try {
      result = await sendPushToUser(targetUserId, {
        title: cleanTitle,
        body: cleanBody,
        data: cleanData,
        ...(typeof badge === 'number' ? { badge } : {}),
      });
    } catch (e) {
      console.error('[push] sendPushToUser threw:', e);
      return NextResponse.json({ error: 'Failed to send push notification' }, { status: 502 });
    }

    auditPush(auth, {
      mode: 'user',
      target: targetUserId,
      title: cleanTitle,
      sent: result.sent,
      failed: result.failed,
      configured: result.configured,
    });

    if (!result.configured) {
      // No provider env — this is a config gap, not a client error. 503.
      return NextResponse.json(
        { error: 'Push notifications are not configured on the server' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { sent: result.sent, failed: result.failed, configured: result.configured },
    });
  }

  // ── Mode 2: target a raw device token (admin only) ─────────────────────────
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden. Admin access required to push to a raw device token.' },
      { status: 403 }
    );
  }

  const token = (deviceToken as string).trim();

  let success = false;
  let errorMsg: string | undefined;
  try {
    const result = await sendPushNotification(token, {
      title: cleanTitle,
      body: cleanBody,
      data: cleanData,
      ...(typeof badge === 'number' ? { badge } : {}),
    });
    success = result.success;
    errorMsg = result.error;
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  auditPush(auth, {
    mode: 'token',
    target: token.slice(0, 8) + '…',
    title: cleanTitle,
    sent: success ? 1 : 0,
    failed: success ? 0 : 1,
    configured: true,
    error: errorMsg,
  });

  if (!success) {
    console.error('[push] sendPushNotification failed:', errorMsg);
    return NextResponse.json(
      { error: errorMsg ?? 'Failed to send push notification' },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data: { sent: 1, failed: 0, configured: true } });
}

/** Fire-and-forget audit log — never blocks the response, never throws. */
function auditPush(
  auth: { userId: string; tenantId: string | null },
  details: {
    mode: 'user' | 'token';
    target: string;
    title: string;
    sent: number;
    failed: number;
    configured: boolean;
    error?: string;
  }
): void {
  Promise.resolve(
    supabaseAdmin.from('audit_logs').insert({
      action: 'push_sent',
      actor_id: auth.userId,
      resource_type: 'push_notification',
      resource_id: null,
      details: { ...details, tenant_id: auth.tenantId },
    })
  )
    .then(() => {})
    .catch(() => {});
}
