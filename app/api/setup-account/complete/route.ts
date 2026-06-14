export const dynamic = 'force-dynamic';

/**
 * POST /api/setup-account/complete
 *
 * PUBLIC endpoint — no session. Gated ENTIRELY by a valid, unexpired, unused
 * invitation token. Finalizes account setup:
 *   1. validates the token (single-use + expiring)
 *   2. B2 guard: refuses if the email's existing auth user belongs to a
 *      DIFFERENT tenant than the invite (cross-tenant takeover protection)
 *   3. creates (or activates) the Supabase auth user with the chosen password
 *   4. upserts the profile in TWO passes:
 *        a. a MINIMAL core upsert (id, email, role, tenant_id, active,
 *           full_name) that CANNOT fail on optional columns — this guarantees
 *           the user always ends up with a working, role-scoped profile, so a
 *           missing optional column never leaves them with a login but no
 *           profile (permanent 403).
 *        b. a best-effort second update for optional columns
 *           (setup_completed, waiver_signed_at, waiver_ip, notification_consent,
 *           phone_number, nickname, date_of_birth) with a 42703
 *           graceful-degradation path. nickname + phone come from the
 *           onboarding form body (user content, not authorization).
 *      role + tenant_id come from the INVITE, never the request body.
 *   5. applies any initial feature flags the inviter set (non-fatal)
 *   6. ROTATES the invitation token to a fresh short-lived value + marks it
 *      used/accepted. This (a) makes the token single-use, and (b) kills the
 *      7-day window on the original setup link the moment onboarding completes,
 *      while still letting the immediate avatar upload (which runs right after
 *      this call) succeed within a short grace window.
 *
 * Returns { userId, avatarToken } — the client uploads the avatar with
 * avatarToken (NOT the original setup token, which is now dead).
 */

import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { randomBytes } from 'crypto';

