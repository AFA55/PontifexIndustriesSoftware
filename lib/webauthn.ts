/**
 * WebAuthn / passkey server helpers — biometric (fingerprint / Touch ID /
 * Windows Hello) sign-in for the WEBSITE. The web analogue of the native app's
 * Face ID (lib/biometric.ts).
 *
 * Thin wrapper around @simplewebauthn/server (v13). The four ceremony routes
 * live under app/api/auth/webauthn/*. Credentials are stored in the
 * `webauthn_credentials` table; the registration/authentication challenge is
 * carried in a short-lived httpOnly cookie (single-use nonce).
 *
 * RP identity (rpID + expected origin) is derived from the request Origin so the
 * same code works on localhost, Vercel previews, prod, and inside the iOS
 * Capacitor webview (which loads the prod origin). Passkeys are domain-bound by
 * design — one enrolled on prod won't work on a preview URL, and vice-versa.
 */

import type { NextRequest } from 'next/server';

export const RP_NAME = 'Pontifex Industries';

/** Effective relying-party ID = the registrable hostname of the request origin. */
export function getRpID(request: NextRequest): string {
  const origin = request.headers.get('origin') || '';
  try {
    return new URL(origin).hostname; // 'localhost' | 'pontifexindustries.com' | ...
  } catch {
    return 'localhost';
  }
}

/** Exact origin the browser used — must match for verification. */
export function getExpectedOrigin(request: NextRequest): string {
  return request.headers.get('origin') || 'http://localhost:3000';
}

// ---------------------------------------------------------------------------
// Challenge cookies — httpOnly, short-lived, single-use nonces.
// ---------------------------------------------------------------------------
export const REG_CHALLENGE_COOKIE = 'pontifex_webauthn_reg';
export const AUTH_CHALLENGE_COOKIE = 'pontifex_webauthn_auth';

export function challengeCookieOptions(maxAgeSeconds = 300) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

// ---------------------------------------------------------------------------
// Base64URL <-> bytes (public key storage). Node Buffer supports 'base64url'.
// ---------------------------------------------------------------------------
export function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function base64UrlToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

// Re-export the SimpleWebAuthn ceremony functions so routes import from one place.
export {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
