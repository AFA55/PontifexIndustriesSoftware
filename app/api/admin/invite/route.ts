export const dynamic = 'force-dynamic';

/**
 * Invite Users API — team onboarding.
 *
 *  POST /api/admin/invite           Create (or refresh) an invitation + email the setup link.
 *  GET  /api/admin/invite           List invitations for the caller's tenant (pending + accepted).
 *  PUT  /api/admin/invite           Resend an existing invitation email (body: { id }).
 *
 * Auth: admin / super_admin / operations_manager (requireAdmin).
 * Tenant isolation: every invitation is scoped via resolveTenantScope().
 *   Non-super-admins are pinned to their own tenant. super_admin may target any
 *   tenant via ?tenantId=; if omitted, resolveTenantScope falls back to the
 *   super_admin's own profile tenant (it does NOT hard-require the param).
 * Role-escalation guard: an inviter can only assign a role STRICTLY BELOW their
 *   own rank (canInviteRole); super_admin is never invitable via this flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, resolveTenantScope, type AuthSuccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { canInviteRole, ROLES_WITH_LABELS } from '@/lib/rbac';
import { Resend } from 'resend';
import { randomBytes } from 'crypto';

const VALID_ROLES = ROLES_WITH_LABELS.map((r) => r.value);
const getResend = () => new Resend(process.env.RESEND_API_KEY || 're_placeholder');

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Cryptographically-secure, unguessable token. This is the ONLY gate on the
 * public setup flow, so it must NOT encode timestamps or the email (which an
 * attacker may know). 32 random bytes = 256 bits of entropy.
 */
function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function baseUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    request.headers.get('origin') ||
    'https://www.pontifexindustries.com'
  );
}

/** Best-effort insert that degrades gracefully if optional columns are missing. */
async function insertInvitation(row: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from('user_invitations').insert(row);
  if (error && error.code === '42703') {
    // One or more optional columns don't exist yet (migration not applied).
    // Re-insert with only the guaranteed-present base columns.
    const base: Record<string, unknown> = {
      tenant_id: row.tenant_id,
      email: row.email,
      role: row.role,
      admin_type: row.admin_type ?? null,
      invited_by: row.invited_by,
      token: row.token,
      expires_at: row.expires_at,
      initial_flags: row.initial_flags ?? {},
    };
    return supabaseAdmin.from('user_invitations').insert(base);
  }
  return { error };
}

async function sendInviteEmail(opts: {
  request: NextRequest;
  to: string;
  inviteeName: string;
  inviterName: string;
  tenantName: string;
  companyCode: string;
  token: string;
}) {
  const setupUrl = `${baseUrl(opts.request)}/setup-account?token=${opts.token}`;
  return getResend().emails.send({
    // VERIFIED Resend sender. `admin.pontifexindustries.com` IS verified in Resend
    // (sends to external recipients succeed); the ROOT `pontifexindustries.com` is
    // NOT verified and returns 403 "domain is not verified". Hardcoded on purpose —
    // the RESEND_FROM_EMAIL env var was misconfigured (in Vercel) to the unverified
    // root domain, which silently broke every invite + password-reset email.
    from: 'Pontifex Industries <noreply@admin.pontifexindustries.com>',
    to: opts.to,
    subject: `You're invited to join ${opts.tenantName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f1a; color: #fff; margin: 0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #7c3aed, #4f46e5); border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #fff;">Welcome to ${opts.tenantName}</h1>
      <p style="margin: 12px 0 0; color: rgba(255,255,255,0.8); font-size: 16px;">You've been invited to join the team</p>
    </div>

    <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; margin-bottom: 24px;">
      <p style="margin: 0 0 8px; color: #a78bfa; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Hello, ${opts.inviteeName}</p>
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #fff;">Complete your account setup</h2>
      <p style="margin: 0 0 24px; color: #9ca3af; line-height: 1.6;">
        ${opts.inviterName} has created an account for you on the ${opts.tenantName} operations platform.
        Click the button below to finish setting up your account &mdash; it only takes 2 minutes.
      </p>

      <a href="${setupUrl}" style="display: block; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; text-decoration: none; border-radius: 8px; padding: 14px 28px; text-align: center; font-weight: 600; font-size: 16px; margin-bottom: 16px;">
        Complete Account Setup &rarr;
      </a>

      <p style="margin: 0; color: #6b7280; font-size: 12px; text-align: center;">
        This link expires in 7 days.${opts.companyCode ? ` Company code: <strong style="color: #9ca3af;">${opts.companyCode}</strong>` : ''}
      </p>
    </div>

    <div style="background: #1a1a2e; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 16px; font-size: 14px; color: #a78bfa; text-transform: uppercase; letter-spacing: 0.05em;">What happens next</h3>
      <div style="color: #d1d5db; font-size: 14px; line-height: 2;">
        <div>Add your profile photo</div>
        <div>Create your password</div>
        <div>Review and sign the platform agreement</div>
        <div>Access your dashboard</div>
      </div>
    </div>

    <p style="color: #4b5563; font-size: 12px; text-align: center; line-height: 1.6;">
      If you weren't expecting this invitation, you can safely ignore this email.<br>
      &copy; ${new Date().getFullYear()} ${opts.tenantName} &mdash; Powered by Pontifex Platform
    </p>
  </div>
</body>
</html>`,
  });
}

