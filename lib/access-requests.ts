/**
 * Access-request approval/denial — shared by:
 *   - PATCH /api/admin/access-requests/[id]   (new canonical endpoint, invite-page tab)
 *   - POST  /api/access-requests/[id]/approve (legacy endpoint used by Team Management)
 *   - POST  /api/access-requests/[id]/deny    (legacy endpoint used by Team Management)
 *
 * Approval flows the requester into the EXISTING invite/setup-account pipeline
 * via createOrRefreshInvitation — it never creates an account directly. The
 * role is the ADMIN's choice, validated against the rank guard server-side;
 * nothing from the requester's submission can influence it.
 *
 * Tenant model: the public request form has no tenant context, so rows arrive
 * with tenant_id = NULL ("unclaimed"). Admin queries therefore match
 * (tenant_id = caller's tenant OR tenant_id IS NULL), and the acting admin's
 * tenant is stamped onto the row at approve/deny time.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  createOrRefreshInvitation,
  VALID_ROLES,
  type InviteEmailPayload,
} from '@/lib/invitations';
import { sendEmail, generateInviteEmail } from '@/lib/email';
import { canInviteRole, getRoleLabel } from '@/lib/rbac';

/** Safe columns — NEVER expose password_hash / password_reset_token to clients. */
export const ACCESS_REQUEST_SELECT =
  'id, full_name, email, phone_number, date_of_birth, position, status, assigned_role, denial_reason, reviewed_by, reviewed_at, created_at, tenant_id';

/** `.or()` filter: rows claimed by this tenant OR still unclaimed (NULL). */
export function tenantOrUnclaimedFilter(tenantId: string): string {
  return `tenant_id.eq.${tenantId},tenant_id.is.null`;
}

export type AccessRequestActionResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string };

/** Email sender for approvals — calls the existing lib/email invite template. */
const approvalInviteEmailSender = async (p: InviteEmailPayload): Promise<{ error: unknown }> => {
  const html = generateInviteEmail({
    inviteeName: p.inviteeName,
    inviterName: p.inviterName,
    tenantName: p.tenantName,
    roleLabel: getRoleLabel(p.role),
    companyCode: p.companyCode,
    setupUrl: p.setupUrl,
  });
  const sent = await sendEmail({
    to: p.email,
    subject: `You're invited to join ${p.tenantName}`,
    html,
  });
  return { error: sent ? null : new Error('Invite email failed to send') };
};

async function fetchPendingRequest(requestId: string, tenantId: string) {
  const { data: req, error } = await supabaseAdmin
    .from('access_requests')
    .select(ACCESS_REQUEST_SELECT)
    .eq('id', requestId)
    .or(tenantOrUnclaimedFilter(tenantId))
    .maybeSingle();
  if (error || !req) {
    return { req: null, fail: { ok: false as const, status: 404, error: 'Access request not found' } };
  }
  if (req.status !== 'pending') {
    return {
      req: null,
      fail: { ok: false as const, status: 400, error: `This request has already been ${req.status}` },
    };
  }
  return { req, fail: null };
}

