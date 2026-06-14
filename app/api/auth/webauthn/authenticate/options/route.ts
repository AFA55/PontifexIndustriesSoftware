export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/webauthn/authenticate/options  (PUBLIC)
 *
 * Step 1 of passwordless passkey LOGIN. Returns the request options for
 * navigator.credentials.get(). We pass NO allowCredentials so the browser
 * offers any discoverable (resident) passkey for this site — usernameless
 * login. The one-time challenge is stored in an httpOnly cookie.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateAuthenticationOptions,
  getRpID,
  AUTH_CHALLENGE_COOKIE,
  challengeCookieOptions,
} from '@/lib/webauthn';

export async function POST(request: NextRequest) {
  // Optional: the client passes the credentialId enrolled on THIS device so we
  // target it directly — that turns the OS prompt into a single Touch ID/Face ID
  // unlock instead of the cross-device passkey chooser. Falls back to the
  // discoverable (usernameless) flow when no id is supplied.
  let credentialId: string | undefined;
  try {
    const body = await request.json();
    if (typeof body?.credentialId === 'string' && body.credentialId) {
      credentialId = body.credentialId;
    }
  } catch {
    /* no body → discoverable flow */
  }

  const options = await generateAuthenticationOptions({
    rpID: getRpID(request),
    // Require the biometric/PIN check ('preferred' can be silently skipped).
    userVerification: 'required',
    allowCredentials: credentialId ? [{ id: credentialId }] : [],
  });

  const res = NextResponse.json({ success: true, options });
  res.cookies.set(AUTH_CHALLENGE_COOKIE, options.challenge, challengeCookieOptions());
  return res;
}
