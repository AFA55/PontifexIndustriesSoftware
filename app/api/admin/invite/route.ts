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
import { requireAdmin, resolveTenantScope } from '@/lib/api-auth';
import { sendSMSAny } from '@/lib/sms';
import { formatPhoneNumber } from '@/lib/sms';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { canInviteRole, ROLES_WITH_LABELS } from '@/lib/rbac';
import { Resend } from 'resend';
import { getResendApiKey, generateInviteEmail, getTenantEmailBranding } from '@/lib/email';
import {
  createOrRefreshInvitation,
  getTenantMeta,
  getInviterName,
  newToken,
  INVITE_TTL_MS,
  resolveOrigin,
} from '@/lib/invitations';
import { logAuditEvent } from '@/lib/audit';

const getResend = () => new Resend(getResendApiKey() || 're_placeholder');

/**
 * Hardened origin resolution (lib/app-url via resolveOrigin): trims, validates
 * as http(s), keeps only the origin. A whitespace-polluted NEXT_PUBLIC_APP_URL
 * once broke every invite link sent from this route.
 */
function baseUrl(request: NextRequest): string {
  return resolveOrigin(request.headers.get('origin'));
}

async function sendInviteEmail(opts: {
  request: NextRequest;
  to: string;
  inviteeName: string;
  inviterName: string;
  tenantName: string;
  companyCode: string;
  role: string;
  token: string;
  /** Recipient tenant — drives white-label email colors/logo. */
  tenantId: string;
}) {
  const setupUrl = `${baseUrl(opts.request)}/setup-account?token=${opts.token}`;
  const roleLabel =
    ROLES_WITH_LABELS.find((r) => r.value === opts.role)?.label || opts.role;
  // White-label: brand the invite email with the recipient tenant's colors/logo.
  const branding = await getTenantEmailBranding(opts.tenantId);
  return getResend().emails.send({
    // VERIFIED Resend sender. `admin.pontifexindustries.com` IS verified in Resend
    // (sends to external recipients succeed); the ROOT `pontifexindustries.com` is
    // NOT verified and returns 403 "domain is not verified". Hardcoded on purpose —
    // the RESEND_FROM_EMAIL env var was misconfigured (in Vercel) to the unverified
    // root domain, which silently broke every invite + password-reset email.
    from: 'Pontifex Industries <noreply@admin.pontifexindustries.com>',
    to: opts.to,
    subject: `You're invited to join ${opts.tenantName}`,
    html: await generateInviteEmail({
      inviteeName: opts.inviteeName,
      inviterName: opts.inviterName,
      tenantName: opts.tenantName,
      roleLabel,
      companyCode: opts.companyCode,
      setupUrl,
      brandColor: branding.brandColor,
      accentColor: branding.accentColor,
      logoUrl: branding.logoUrl,
    }),
  });
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

    // All validation (email format, role, rank guard), the cross-tenant
    // takeover guard, token generation, and the user_invitations write live in
    // the shared pipeline — also used by access-request approvals.
    const result = await createOrRefreshInvitation({
      tenantId,
      email: body.email ?? '',
      name: body.name ?? '',
      role: body.role ?? '',
      inviter: { userId: auth.userId, role: auth.role, email: auth.userEmail },
      origin: baseUrl(request),
      phoneNumber: body.phone_number ?? null,
      dateOfBirth: body.date_of_birth ?? null,
      adminType: body.adminType ?? null,
      initialFlags: body.initialFlags ?? {},
      onExistingPending: 'refresh', // manual invite: re-use + re-send
      sendInviteEmail: async (p) => {
        const { error } = await sendInviteEmail({
          request,
          to: p.email,
          inviteeName: p.inviteeName,
          inviterName: p.inviterName,
          tenantName: p.tenantName,
          companyCode: p.companyCode,
          role: p.role,
          token: p.token,
          tenantId,
        });
        // SMS invitation too (founder Jul 12 — toll-free approved): when a
        // phone was provided, text the same setup link. Best-effort: an SMS
        // failure never fails the invite (email is the primary channel).
        const phone = body.phone_number ? formatPhoneNumber(String(body.phone_number)) : null;
        if (!error && phone) {
          const setupUrl = `${baseUrl(request)}/setup-account?token=${p.token}`;
          Promise.resolve(
            sendSMSAny({
              to: phone,
              message: `${p.tenantName}: ${p.inviterName} invited you to join the team. Set up your account: ${setupUrl}`,
              tenantId,
              source: 'team_invite_sms',
            })
          ).then(() => {}).catch(() => {});
        }
        return { error: error ?? null };
      },
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, data: { email: result.email, role: result.role } });
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
    const inviterName = await getInviterName(auth.userId, auth.userEmail);

    const { error: emailError } = await sendInviteEmail({
      request,
      to: inv.email,
      inviteeName: inv.invited_name || inv.email,
      inviterName,
      tenantName,
      companyCode,
      role: inv.role,
      token,
      tenantId,
    });

    if (emailError) {
      console.error('[invite] PUT resend email error:', emailError);
      return NextResponse.json({ error: 'Failed to send invitation email' }, { status: 502 });
    }

    // Observability (fire-and-forget): which origin did the resent link use?
    // (origin only — NEVER the token)
    logAuditEvent({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: 'invite_email_sent',
      resourceType: 'user_invitation',
      resourceId: id,
      details: {
        email: inv.email,
        invitationId: id,
        setupUrlOrigin: baseUrl(request),
        role: inv.role,
        tenantId,
        resend: true,
      },
      request,
    });

    return NextResponse.json({ success: true, data: { id, email: inv.email } });
  } catch (err) {
    console.error('[invite] PUT unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
