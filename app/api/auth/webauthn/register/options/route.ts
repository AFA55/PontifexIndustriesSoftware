export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/webauthn/register/options
 *
 * Step 1 of passkey ENROLLMENT (authenticated user). Returns the
 * PublicKeyCredentialCreationOptions the browser feeds to navigator.credentials
 * .create(), and stashes the one-time challenge in an httpOnly cookie that the
 * /verify step validates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import {
  generateRegistrationOptions,
  getRpID,
  RP_NAME,
  REG_CHALLENGE_COOKIE,
  challengeCookieOptions,
} from '@/lib/webauthn';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  // Display name for the authenticator UI.
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, email')
    .eq('id', auth.userId)
    .single();

  const userName = profile?.email || auth.userEmail || 'user';
  const userDisplayName = profile?.full_name || userName;

  // Don't let the user register the same authenticator twice.
  const { data: existing } = await supabaseAdmin
    .from('webauthn_credentials')
    .select('credential_id, transports')
    .eq('user_id', auth.userId);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: getRpID(request),
    userName,
    userDisplayName,
    userID: new TextEncoder().encode(auth.userId),
    attestationType: 'none',
    excludeCredentials: (existing ?? []).map((c) => ({
      id: c.credential_id as string,
      transports: (c.transports ?? undefined) as
        | ('ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb')[]
        | undefined,
    })),
    authenticatorSelection: {
      // PLATFORM only → the built-in biometric (Touch ID / Face ID / Windows
      // Hello / Android fingerprint), never a roaming security key or the
      // phone-via-QR flow. This is the "Use Touch ID" experience.
      authenticatorAttachment: 'platform',
      // Discoverable (resident) key → enables passwordless login later.
      residentKey: 'required',
      requireResidentKey: true,
      // Force the biometric/PIN check ('preferred' can be silently skipped).
      userVerification: 'required',
    },
  });

  const res = NextResponse.json({ success: true, options });
  res.cookies.set(REG_CHALLENGE_COOKIE, options.challenge, challengeCookieOptions());
  return res;
}
