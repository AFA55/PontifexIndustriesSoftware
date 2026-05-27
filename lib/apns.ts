/**
 * Apple Push Notification service (APNs) utility
 *
 * Authentication: JWT (ES256) — no certificate required.
 * Transport: HTTP/2 via Node.js built-in `http2` module.
 *
 * Required env vars (already in Vercel + .env.local):
 *   APNS_KEY_ID       — 10-char key ID from App Store Connect (M44JJFDG6G)
 *   APNS_TEAM_ID      — 10-char team ID from Apple Developer (MG4K845UH7)
 *   APNS_BUNDLE_ID    — app bundle ID (com.pontifexindustries.app)
 *   APNS_PRIVATE_KEY  — full PEM string from AuthKey_<KEY_ID>.p8
 *
 * JWT lifecycle: APNs tokens are valid for 60 min. We refresh at 45 min.
 * HTTP/2 session: reused for multiple requests; reconnects automatically.
 */

import * as http2 from 'http2';
import * as crypto from 'crypto';

export interface ApnsPayload {
  title: string;
  body: string;
  badge?: number;
  data?: Record<string, unknown>;
}

interface ApnsResult {
  success: boolean;
  error?: string;
}

// ── JWT cache ─────────────────────────────────────────────────────────────────
let cachedJwt: string | null = null;
let jwtExpiresAt = 0; // epoch seconds

/**
 * Generate (or return a cached) APNs JWT signed with ES256.
 *
 * Header: { alg: 'ES256', kid: APNS_KEY_ID }
 * Payload: { iss: APNS_TEAM_ID, iat: <now> }
 *
 * We use Node.js `crypto.createSign` (synchronous, always available)
 * instead of Web Crypto to avoid async complexity inside the JWT builder.
 */
function getApnsJwt(): string {
  const nowSec = Math.floor(Date.now() / 1000);

  // Return cached token if still fresh (< 45 min old)
  if (cachedJwt && nowSec < jwtExpiresAt) {
    return cachedJwt;
  }

  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const privateKeyPem = process.env.APNS_PRIVATE_KEY;

  if (!keyId || !teamId || !privateKeyPem) {
    throw new Error(
      'Missing APNs env vars: APNS_KEY_ID, APNS_TEAM_ID, or APNS_PRIVATE_KEY'
    );
  }

  // Normalise PEM: Vercel/Dotenv may encode literal "\n" as the two-character
  // sequence backslash-n. Replace with real newlines.
  const normalizedPem = privateKeyPem.replace(/\\n/g, '\n');

  const header = Buffer.from(
    JSON.stringify({ alg: 'ES256', kid: keyId })
  ).toString('base64url');

  const payload = Buffer.from(
    JSON.stringify({ iss: teamId, iat: nowSec })
  ).toString('base64url');

  const signingInput = `${header}.${payload}`;

  const sign = crypto.createSign('SHA256');
  sign.update(signingInput);
  const signature = sign
    .sign({ key: normalizedPem, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');

  const token = `${signingInput}.${signature}`;

  cachedJwt = token;
  // Expire the local cache after 45 min
  jwtExpiresAt = nowSec + 45 * 60;

  return token;
}

// ── HTTP/2 session pool ───────────────────────────────────────────────────────
// One persistent session per authority. APNs strongly recommends reusing
// connections; reconnect on any session error.

const APNS_HOST = 'api.push.apple.com'; // production endpoint
const APNS_PORT = 443;

let h2Session: http2.ClientHttp2Session | null = null;
let sessionConnecting = false;
const sessionWaiters: Array<(s: http2.ClientHttp2Session) => void> = [];

function getH2Session(): Promise<http2.ClientHttp2Session> {
  return new Promise((resolve, reject) => {
    if (h2Session && !h2Session.destroyed && !h2Session.closed) {
      resolve(h2Session);
      return;
    }

    sessionWaiters.push(resolve);

    if (sessionConnecting) return;

    sessionConnecting = true;

    const session = http2.connect(`https://${APNS_HOST}:${APNS_PORT}`);

    session.once('connect', () => {
      h2Session = session;
      sessionConnecting = false;
      const waiters = sessionWaiters.splice(0);
      for (const w of waiters) w(session);
    });

    session.once('error', (err) => {
      sessionConnecting = false;
      h2Session = null;
      const waiters = sessionWaiters.splice(0);
      for (const w of waiters) w(null as unknown as http2.ClientHttp2Session);
      console.error('[apns] H2 session error:', err.message);
      reject(err);
    });

    session.once('close', () => {
      h2Session = null;
      sessionConnecting = false;
    });

    session.once('goaway', () => {
      h2Session = null;
      sessionConnecting = false;
    });
  });
}

// ── Send one push notification ────────────────────────────────────────────────

export async function sendPushNotification(
  deviceToken: string,
  payload: ApnsPayload
): Promise<ApnsResult> {
  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!bundleId) {
    return { success: false, error: 'Missing APNS_BUNDLE_ID env var' };
  }

  let jwt: string;
  try {
    jwt = getApnsJwt();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `JWT generation failed: ${message}` };
  }

  const apsBody: Record<string, unknown> = {
    aps: {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      badge: payload.badge,
      sound: 'default',
    },
    ...(payload.data ?? {}),
  };

  // Remove undefined badge to keep payload clean
  if (payload.badge === undefined) {
    delete (apsBody.aps as Record<string, unknown>)['badge'];
  }

  const bodyStr = JSON.stringify(apsBody);

  let session: http2.ClientHttp2Session;
  try {
    session = await getH2Session();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `H2 connect failed: ${message}` };
  }

  return new Promise<ApnsResult>((resolve) => {
    let resolved = false;

    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      ':scheme': 'https',
      ':authority': APNS_HOST,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      authorization: `bearer ${jwt}`,
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(bodyStr).toString(),
    });

    req.write(bodyStr);
    req.end();

    let responseBody = '';
    let statusCode = 0;

    req.on('response', (headers) => {
      statusCode = headers[':status'] as number;
    });

    req.on('data', (chunk: Buffer) => {
      responseBody += chunk.toString();
    });

    req.on('end', () => {
      if (resolved) return;
      resolved = true;

      if (statusCode === 200) {
        resolve({ success: true });
      } else {
        // APNs returns JSON error bodies: { reason: 'BadDeviceToken', ... }
        const parsed = (() => {
          try {
            return JSON.parse(responseBody) as { reason?: string };
          } catch {
            return { reason: responseBody };
          }
        })();

        const errorMsg = parsed.reason ?? `HTTP ${statusCode}`;

        // Invalidate JWT cache on token-expired responses
        if (parsed.reason === 'ExpiredProviderToken' || parsed.reason === 'InvalidProviderToken') {
          cachedJwt = null;
          jwtExpiresAt = 0;
        }

        resolve({ success: false, error: errorMsg });
      }
    });

    req.on('error', (err: Error) => {
      if (resolved) return;
      resolved = true;
      // Destroy the session so the next call reconnects cleanly
      session.destroy();
      h2Session = null;
      resolve({ success: false, error: err.message });
    });

    // Safety timeout: APNs should respond in < 5s under normal conditions
    req.setTimeout(10_000, () => {
      if (!resolved) {
        resolved = true;
        req.destroy();
        resolve({ success: false, error: 'APNs request timed out' });
      }
    });
  });
}
