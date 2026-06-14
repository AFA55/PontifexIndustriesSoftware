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
  const options = await generateAuthenticationOptions({
    rpID: getRpID(request),
    userVerification: 'preferred',
    // Empty → discoverable-credential (usernameless) flow.
    allowCredentials: [],
  });

  const res = NextResponse.json({ success: true, options });
  res.cookies.set(AUTH_CHALLENGE_COOKIE, options.challenge, challengeCookieOptions());
  return res;
}
