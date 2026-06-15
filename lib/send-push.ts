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
 * Android (FCM HTTP v1) — set FIREBASE_SERVICE_ACCOUNT_JSON to enable. Its value is the
 *   Firebase service-account key JSON (raw JSON or base64). We mint an OAuth2 access token
 *   (RS256 JWT, signed with node:crypto — same manual-JWT approach as apns.ts, no new deps)
 *   and POST to the v1 endpoint. The legacy FCM_SERVER_KEY / fcm.googleapis.com/fcm/send API
 *   is dead (Google shut it down Jun 2024) and is no longer used.
 *
 * Design contract: this module NEVER throws. A missing/invalid device token,
 * a transport error, or a misconfigured provider all degrade gracefully and
 * are reflected in the returned summary. Callers (e.g. `lib/send-reminder.ts`)
 * can treat push as fire-and-forget without wrapping it in try/catch — but
 * doing so anyway is harmless.
 */

import crypto from 'node:crypto';
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

// ── FCM HTTP v1 (Android) ──────────────────────────────────────────────────
// Service account is parsed once and cached. `undefined` = not yet read,
// `null` = read and absent/invalid (so we don't re-parse on every call).
interface FcmServiceAccount { client_email: string; private_key: string; project_id: string }
let saCache: FcmServiceAccount | null | undefined;

function getFcmServiceAccount(): FcmServiceAccount | null {
  if (saCache !== undefined) return saCache;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) { saCache = null; return null; }
  try {
    // Accept raw JSON or base64-encoded JSON (avoids newline/escaping headaches in env vars).
    const jsonStr = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const sa = JSON.parse(jsonStr);
    if (!sa.client_email || !sa.private_key || !sa.project_id) { saCache = null; return null; }
    saCache = {
      client_email: String(sa.client_email),
      private_key: String(sa.private_key).replace(/\\n/g, '\n'),
      project_id: String(sa.project_id),
    };
    return saCache;
  } catch {
    saCache = null;
    return null;
  }
}

function fcmConfigured(): boolean {
  return !!getFcmServiceAccount();
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// OAuth2 access token, cached until ~1 min before expiry.
let tokenCache: { token: string; exp: number } | null = null;

async function getFcmAccessToken(sa: FcmServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token;
  try {
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = base64url(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }));
    const signingInput = `${header}.${claim}`;
    const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(sa.private_key);
    const jwt = `${signingInput}.${base64url(signature)}`;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });
    if (!res.ok) { console.warn('[send-push] FCM token request failed:', res.status); return null; }
    const j = await res.json();
    if (!j.access_token) return null;
    tokenCache = { token: j.access_token, exp: now + (Number(j.expires_in) || 3600) };
    return tokenCache.token;
  } catch (e) {
    console.warn('[send-push] FCM token mint threw:', e);
    return null;
  }
}

/** Send one FCM notification via HTTP v1. Resolves true on success. Never throws. */
async function sendFcm(deviceToken: string, payload: PushPayload): Promise<boolean> {
  const sa = getFcmServiceAccount();
  if (!sa) return false;
  const accessToken = await getFcmAccessToken(sa);
  if (!accessToken) return false;
  try {
    // FCM v1 requires all data values to be strings.
    const data: Record<string, string> = {};
    if (payload.data) {
      for (const [k, v] of Object.entries(payload.data)) {
        data[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }
    }
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: payload.title, body: payload.body },
          ...(Object.keys(data).length ? { data } : {}),
          android: { priority: 'high', notification: { sound: 'default' } },
        },
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
  const androidOn = fcmConfigured();
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
  return apnsConfigured() || fcmConfigured();
}
