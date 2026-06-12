export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/auth/forgot-password
 * Send password reset email to user.
 *
 * Flow: look up the (active) profile → mint a Supabase recovery link via
 * admin.generateLink → email it ourselves via Resend (better deliverability than
 * Supabase's default SMTP). For security we ALWAYS return the same generic
 * message so the client can't enumerate which emails exist — but real failures
 * are surfaced to Sentry so we actually find out when delivery breaks (this route
 * used to swallow every failure as success, which is how "no email arrives" went
 * unnoticed).
 *
 * HARDENING (Jun 2026): email is normalized + matched case-insensitively with
 * .maybeSingle() (a mobile user typing "Zack@..." auto-capitalized no longer
 * misses the lowercase stored value and silently gets no email), and the recovery
 * link now carries an explicit redirectTo → /update-password.
 *
 * ⚠️ Requires (founder/dashboard): RESEND_API_KEY set in Vercel, the Resend
 * sending domain verified, AND `${APP_URL}/update-password` present in Supabase
 * Auth → URL Configuration → Redirect URLs (else Supabase ignores redirectTo).
 */

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, generatePasswordResetEmail } from '@/lib/email';
import { resolveAppOrigin } from '@/lib/app-url';

// Generic response so the client can never tell whether an email exists.
const GENERIC_OK = {
  success: true,
  message: 'If an account exists with that email, a password reset link has been sent.',
};

// Hardened: trim + validate as http(s) + origin-only. A whitespace-polluted
// NEXT_PUBLIC_APP_URL once poisoned the recovery redirectTo for every reset.
const APP_URL = resolveAppOrigin();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawEmail = typeof body?.email === 'string' ? body.email : '';
    // Normalize: trim + lowercase. Supabase stores auth emails lowercased and our
    // profiles are all lowercase, so this is the canonical form for matching.
    const email = rawEmail.trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    console.log(`🔑 Password reset requested for: ${email}`);

    // Case-insensitive lookup; .maybeSingle() returns null (no throw) on 0 rows.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, active')
      .ilike('email', email)
      .maybeSingle();

    if (profileError) {
      // A real DB error (not "no rows") — log it, but still return generic OK.
      console.error('❌ profiles lookup error in forgot-password:', profileError.message);
      Sentry.captureException(profileError, { tags: { route: 'forgot-password', step: 'profile-lookup' } });
      return NextResponse.json(GENERIC_OK, { status: 200 });
    }

    if (!profile) {
      console.log(`⚠️ Email not found: ${email}`);
      return NextResponse.json(GENERIC_OK, { status: 200 });
    }

    if (!profile.active) {
      console.log(`⚠️ Inactive account: ${email}`);
      return NextResponse.json(GENERIC_OK, { status: 200 });
    }

    // Mint a recovery link. redirectTo MUST be allow-listed in Supabase Auth →
    // URL Configuration → Redirect URLs, or Supabase falls back to the Site URL
    // and the link won't land on /update-password with a session.
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: profile.email || email,
      options: { redirectTo: `${APP_URL}/update-password` },
    });

    if (resetError || !resetData?.properties?.action_link) {
      console.error('❌ Error generating reset link:', resetError?.message);
      Sentry.captureException(resetError ?? new Error('generateLink returned no action_link'), {
        tags: { route: 'forgot-password', step: 'generate-link' },
      });
      // Still generic to the client (don't reveal existence), but we now KNOW.
      return NextResponse.json(GENERIC_OK, { status: 200 });
    }

    console.log('✅ Reset link generated');

    const resetEmailHtml = generatePasswordResetEmail(
      profile.full_name || 'there',
      resetData.properties.action_link
    );

    const emailSent = await sendEmail({
      to: profile.email || email,
      subject: 'Password Reset Request - Patriot Concrete Cutting',
      html: resetEmailHtml,
    });

    if (!emailSent) {
      // The profile EXISTS and is active, so this is a genuine delivery failure
      // (missing RESEND_API_KEY, unverified domain, Resend API error). Surface it.
      console.error('❌ Password reset email failed to send for an existing user');
      Sentry.captureMessage('Password reset email failed to send (Resend)', {
        level: 'error',
        tags: { route: 'forgot-password', step: 'send-email' },
      });
    }

    return NextResponse.json(GENERIC_OK, { status: 200 });
  } catch (error: any) {
    console.error('💥 Unexpected error in forgot-password route:', error);
    Sentry.captureException(error, { tags: { route: 'forgot-password', step: 'unexpected' } });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