async function getTenantMeta(tenantId: string) {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('name, company_code')
    .eq('id', tenantId)
    .maybeSingle();
  return {
    tenantName: tenant?.name || 'Pontifex Industries',
    companyCode: tenant?.company_code || '',
  };
}

async function getInviterName(auth: AuthSuccess): Promise<string> {
  const { data: inviterProfile } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .eq('id', auth.userId)
    .maybeSingle();
  return inviterProfile?.full_name || auth.userEmail;
}

// ============================================================
// POST — create / refresh an invitation
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    const body = (await request.json()) as {
      email: string;
      name: string;
      role: string;
      phone_number?: string | null;
      date_of_birth?: string | null;
      adminType?: string | null;
      initialFlags?: Record<string, boolean>;
    };

    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    const role = body.role?.trim();

    if (!email || !name || !role) {
      return NextResponse.json({ error: 'email, name, and role are required' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Unknown role' }, { status: 400 });
    }

    // ── Role-escalation guard ────────────────────────────────────────────────
    // An inviter may only assign a role STRICTLY BELOW their own rank.
    // super_admin is never invitable through this flow.
    if (!canInviteRole(auth.role, role)) {
      return NextResponse.json(
        { error: 'You cannot invite a user to a role at or above your own access level.' },
        { status: 403 }
      );
    }

    // ── B2: cross-tenant takeover guard (seam 1) ─────────────────────────────
    // auth.users is GLOBAL (one row per email platform-wide). If we only checked
    // this tenant, an admin in Tenant B could invite an email that already
    // belongs to a user in Tenant A; `complete` would then find that global auth
    // user, reset its password and flip its tenant/role to B (takeover/DoS).
    // Invites are ONLY for brand-new emails: reject if a profile OR an auth user
    // with this email exists in ANY tenant.
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('email', email) // case-insensitive, any tenant
      .maybeSingle();
    if (existingProfile) {
      return NextResponse.json(
        { error: 'A user with this email already exists.' },
        { status: 409 }
      );
    }

    const { data: authUsersPage } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const emailTakenInAuth = authUsersPage?.users?.some(
      (u) => u.email?.toLowerCase() === email
    );
    if (emailTakenInAuth) {
      return NextResponse.json(
        { error: 'A user with this email already exists.' },
        { status: 409 }
      );
    }

    const { tenantName, companyCode } = await getTenantMeta(tenantId);
    const inviterName = await getInviterName(auth);

    // Re-use an unexpired pending invite for the same email+tenant if present.
    const { data: existingInv } = await supabaseAdmin
      .from('user_invitations')
      .select('id, token, expires_at')
      .eq('tenant_id', tenantId)
      .eq('email', email)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    let token: string;

    if (existingInv) {
      token = existingInv.token;
      // Refresh metadata in case role/name changed; tolerate missing columns.
      const update: Record<string, unknown> = {
        role,
        admin_type: body.adminType ?? null,
        initial_flags: body.initialFlags ?? {},
        invited_name: name,
        phone_number: body.phone_number ?? null,
        date_of_birth: body.date_of_birth ?? null,
      };
      const { error: updErr } = await supabaseAdmin
        .from('user_invitations')
        .update(update)
        .eq('id', existingInv.id);
      if (updErr && updErr.code === '42703') {
        await supabaseAdmin
          .from('user_invitations')
          .update({ role, admin_type: body.adminType ?? null, initial_flags: body.initialFlags ?? {} })
          .eq('id', existingInv.id);
      }
    } else {
      token = newToken();
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
      const { error: insertError } = await insertInvitation({
        tenant_id: tenantId,
        email,
        role,
        admin_type: body.adminType ?? null,
        invited_by: auth.userId,
        invited_name: name,
        phone_number: body.phone_number ?? null,
        date_of_birth: body.date_of_birth ?? null,
        token,
        expires_at: expiresAt,
        initial_flags: body.initialFlags ?? {},
      });
      if (insertError) {
        console.error('[invite] Error inserting invitation:', insertError);
        return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
      }
    }

    const { error: emailError } = await sendInviteEmail({
      request,
      to: email,
      inviteeName: name,
      inviterName,
      tenantName,
      companyCode,
      token,
    });

    if (emailError) {
      // TEMP DIAGNOSTIC (Jun 8): capture the EXACT Resend error + a safe key
      // fingerprint (prefix + length, NEVER the full key) to find why prod fails
      // while the same code + verified domain sends fine locally.
      const k = process.env.RESEND_API_KEY || '';
      console.error('[invite] EMAIL DIAG (POST):', JSON.stringify({
        resendError: emailError,
        keySet: !!process.env.RESEND_API_KEY,
        keyPrefix: k.slice(0, 5),
        keyLen: k.length,
      }));
      const e = emailError as { message?: string; name?: string } | null;
      const msg = (e && (e.message || e.name)) || 'unknown error';
      return NextResponse.json(
        { error: `Email send failed: ${msg}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, data: { email, role } });
  } catch (err) {
    console.error('[invite] POST unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// GET — list invitations for the caller's tenant
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    const { data, error } = await supabaseAdmin
      .from('user_invitations')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[invite] GET error:', error);
      return NextResponse.json({ error: 'Failed to load invitations' }, { status: 500 });
    }

    const nowMs = Date.now();
    const invitations = (data || []).map((inv) => {
      const expired = inv.expires_at ? new Date(inv.expires_at).getTime() < nowMs : false;
      const status: 'accepted' | 'expired' | 'pending' = inv.accepted_at
        ? 'accepted'
        : expired
        ? 'expired'
        : 'pending';
      return {
        id: inv.id,
        email: inv.email,
        name: inv.invited_name ?? null,
        role: inv.role,
        phone_number: inv.phone_number ?? null,
        status,
        invited_at: inv.created_at,
        accepted_at: inv.accepted_at ?? null,
        expires_at: inv.expires_at ?? null,
      };
    });

    return NextResponse.json({ success: true, data: { invitations } });
  } catch (err) {
    console.error('[invite] GET unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// PUT — resend an existing invitation (regenerates expiry, re-emails)
// ============================================================
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    const { id } = (await request.json()) as { id: string };
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { data: inv, error: fetchErr } = await supabaseAdmin
      .from('user_invitations')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId) // tenant isolation: can only resend own-tenant invites
      .maybeSingle();

    if (fetchErr || !inv) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }
    if (inv.accepted_at) {
      return NextResponse.json(
        { error: 'This invitation has already been accepted.' },
        { status: 400 }
      );
    }

    // Re-validate the role still falls below the (possibly different) resender.
    if (!canInviteRole(auth.role, inv.role)) {
      return NextResponse.json(
        { error: 'You cannot resend an invitation for a role at or above your own access level.' },
        { status: 403 }
      );
    }

    // Refresh expiry + token so the link is always single-use & fresh.
    const token = newToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
    const { error: updErr } = await supabaseAdmin
      .from('user_invitations')
      .update({ token, expires_at: expiresAt })
      .eq('id', id);
    if (updErr) {
      console.error('[invite] PUT update error:', updErr);
      return NextResponse.json({ error: 'Failed to refresh invitation' }, { status: 500 });
    }

    const { tenantName, companyCode } = await getTenantMeta(tenantId);
    const inviterName = await getInviterName(auth);

    const { error: emailError } = await sendInviteEmail({
      request,
      to: inv.email,
      inviteeName: inv.invited_name || inv.email,
      inviterName,
      tenantName,
      companyCode,
      token,
    });

    if (emailError) {
      // TEMP DIAGNOSTIC (Jun 8) — see POST handler note.
      const k = process.env.RESEND_API_KEY || '';
      console.error('[invite] EMAIL DIAG (PUT):', JSON.stringify({
        resendError: emailError,
        keySet: !!process.env.RESEND_API_KEY,
        keyPrefix: k.slice(0, 5),
        keyLen: k.length,
      }));
      const e = emailError as { message?: string; name?: string } | null;
      const msg = (e && (e.message || e.name)) || 'unknown error';
      return NextResponse.json({ error: `Email send failed: ${msg}` }, { status: 502 });
    }

    return NextResponse.json({ success: true, data: { id, email: inv.email } });
  } catch (err) {
    console.error('[invite] PUT unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
