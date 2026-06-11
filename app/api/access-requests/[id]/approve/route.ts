export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/access-requests/[id]/approve   (legacy — Team Management)
 *
 * Approve an access request. Delegates to the SAME pipeline as the canonical
 * PATCH /api/admin/access-requests/[id] endpoint: the requester is flowed into
 * the existing invite/setup-account flow (CSPRNG token + setup-link email).
 *
 * The previous implementation created the auth user + profile DIRECTLY with a
 * random temp password that was never emailed (the generated recovery link was
 * discarded) and a profile missing tenant_id — approved users could never log
 * in. It is replaced wholesale by the invite pipeline.
 *
 * Auth: requireAdmin. Role comes from the admin's choice, server-validated by
 * rank (canInviteRole) — `reviewedBy` and `card_permissions` in the legacy body
 * are ignored (audit identity is the authenticated caller; card permissions
 * are granted after onboarding via Team Management).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, resolveTenantScope } from '@/lib/api-auth';
import { approveAccessRequest } from '@/lib/access-requests';
import { resolveOrigin } from '@/lib/invitations';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;

    const { id } = await params;
    const body = (await request.json()) as { role?: string };

    const result = await approveAccessRequest({
      requestId: id,
      role: body.role || '',
      tenantId: scope.tenantId,
      origin: resolveOrigin(request.headers.get('origin')),
      approver: { userId: auth.userId, role: auth.role, email: auth.userEmail },
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: `Access approved! A setup-link invitation was emailed to ${result.data.email as string}.`,
      data: result.data,
    });
  } catch (error) {
    console.error('[approve] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
