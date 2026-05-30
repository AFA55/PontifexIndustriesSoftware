/**
 * Native Push Notification Service (per-user fan-out).
 *
 * Sends push notifications to every device a user has registered in the
 * `push_tokens` table. The actual on-the-wire APNs delivery is delegated to
 * `lib/apns.ts` (HTTP/2 + ES256 JWT with session pooling + cache invalidation),
 * so there is a single, battle-tested APNs implementation in the codebase.
 *
 * APNs (iOS) env vars (already set in Vercel + .env.local):
 *   APNS_KEY_ID       — 10-char Key ID from App Store Connect
 *   APNS_TEAM_ID      — 10-char Apple Team ID
 *   APNS_BUNDLE_ID    — app bundle id (e.g. com.pontifexindustries.app)
 *   APNS_PRIVATE_KEY  — contents of the AuthKey_XXXX.p8 file (PEM, \n-escaped ok)
 *
 * Android (FCM) — set FCM_SERVER_KEY to enable (legacy HTTP API).
 *
 * Design contract: this module NEVER throws. A missing/invalid device token,
 * a transport error, or a misconfigured provider all degrade gracefully and
 * are reflected in the returned summary. Callers (e.g. `lib/send-reminder.ts`)
 * can treat push as fire-and-forget without wrapping it in try/catch — but
 * doing so anyway is harmless.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendPushNotification, type ApnsPayload } from '@/lib/apns';

export interface PushPayload {
  title: string;
  body: string;
  /** arbitrary data delivered to the app (e.g. { route: '/dashboard/timecard' }) */
  data?: Record<string, unknown>;
  badge?: number;
}

export interface PushResult {
  /** false when no push provider env is configured (graceful no-op). */
  configured: boolean;
  sent: number;
  failed: number;
}

function apnsConfigured(): boolean {
  return !!(
    process.env.APNS_KEY_ID &&
    process.env.APNS_TEAM_ID &&
    process.env.APNS_PRIVATE_KEY &&
    process.env.APNS_BUNDLE_ID
  );
}

/** Send one FCM notification (legacy HTTP API). Resolves true on success. */
async function sendFcm(deviceToken: string, payload: PushPayload): Promise<boolean> {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) return false;
  try {
    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: { Authorization: `key=${serverKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: deviceToken,
        notification: { title: payload.title, body: payload.body },
        data: payload.data || {},
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Deliver one notification to a single APNs device token. Never throws. */
async function sendApns(deviceToken: string, payload: PushPayload): Promise<boolean> {
  try {
    const apnsPayload: ApnsPayload = {
      title: payload.title,
      body: payload.body,
      ...(typeof payload.badge === 'number' ? { badge: payload.badge } : {}),
      ...(payload.data ? { data: payload.data } : {}),
    };
    const result = await sendPushNotification(deviceToken, apnsPayload);
    return result.success;
  } catch {
    // Defense in depth — sendPushNotification already swallows its own errors,
    // but guarantee this never escapes regardless of future changes.
    return false;
  }
}

/**
 * Send a push to every registered device for a user.
 *
 * Returns { configured:false } if no push provider env is set (graceful no-op,
 * so reminders fall back to SMS/in-app without surfacing an error). One bad or
 * expired device token never aborts the batch — each token is delivered and
 * tallied independently.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushResult> {
  const iosOn = apnsConfigured();
  const androidOn = !!process.env.FCM_SERVER_KEY;
  if (!iosOn && !androidOn) {
    return { configured: false, sent: 0, failed: 0 };
  }

  if (!userId) return { configured: true, sent: 0, failed: 0 };

  let tokens: Array<{ token: string; platform: string }> = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', userId);
    if (error) {
      console.warn('[send-push] token lookup failed:', error.message);
      return { configured: true, sent: 0, failed: 0 };
    }
    tokens = data ?? [];
  } catch (e) {
    console.warn('[send-push] token lookup threw:', e);
    return { configured: true, sent: 0, failed: 0 };
  }

  if (tokens.length === 0) return { configured: true, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  // Promise.allSettled — one rejected/failed token must not abort the batch.
  const results = await Promise.allSettled(
    tokens.map(async (t) => {
      // Skip blank/invalid tokens without counting them as a hard failure of
      // delivery infrastructure — but still tally so the caller sees the gap.
      if (!t.token || !t.token.trim()) return false;
      if (t.platform === 'ios' && iosOn) return sendApns(t.token.trim(), payload);
      if (t.platform === 'android' && androidOn) return sendFcm(t.token.trim(), payload);
      // 'web' or a platform with no configured provider → not deliverable here.
      return false;
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value === true) sent++;
    else failed++;
  }

  return { configured: true, sent, failed };
}

/** True if any push provider is configured. */
export function isPushConfigured(): boolean {
  return apnsConfigured() || !!process.env.FCM_SERVER_KEY;
}
