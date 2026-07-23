/**
 * Shared invitation-creation pipeline.
 *
 * Single source of truth for creating a `user_invitations` row + emailing the
 * setup link. Used by BOTH:
 *   - the manual invite flow   (POST /api/admin/invite)
 *   - the access-request flow  (PATCH /api/admin/access-requests/[id] approve)
 *
 * Email SENDING is injected via a callback so each caller keeps its own
 * template (the manual-invite route owns its inline HTML; the access-request
 * flow uses lib/email's generateInviteEmail). Token, dedupe guards, and DB
 * writes exist exactly once — here.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { canInviteRole, ROLES_WITH_LABELS } from '@/lib/rbac';
import { logAuditEvent } from '@/lib/audit';
import { resolveAppOrigin } from '@/lib/app-url';
import { randomBytes } from 'crypto';

// Re-export for existing consumers; the implementation lives in lib/app-url.ts
// (pure module, safe for client imports — THIS file pulls in supabase-admin).
export { resolveAppOrigin, sanitizeOrigin, PROD_APP_ORIGIN } from '@/lib/app-url';

export const VALID_ROLES = ROLES_WITH_LABELS.map((r) => r.value);

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Cryptographically-secure, unguessable token. This is the ONLY gate on the
 * public setup flow, so it must NOT encode timestamps or the email (which an
 * attacker may know). 32 random bytes = 256 bits of entropy.
 */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Resolve the public origin for setup links (env > request origin > prod).
 * Delegates to the hardened resolver: candidates are trimmed, must parse as a
 * valid http(s) URL, and only the origin is kept (a trailing-whitespace env
 * value once poisoned every emailed invite link — never again).
 */
export function resolveOrigin(requestOrigin?: string | null): string {
  return resolveAppOrigin(requestOrigin);
}

export function buildSetupUrl(origin: string, token: string): string {
  return `${origin}/setup-account?token=${token}`;
}

/**
 * Send OUR branded setup-account invite for an auth user that ALREADY EXISTS
 * (unconfirmed, no password) — the tenant-onboarding path (Platform Hub "add
 * user to tenant" + first-admin creation) creates the auth row first, so it
 * cannot use createOrRefreshInvitation (which rejects existing-auth emails).
 *
 * Before this, that path fell back to supabaseAdmin.auth.admin.inviteUserByEmail
 * — Supabase's OWN email (noreply@mail.app.supabase.io) whose link lands on the
 * homepage, not our /setup-account page (founder Jul 23: created a Patriot ops
 * manager from the hub, invitee got a dead-end homepage link).
 *
 * Writes a user_invitations row (reusing an unexpired pending one) and emails
 * the branded setup link via Resend. Best-effort: returns false on failure so
 * onboarding still succeeds (the admin can resend).
 */
