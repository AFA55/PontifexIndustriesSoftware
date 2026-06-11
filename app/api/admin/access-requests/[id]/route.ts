export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/access-requests/[id]
 * Approve or deny a public access request.
 *
 *   { action: 'approve', role: '<role>' }  → rank-validated role; flows the
 *       requester into the EXISTING invite/setup-account pipeline (same code
 *       path as a manual invite: CSPRNG token + setup-link email + cross-tenant
 *       takeover guard). Request row → approved + linked to the invitation.
 *   { action: 'deny', reason?: string }    → request row → denied. No email.
 *
 * Auth: requireAdmin. Tenant: resolveTenantScope (non-super-admins pinned to
 * their own tenant); unclaimed rows (tenant_id IS NULL) are claimable and get
 * stamped with the acting admin's tenant.
 *
 * SECURITY: the role comes from the ADMIN's choice and is validated against
 * canInviteRole — never from the requester's submission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, resolveTenantScope } from '@/lib/api-auth';
import { approveAccessRequest, denyAccessRequest } from '@/lib/access-requests';
import { resolveOrigin } from '@/lib/invitations';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;

    const { id } = await params;
    const body = (await request.json()) as {
      action?: string;
      role?: string;
      reason?: string;
    };

    if (body.action === 'approve') {
      const result = await approveAccessRequest({
        requestId: id,
        role: body.role || '',
        tenantId: scope.tenantId,
        origin: resolveOrigin(request.headers.get('origin')),
        approver: { userId: auth.userId, role: auth.role, email: auth.userEmail },
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({ success: true, data: result.data });
    }

    if (body.action === 'deny') {
      const result = await denyAccessRequest({
        requestId: id,
        reason: body.reason ?? null,
        tenantId: scope.tenantId,
        approverUserId: auth.userId,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({ success: true, data: result.data });
    }

    return NextResponse.json(
      { error: "action must be 'approve' or 'deny'" },
      { status: 400 }
    );
  } catch (err) {
    console.error('[admin/access-requests/[id]] PATCH unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