export async function approveAccessRequest(opts: {
  requestId: string;
  /** Role chosen by the acting admin (server-validated by rank). */
  role: string;
  tenantId: string;
  origin: string;
  approver: { userId: string; role: string; email: string };
}): Promise<AccessRequestActionResult> {
  const role = opts.role?.trim();
  if (!role || !VALID_ROLES.includes(role)) {
    return { ok: false, status: 400, error: 'A valid role is required to approve a request.' };
  }
  if (!canInviteRole(opts.approver.role, role)) {
    return {
      ok: false,
      status: 403,
      error: 'You cannot grant a role at or above your own access level.',
    };
  }

  const { req, fail } = await fetchPendingRequest(opts.requestId, opts.tenantId);
  if (fail) return fail;

  // ── Claim the row first (race guard: only one admin can flip pending→approved).
  // If the invitation step fails afterwards we revert to pending.
  const claim = {
    status: 'approved',
    reviewed_by: opts.approver.userId,
    reviewed_at: new Date().toISOString(),
    assigned_role: role,
    tenant_id: opts.tenantId,
  };
  let { data: claimed, error: claimErr } = await supabaseAdmin
    .from('access_requests')
    .update(claim)
    .eq('id', opts.requestId)
    .eq('status', 'pending')
    .select('id');
  if (claimErr && claimErr.code === '23514') {
    // assigned_role CHECK constraint not yet widened (migration pending) —
    // record the role on the invitation only.
    const { assigned_role: _drop, ...withoutRole } = claim;
    ({ data: claimed, error: claimErr } = await supabaseAdmin
      .from('access_requests')
      .update(withoutRole)
      .eq('id', opts.requestId)
      .eq('status', 'pending')
      .select('id'));
  }
  if (claimErr) {
    console.error('[access-requests] approve claim error:', claimErr);
    return { ok: false, status: 500, error: 'Failed to update the access request.' };
  }
  if (!claimed || claimed.length === 0) {
    return { ok: false, status: 409, error: 'This request was already processed.' };
  }

  // ── Same code path as a manual invite (token, dedupe guards, setup email).
  const result = await createOrRefreshInvitation({
    tenantId: opts.tenantId,
    email: req.email,
    name: req.full_name,
    role,
    inviter: opts.approver,
    origin: opts.origin,
    phoneNumber: req.phone_number ?? null,
    dateOfBirth: req.date_of_birth ?? null,
    onExistingPending: 'reject',
    sendInviteEmail: approvalInviteEmailSender,
  });

  if (!result.ok) {
    // Revert the claim so the request stays actionable.
    await supabaseAdmin
      .from('access_requests')
      .update({
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        assigned_role: null,
        tenant_id: req.tenant_id, // restore original (possibly NULL)
      })
      .eq('id', opts.requestId);
    return { ok: false, status: result.status, error: result.error };
  }

  // Best-effort link to the invitation (column added by 20260611 migration).
  if (result.invitationId) {
    const { error: linkErr } = await supabaseAdmin
      .from('access_requests')
      .update({ invitation_id: result.invitationId })
      .eq('id', opts.requestId);
    if (linkErr && linkErr.code !== '42703') {
      console.error('[access-requests] invitation link error:', linkErr);
    }
  }

  return {
    ok: true,
    data: {
      id: opts.requestId,
      email: result.email,
      role: result.role,
      invitationId: result.invitationId,
      status: 'approved',
    },
  };
}

export async function denyAccessRequest(opts: {
  requestId: string;
  reason?: string | null;
  tenantId: string;
  approverUserId: string;
}): Promise<AccessRequestActionResult> {
  const { req, fail } = await fetchPendingRequest(opts.requestId, opts.tenantId);
  if (fail) return fail;

  const reason = opts.reason?.trim().slice(0, 500) || null;

  const { data: denied, error: updateError } = await supabaseAdmin
    .from('access_requests')
    .update({
      status: 'denied',
      reviewed_by: opts.approverUserId,
      reviewed_at: new Date().toISOString(),
      denial_reason: reason,
      tenant_id: opts.tenantId,
    })
    .eq('id', opts.requestId)
    .eq('status', 'pending')
    .select('id');

  if (updateError) {
    console.error('[access-requests] deny error:', updateError);
    return { ok: false, status: 500, error: 'Failed to deny the access request.' };
  }
  // Race guard: another admin approved/denied this request between our fetch
  // and the update — without this check the loser would see a fake "denied"
  // success while an invite email may already be on its way.
  if (!denied || denied.length === 0) {
    return {
      ok: false,
      status: 409,
      error: 'This request was already handled by another admin. Refresh to see its current status.',
    };
  }

  // No rejection email template exists; denial is silent by design.
  return {
    ok: true,
    data: { id: opts.requestId, email: req.email, status: 'denied', denialReason: reason },
  };
}
