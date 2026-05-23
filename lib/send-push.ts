/**
 * Native Push Notification Service (APNs for iOS, FCM for Android).
 *
 * Sends push notifications to a user's registered devices (push_tokens table).
 *
 * APNs (iOS) uses token-based auth with a .p8 key — set these env vars when the
 * Apple Developer account + APNs key are ready (the system no-ops gracefully
 * until then, so reminders fall back to SMS/in-app without errors):
 *   APNS_KEY_ID       — 10-char Key ID from Apple Developer > Keys
 *   APNS_TEAM_ID      — 10-char Apple Team ID
 *   APNS_BUNDLE_ID    — app bundle id (e.g. com.pontifex.industries)
 *   APNS_PRIVATE_KEY  — contents of the AuthKey_XXXX.p8 file (PEM, \n-escaped ok)
 *   APNS_HOST         — optional; defaults to production (api.push.apple.com)
 *
 * Android (FCM) — set FCM_SERVER_KEY to enable (legacy HTTP API).
 */

import http2 from 'node:http2';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface PushPayload {
  title: string;
  body: string;
  /** arbitrary data delivered to the app (e.g. { route: '/dashboard/timecard' }) */
  data?: Record<string, string>;
  badge?: number;
}

export interface PushResult {
  configured: boolean;
  sent: number;
  failed: number;
}

// ── APNs JWT (cached up to 50 min; APNs allows reuse up to 60) ────────────────
let cachedApnsJwt: { token: string; createdAt: number } | null = null;

function getApnsJwt(): string | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const rawKey = process.env.APNS_PRIVATE_KEY;
  if (!keyId || !teamId || !rawKey) return null;

  // Reuse cached token if < 50 min old
  if (cachedApnsJwt && Date.now() - cachedApnsJwt.createdAt < 50 * 60 * 1000) {
    return cachedApnsJwt.token;
  }

  const privateKey = rawKey.replace(/\\n/g, '\n');
  const token = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    keyid: keyId,
    issuer: teamId,
    expiresIn: '50m',
  });
  cachedApnsJwt = { token, createdAt: Date.now() };
  return token;
}

function apnsConfigured(): boolean {
  return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY && process.env.APNS_BUNDLE_ID);
}

/** Send one APNs notification over HTTP/2. Resolves to true on 200. */
function sendApns(deviceToken: string, payload: PushPayload): Promise<boolean> {
  return new Promise((resolve) => {
    const authToken = getApnsJwt();
    const bundleId = process.env.APNS_BUNDLE_ID;
    if (!authToken || !bundleId) return resolve(false);

    const host = process.env.APNS_HOST || 'https://api.push.apple.com';
    let client: http2.ClientHttp2Session;
    try {
      client = http2.connect(host);
    } catch {
      return resolve(false);
    }

    const body = JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: 'default',
        ...(typeof payload.badge === 'number' ? { badge: payload.badge } : {}),
      },
      ...(payload.data || {}),
    });

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${authToken}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'content-type': 'application/json',
    });

    let status = 0;
    req.on('response', (headers) => { status = Number(headers[':status']) || 0; });
    req.setEncoding('utf8');
    req.on('data', () => {});
    req.on('end', () => { client.close(); resolve(status === 200); });
    req.on('error', () => { try { client.close(); } catch { /* noop */ } resolve(false); });

    req.write(body);
    req.end();
    // Safety timeout
    setTimeout(() => { try { client.close(); } catch { /* noop */ } resolve(status === 200); }, 8000);
  });
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

/**
 * Send a push to every registered device for a user.
 * Returns { configured:false } if no push provider env is set (graceful no-op).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushResult> {
  const iosOn = apnsConfigured();
  const androidOn = !!process.env.FCM_SERVER_KEY;
  if (!iosOn && !androidOn) {
    return { configured: false, sent: 0, failed: 0 };
  }

  const { data: tokens } = await supabaseAdmin
    .from('push_tokens')
    .select('token, platform')
    .eq('user_id', userId);

  if (!tokens || tokens.length === 0) return { configured: true, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  await Promise.all(
    tokens.map(async (t: { token: string; platform: string }) => {
      let ok = false;
      if (t.platform === 'ios' && iosOn) ok = await sendApns(t.token, payload);
      else if (t.platform === 'android' && androidOn) ok = await sendFcm(t.token, payload);
      if (ok) sent++; else failed++;
    })
  );

  return { configured: true, sent, failed };
}

/** True if any push provider is configured. */
export function isPushConfigured(): boolean {
  return apnsConfigured() || !!process.env.FCM_SERVER_KEY;
}
