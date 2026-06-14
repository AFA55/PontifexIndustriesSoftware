export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/webauthn/register/verify
 *
 * Step 2 of passkey ENROLLMENT (authenticated user). Verifies the attestation
 * the browser produced against the challenge cookie and, on success, persists
 * the new credential to webauthn_credentials.
 *
 * Body: { response: RegistrationResponseJSON, nickname?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import {
  verifyRegistrationResponse,
  getRpID,
  getExpectedOrigin,
  bytesToBase64Url,
  REG_CHALLENGE_COOKIE,
} from '@/lib/webauthn';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const expectedChallenge = request.cookies.get(REG_CHALLENGE_COOKIE)?.value;
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'Registration challenge expired. Try again.' }, { status: 400 });
  }

  let body: { response?: unknown; nickname?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!body.response) {
    return NextResponse.json({ error: 'Missing registration response' }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: body.response as any,
      expectedChallenge,
      expectedOrigin: getExpectedOrigin(request),
      expectedRPID: getRpID(request),
      requireUserVerification: false,
    });
  } catch (err) {
    console.error('[webauthn/register/verify] verification error:', err);
    return NextResponse.json({ error: 'Could not verify passkey' }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Passkey verification failed' }, { status: 400 });
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  // Derive a friendly default label from the platform if the client didn't send one.
  const nickname =
    (typeof body.nickname === 'string' && body.nickname.trim().slice(0, 60)) ||
    defaultDeviceLabel(request.headers.get('user-agent'));

  const { error } = await supabaseAdmin.from('webauthn_credentials').insert({
    user_id: auth.userId,
    tenant_id: auth.tenantId,
    credential_id: credential.id,
    public_key: bytesToBase64Url(credential.publicKey),
    counter: credential.counter ?? 0,
    transports: credential.transports ?? [],
    device_type: credentialDeviceType,
    backed_up: credentialBackedUp,
    nickname,
  });

  const res = NextResponse.json(
    error
      ? { error: 'This passkey is already registered.' }
      : { success: true, credential: { id: credential.id, nickname } },
    { status: error ? 409 : 200 }
  );
  // Challenge is single-use — clear it regardless of outcome.
  res.cookies.delete(REG_CHALLENGE_COOKIE);
  return res;
}

function defaultDeviceLabel(ua: string | null): string {
  const s = (ua || '').toLowerCase();
  if (s.includes('iphone')) return 'iPhone';
  if (s.includes('ipad')) return 'iPad';
  if (s.includes('mac')) return 'Mac';
  if (s.includes('android')) return 'Android device';
  if (s.includes('windows')) return 'Windows device';
  return 'Passkey';
}