// Short grace window for the immediate post-complete avatar upload.
const AVATAR_GRACE_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      token: string;
      password: string;
      confirmPassword?: string;
      waiverSigned: boolean;
      emailConsent: boolean;
      smsConsent: boolean;
      nickname?: string;
      phone?: string;
      hasAvatar?: boolean;
    };

    if (!body.token || !body.password) {
      return NextResponse.json({ error: 'token and password are required' }, { status: 400 });
    }

    // ── Optional user-content fields (NOT authorization fields — body is OK) ──
    // Phone: loose US validation — strip non-digits, allow a leading country 1,
    // accept exactly 10 digits or empty. Stored formatted: (864) 555-1234.
    let phoneNumber: string | null = null;
    if (typeof body.phone === 'string' && body.phone.trim()) {
      let digits = body.phone.replace(/\D/g, '');
      if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
      if (digits.length !== 10) {
        return NextResponse.json(
          { error: 'Phone number must be 10 digits, or leave it blank.' },
          { status: 400 }
        );
      }
      phoneNumber = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    const nickname =
      typeof body.nickname === 'string' ? body.nickname.trim().slice(0, 40) : '';
    if (body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (body.confirmPassword !== undefined && body.password !== body.confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
    }
    if (!body.waiverSigned) {
      return NextResponse.json(
        { error: 'You must agree to the platform terms to continue' },
        { status: 400 }
      );
    }

    // ── Validate token: must be unaccepted (single-use) AND unexpired ─────────
    const { data: inv, error: invError } = await supabaseAdmin
      .from('user_invitations')
      .select('*')
      .eq('token', body.token)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (invError || !inv) {
      return NextResponse.json(
        {
          error:
            'Invalid or expired invitation. Please request a new invitation from your administrator.',
        },
        { status: 404 }
      );
    }

    // Defense in depth: if used_at column exists and is set, treat as consumed.
    if ((inv as { used_at?: string }).used_at) {
      return NextResponse.json(
        { error: 'This invitation has already been used. Please log in.' },
        { status: 409 }
      );
    }

    const email = String(inv.email).toLowerCase();
    const fullName: string | null = (inv as { invited_name?: string }).invited_name ?? null;
    const role: string = inv.role;
    const tenantId: string = inv.tenant_id;

    // ── Locate any existing GLOBAL auth user for this email (reliable O(1)) ───
    // Previously listUsers({perPage:1000}) — a SINGLE page that silently missed
    // users buried past the first 1000. That caused re-used/old emails to fall
    // through to createUser → "already registered" → orphaned profile-less
    // accounts, AND it bypassed the cross-tenant guard below. Now a direct,
    // service-role-only lookup by email.
    let existingAuthUser: User | null = null;
    {
      const { data: foundId } = await supabaseAdmin.rpc('auth_user_id_by_email', {
        p_email: email,
      });
      if (foundId) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(String(foundId));
        existingAuthUser = u?.user ?? null;
      }
    }

    // ── B2 guard (seam 2): cross-tenant takeover protection ──────────────────
    // If an auth user already exists for this email, it MUST either have no
    // profile yet, or a profile in THIS invite's tenant. If it belongs to a
    // different tenant, refuse — do NOT touch its password/metadata/profile.
    if (existingAuthUser) {
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, tenant_id')
        .eq('id', existingAuthUser.id)
        .maybeSingle();

      if (existingProfile && existingProfile.tenant_id && existingProfile.tenant_id !== tenantId) {
        return NextResponse.json(
          { error: 'This email is already associated with another account.' },
          { status: 409 }
        );
      }
    }

    let userId: string;

    if (existingAuthUser) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthUser.id,
        {
          password: body.password,
          email_confirm: true,
          user_metadata: {
            ...existingAuthUser.user_metadata,
            full_name: fullName ?? existingAuthUser.user_metadata?.full_name,
            tenant_id: tenantId,
            role,
            setup_completed: true,
          },
        }
      );
      if (updateError) {
        console.error('[setup-account/complete] Error updating auth user:', updateError);
        return NextResponse.json(
          { error: 'Failed to update account. Please try again.' },
          { status: 500 }
        );
      }
      userId = existingAuthUser.id;
    } else {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          tenant_id: tenantId,
          role,
          setup_completed: true,
        },
      });
      if (createError || !newUser?.user) {
        console.error('[setup-account/complete] Error creating auth user:', createError);
        return NextResponse.json(
          { error: createError?.message || 'Failed to create account' },
          { status: 500 }
        );
      }
      userId = newUser.user.id;
    }

    const now = new Date().toISOString();

    // ── B1 pass (a): MINIMAL core profile upsert — MUST NOT FAIL ─────────────
    // Only columns that are guaranteed to exist in prod. This is the row that
    // makes the user's login actually work (role + tenant_id power RBAC and
    // tenant isolation). If this fails, the whole request fails loudly so we
    // never leave a user with auth-but-no-profile.
    const coreRow: Record<string, unknown> = {
      id: userId,
      email,
      role,
      tenant_id: tenantId,
      active: true,
      updated_at: now,
    };
    if (fullName) coreRow.full_name = fullName;

    const { error: coreError } = await supabaseAdmin
      .from('profiles')
      .upsert(coreRow, { onConflict: 'id' });

    if (coreError) {
      console.error('[setup-account/complete] Error upserting core profile:', coreError);
      return NextResponse.json(
        { error: 'Account created but profile setup failed. Contact your administrator.' },
        { status: 500 }
      );
    }

    // ── B1 pass (b): OPTIONAL fields — best-effort, never blocks onboarding ──
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;

    const optionalRow: Record<string, unknown> = {
      setup_completed: true,
      waiver_signed_at: now,
      waiver_ip: ip,
      notification_consent: body.emailConsent || body.smsConsent,
      updated_at: now,
    };
    // User-entered phone (this onboarding form) wins over the phone the
    // inviter typed on the invite, if any.
    if (phoneNumber) {
      optionalRow.phone_number = phoneNumber;
    } else if ((inv as { phone_number?: string }).phone_number) {
      optionalRow.phone_number = (inv as { phone_number?: string }).phone_number;
    }
    if (nickname) optionalRow.nickname = nickname;
    if ((inv as { date_of_birth?: string }).date_of_birth) {
      optionalRow.date_of_birth = (inv as { date_of_birth?: string }).date_of_birth;
    }

    const { error: optError } = await supabaseAdmin
      .from('profiles')
      .update(optionalRow)
      .eq('id', userId);

    if (optError && optError.code === '42703') {
      // One or more optional columns aren't in prod yet (migration pending).
      // Retry with only the always-present optional field(s).
      const minimalOptional: Record<string, unknown> = { updated_at: now };
      // phone_number/nickname/date_of_birth exist in profiles today;
      // setup_completed/notification_consent/waiver_* are the ones a pending
      // migration adds.
      if (optionalRow.phone_number) minimalOptional.phone_number = optionalRow.phone_number;
      if (optionalRow.nickname) minimalOptional.nickname = optionalRow.nickname;
      if (optionalRow.date_of_birth) minimalOptional.date_of_birth = optionalRow.date_of_birth;
      const { error: retryErr } = await supabaseAdmin
        .from('profiles')
        .update(minimalOptional)
        .eq('id', userId);
      if (retryErr) {
        console.error('[setup-account/complete] Optional profile retry failed (non-fatal):', retryErr);
      }
    } else if (optError) {
      console.error('[setup-account/complete] Optional profile update failed (non-fatal):', optError);
    }

    // ── Apply initial feature flags the inviter set (per-user RBAC overrides) ─
    // Non-fatal: role preset still governs access if this fails. onConflict
    // (user_id,tenant_id) matches the unique index on user_feature_flags.
    if (inv.initial_flags && Object.keys(inv.initial_flags).length > 0) {
      const flagData = {
        user_id: userId,
        tenant_id: tenantId,
        admin_type: inv.admin_type || 'admin',
        updated_at: now,
        ...inv.initial_flags,
      };
      const { error: flagError } = await supabaseAdmin
        .from('user_feature_flags')
        .upsert(flagData, { onConflict: 'user_id,tenant_id' });
      if (flagError) {
        console.error('[setup-account/complete] Error upserting feature flags (non-fatal):', flagError);
      }
    }

    // ── Seed notification preferences from the consent the user just gave ─────
    // Setup collects email + SMS consent; without this the choice is lost (the
    // user lands with zero preference rows → defaults push-on/email-off/sms-off,
    // ignoring what they picked). Push stays on (mobile alerts); email + SMS
    // follow the consent checkboxes. Non-fatal: a missing table never blocks
    // onboarding. Idempotent via the UNIQUE(user_id, category).
    const NOTIF_CATEGORIES = [
      'clock_in_reminder', 'work_performed_reminder', 'time_off_status',
      'job_dispatched', 'document_to_sign', 'maintenance_update',
    ];
    const { error: prefError } = await supabaseAdmin
      .from('notification_preferences')
      .upsert(
        NOTIF_CATEGORIES.map((category) => ({
          user_id: userId,
          category,
          push_enabled: true,
          sms_enabled: !!body.smsConsent,
          email_enabled: !!body.emailConsent,
          updated_at: now,
        })),
        { onConflict: 'user_id,category' }
      );
    if (prefError) {
      console.error('[setup-account/complete] Error seeding notification prefs (non-fatal):', prefError);
    }

    // ── H3: rotate + consume the token ───────────────────────────────────────
    // The original 7-day setup token is rotated to a fresh random value with a
    // SHORT (10-min) expiry. This (1) makes the invite single-use — the old
    // link is dead immediately — and (2) lets the very next call (the avatar
    // upload) authenticate with `avatarToken` for a brief grace window, after
    // which the avatar link also dies. accepted_at/used_at mark it consumed so
    // `complete` itself can never run twice.
    const avatarToken = randomBytes(32).toString('base64url');
    const graceExpiry = new Date(Date.now() + AVATAR_GRACE_MS).toISOString();

    const { error: markErr } = await supabaseAdmin
      .from('user_invitations')
      .update({ accepted_at: now, used_at: now, token: avatarToken, expires_at: graceExpiry })
      .eq('token', body.token);
    if (markErr && markErr.code === '42703') {
      // used_at column not present yet (migration pending) — rotate the rest.
      await supabaseAdmin
        .from('user_invitations')
        .update({ accepted_at: now, token: avatarToken, expires_at: graceExpiry })
        .eq('token', body.token);
    }

    return NextResponse.json({ success: true, data: { userId, avatarToken } });
  } catch (err) {
    console.error('[setup-account/complete] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