export async function sendSetupInviteForExistingAuthUser(opts: {
  tenantId: string;
  email: string;
  name: string;
  role: string;
  invitedBy?: string | null;
  origin?: string | null;
}): Promise<boolean> {
  try {
    const email = opts.email.trim().toLowerCase();
    const origin = resolveAppOrigin(opts.origin ?? null);

    // Reuse an unexpired pending invite for this email+tenant, else mint one.
    const { data: pending } = await supabaseAdmin
      .from('user_invitations')
      .select('token')
      .eq('tenant_id', opts.tenantId)
      .eq('email', email)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    let token = pending?.[0]?.token as string | undefined;
    if (!token) {
      token = newToken();
      await insertInvitation({
        tenant_id: opts.tenantId,
        email,
        role: opts.role,
        token,
        invited_by: opts.invitedBy ?? null,
        invited_name: opts.name,
        expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
      });
    }

    const setupUrl = buildSetupUrl(origin, token);
    const { tenantName, companyCode } = await getTenantMeta(opts.tenantId);
    const roleLabel = ROLES_WITH_LABELS.find((r) => r.value === opts.role)?.label || opts.role;

    // Lazy server-only imports (keep lib/invitations importable widely).
    const { getResendApiKey, generateInviteEmail, getTenantEmailBranding } = await import('@/lib/email');
    const { Resend } = await import('resend');
    const branding = await getTenantEmailBranding(opts.tenantId);
    const html = await generateInviteEmail({
      inviteeName: opts.name,
      inviterName: 'Pontifex Industries',
      tenantName,
      roleLabel,
      companyCode,
      setupUrl,
      brandColor: branding.brandColor,
      accentColor: branding.accentColor,
      logoUrl: branding.logoUrl,
    });

    const resend = new Resend(getResendApiKey());
    const { error } = await resend.emails.send({
      // VERIFIED sender only (admin.pontifexindustries.com); the root domain 403s.
      from: 'Pontifex Industries <noreply@admin.pontifexindustries.com>',
      to: email,
      subject: `You're invited to join ${tenantName}`,
      html,
    });
    if (error) {
      console.warn('[invitations] branded setup invite email failed:', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('[invitations] sendSetupInviteForExistingAuthUser failed:', err?.message);
    return false;
  }
}

export async function getTenantMeta(tenantId: string) {
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

export async function getInviterName(userId: string, fallback: string): Promise<string> {
  const { data: inviterProfile } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();
  return inviterProfile?.full_name || fallback;
}

/** Best-effort insert that degrades gracefully if optional columns are missing. */
async function insertInvitation(row: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from('user_invitations')
    .insert(row)
    .select('id')
    .single();
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
    return supabaseAdmin.from('user_invitations').insert(base).select('id').single();
  }
  return { data, error };
}

export interface InviteEmailPayload {
  email: string;
  token: string;
  setupUrl: string;
  inviteeName: string;
  inviterName: string;
  tenantName: string;
  companyCode: string;
  role: string;
}

/** Caller-supplied email sender. Return a non-null `error` on failure. */
export type InviteEmailSender = (payload: InviteEmailPayload) => Promise<{ error: unknown }>;

export interface CreateInvitationOpts {
  tenantId: string;
  email: string;
  name: string;
  /** Role chosen by the ADMIN — validated against rank here, never trusted from a requester. */
  role: string;
  inviter: { userId: string; role: string; email: string };
  origin: string;
  phoneNumber?: string | null;
  dateOfBirth?: string | null;
  adminType?: string | null;
  initialFlags?: Record<string, boolean>;
  /**
   * What to do when an unexpired pending invitation already exists for this
   * email + tenant: 'refresh' (manual invite — re-use + re-send) or
   * 'reject' (access-request approve — surface "already invited").
   */
  onExistingPending: 'refresh' | 'reject';
  sendInviteEmail: InviteEmailSender;
}

export type CreateInvitationResult =
  | { ok: true; invitationId: string | null; email: string; role: string; reusedExisting: boolean }
  | { ok: false; status: number; error: string };

export async function createOrRefreshInvitation(
  opts: CreateInvitationOpts
): Promise<CreateInvitationResult> {
  const email = opts.email?.trim().toLowerCase();
  const name = opts.name?.trim();
  const role = opts.role?.trim();

  if (!email || !name || !role) {
    return { ok: false, status: 400, error: 'email, name, and role are required' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, error: 'Please enter a valid email address' };
  }
  if (!VALID_ROLES.includes(role)) {
    return { ok: false, status: 400, error: 'Unknown role' };
  }

  // ── Role-escalation guard ────────────────────────────────────────────────
  // An inviter may only assign a role STRICTLY BELOW their own rank.
  // super_admin is never invitable through this flow.
  if (!canInviteRole(opts.inviter.role, role)) {
    return {
      ok: false,
      status: 403,
      error: 'You cannot invite a user to a role at or above your own access level.',
    };
  }

  // ── Cross-tenant takeover guard ──────────────────────────────────────────
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
    return { ok: false, status: 409, error: 'A user with this email already exists.' };
  }

  // Reliable email → auth uid lookup (RPC) instead of a single-page
  // listUsers({perPage:1000}) scan that silently misses users past page 1.
  const { data: authUidForEmail } = await supabaseAdmin
    .rpc('auth_user_id_by_email', { p_email: email });
  const emailTakenInAuth = !!authUidForEmail;
  if (emailTakenInAuth) {
    return { ok: false, status: 409, error: 'A user with this email already exists.' };
  }

  const { tenantName, companyCode } = await getTenantMeta(opts.tenantId);
  const inviterName = await getInviterName(opts.inviter.userId, opts.inviter.email);

  // Re-use an unexpired pending invite for the same email+tenant if present.
  // NOT .maybeSingle(): historical data contains duplicate pending rows for the
  // same email (pre-pipeline resends), and .maybeSingle() ERRORS on >1 row —
  // which would silently fall through and insert yet another duplicate. Take
  // the newest one instead.
  const { data: existingInvRows, error: lookupError } = await supabaseAdmin
    .from('user_invitations')
    .select('id, token, expires_at')
    .eq('tenant_id', opts.tenantId)
    .eq('email', email)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  if (lookupError) {
    // Don't fall through to INSERT on a transient failure — that's exactly how
    // duplicate pending invitations get created.
    console.error('[invitations] pending-invite lookup failed:', lookupError);
    return { ok: false, status: 500, error: 'Could not check existing invitations. Try again.' };
  }
  const existingInv = existingInvRows?.[0] ?? null;

  let token: string;
  let invitationId: string | null = null;
  let reusedExisting = false;

  if (existingInv) {
    if (opts.onExistingPending === 'reject') {
      return {
        ok: false,
        status: 409,
        error: 'This email has already been invited — check the Invitations list.',
      };
    }
    token = existingInv.token;
    invitationId = existingInv.id;
    reusedExisting = true;
    // Refresh metadata in case role/name changed; tolerate missing columns.
    // Also extend the TTL — re-approving/resending means "get this person in",
    // so the link should get a fresh 7 days, not die on the original clock.
    const update: Record<string, unknown> = {
      role,
      admin_type: opts.adminType ?? null,
      initial_flags: opts.initialFlags ?? {},
      invited_name: name,
      phone_number: opts.phoneNumber ?? null,
      date_of_birth: opts.dateOfBirth ?? null,
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    };
    const { error: updErr } = await supabaseAdmin
      .from('user_invitations')
      .update(update)
      .eq('id', existingInv.id);
    if (updErr && updErr.code === '42703') {
      // Optional columns missing — retry with guaranteed base columns only
      // (expires_at is core schema, keep the TTL extension).
      await supabaseAdmin
        .from('user_invitations')
        .update({
          role,
          admin_type: opts.adminType ?? null,
          initial_flags: opts.initialFlags ?? {},
          expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
        })
        .eq('id', existingInv.id);
    }
  } else {
    token = newToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
    const { data: inserted, error: insertError } = await insertInvitation({
      tenant_id: opts.tenantId,
      email,
      role,
      admin_type: opts.adminType ?? null,
      invited_by: opts.inviter.userId,
      invited_name: name,
      phone_number: opts.phoneNumber ?? null,
      date_of_birth: opts.dateOfBirth ?? null,
      token,
      expires_at: expiresAt,
      initial_flags: opts.initialFlags ?? {},
    });
    if (insertError) {
      console.error('[invitations] Error inserting invitation:', insertError);
      return { ok: false, status: 500, error: 'Failed to create invitation' };
    }
    invitationId = inserted?.id ?? null;
  }

  // Belt-and-braces: re-sanitize the caller-supplied origin so a bad value can
  // never reach an email even if a caller bypasses resolveOrigin().
  const setupOrigin = resolveAppOrigin(opts.origin);

  const { error: emailError } = await opts.sendInviteEmail({
    email,
    token,
    setupUrl: buildSetupUrl(setupOrigin, token),
    inviteeName: name,
    inviterName,
    tenantName,
    companyCode,
    role,
  });

  if (emailError) {
    console.error('[invitations] invite email error:', emailError);
    return {
      ok: false,
      status: 502,
      error: 'Invitation saved but the email failed to send. Try Resend.',
    };
  }

  // Observability (fire-and-forget): record exactly which origin the setup
  // link was built with — NEVER the token — so "what link did they actually
  // get?" is answerable from audit_logs next time an emailed link misbehaves.
  logAuditEvent({
    userId: opts.inviter.userId,
    userEmail: opts.inviter.email,
    userRole: opts.inviter.role,
    action: 'invite_email_sent',
    resourceType: 'user_invitation',
    resourceId: invitationId ?? undefined,
    details: {
      email,
      invitationId,
      setupUrlOrigin: setupOrigin,
      role,
      tenantId: opts.tenantId,
      reusedExisting,
    },
  });

  return { ok: true, invitationId, email, role, reusedExisting };
}
