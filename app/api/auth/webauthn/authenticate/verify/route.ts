export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/webauthn/authenticate/verify  (PUBLIC)
 *
 * Step 2 of passwordless passkey LOGIN. Verifies the assertion against the
 * challenge cookie and the stored credential. On success it mints a real
 * Supabase session for the owning user — WITHOUT a password — using the admin
 * generateLink + verifyOtp pattern, then returns it in the same shape as
 * /api/auth/login so the client can call supabase.auth.setSession().
 *
 * Body: { response: AuthenticationResponseJSON }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAuditEvent } from '@/lib/audit';
import {
  verifyAuthenticationResponse,
  getRpID,
  getExpectedOrigin,
  base64UrlToBytes,
  AUTH_CHALLENGE_COOKIE,
} from '@/lib/webauthn';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

function logAttempt(params: {
  email: string;
  success: boolean;
  failureReason?: string;
  userId?: string;
  request: NextRequest;
}) {
  const ipAddress =
    params.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    params.request.headers.get('x-real-ip') ||
    null;
  const userAgent = params.request.headers.get('user-agent') || null;
  Promise.resolve(
    supabaseAdmin.from('login_attempts').insert({
      email: params.email,
      success: params.success,
      failure_reason: params.failureReason || null,
      user_id: params.userId || null,
      ip_address: ipAddress,
      user_agent: userAgent,
    })
  ).catch(() => {});
}

export async function POST(request: NextRequest) {
  const expectedChallenge = request.cookies.get(AUTH_CHALLENGE_COOKIE)?.value;
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'Sign-in challenge expired. Try again.' }, { status: 400 });
  }

  let body: { response?: { id?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const credentialId = body.response?.id;
  if (!body.response || !credentialId) {
    return NextResponse.json({ error: 'Missing authentication response' }, { status: 400 });
  }

  // Look up the stored credential by its ID.
  const { data: cred } = await supabaseAdmin
    .from('webauthn_credentials')
    .select('id, user_id, tenant_id, credential_id, public_key, counter, transports')
    .eq('credential_id', credentialId)
    .maybeSingle();

  if (!cred) {
    return NextResponse.json({ error: 'Passkey not recognized' }, { status: 401 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: body.response as any,
      expectedChallenge,
      expectedOrigin: getExpectedOrigin(request),
      expectedRPID: getRpID(request),
      credential: {
        id: cred.credential_id,
        // new Uint8Array(...) ensures an ArrayBuffer-backed view (TS 5.7 generic).
        publicKey: new Uint8Array(base64UrlToBytes(cred.public_key)),
        counter: Number(cred.counter) || 0,
        transports: (cred.transports ?? undefined) as never,
      },
      requireUserVerification: false,
    });
  } catch (err) {
    console.error('[webauthn/authenticate/verify] verification error:', err);
    return NextResponse.json({ error: 'Could not verify passkey' }, { status: 401 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'Passkey verification failed' }, { status: 401 });
  }

  // Advance the signature counter + stamp last use (fire-and-forget).
  Promise.resolve(
    supabaseAdmin
      .from('webauthn_credentials')
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', cred.id)
  ).catch(() => {});

  // Resolve the owning profile and gate inactive accounts.
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, role, active, tenant_id')
    .eq('id', cred.user_id)
    .single();

  if (profileError || !profile) {
    logAttempt({ email: 'unknown', success: false, failureReason: 'profile_not_found', userId: cred.user_id, request });
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }
  if (!profile.active) {
    logAttempt({ email: profile.email, success: false, failureReason: 'inactive_account', userId: profile.id, request });
    return NextResponse.json({ error: 'Account is inactive' }, { status: 403 });
  }

  // Mint a Supabase session WITHOUT a password: generate a magic-link token via
  // the admin API (no email is sent), then exchange its hashed token for a
  // session using a fresh anon client.
  const session = await mintSession(profile.email);
  if (!session) {
    logAttempt({ email: profile.email, success: false, failureReason: 'session_mint_failed', userId: profile.id, request });
    return NextResponse.json({ error: 'Could not start session' }, { status: 500 });
  }

  // Tenant for branding (mirrors /api/auth/login).
  let tenant = null;
  if (profile.tenant_id) {
    const { data: tenantData } = await supabaseAdmin
      .from('tenants')
      .select('id, name, slug, company_code')
      .eq('id', profile.tenant_id)
      .single();
    tenant = tenantData;
  }

  logAttempt({ email: profile.email, success: true, userId: profile.id, request });
  logAuditEvent({
    userId: profile.id,
    userEmail: profile.email,
    userRole: profile.role,
    action: 'login',
    resourceType: 'auth',
    details: { method: 'webauthn' },
    request,
  });

  const res = NextResponse.json({
    success: true,
    user: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      tenant_id: profile.tenant_id,
    },
    tenant,
    session,
  });
  res.cookies.delete(AUTH_CHALLENGE_COOKIE);
  return res;
}

/**
 * Server-side passwordless session mint. Returns { access_token, refresh_token }
 * or null on failure. admin.generateLink does NOT send an email — it only
 * produces the hashed token we immediately redeem.
 */
async function mintSession(
  email: string
): Promise<{ access_token: string; refresh_token: string } | null> {
  try {
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    const hashedToken = linkData?.properties?.hashed_token;
    if (linkErr || !hashedToken) {
      console.error('[webauthn] generateLink failed:', linkErr?.message);
      return null;
    }
    const anon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({
      token_hash: hashedToken,
      type: 'email',
    });
    if (otpErr || !otpData.session) {
      console.error('[webauthn] verifyOtp failed:', otpErr?.message);
      return null;
    }
    return {
      access_token: otpData.session.access_token,
      refresh_token: otpData.session.refresh_token,
    };
  } catch (err) {
    console.error('[webauthn] mintSession error:', err);
    return null;
  }
}
