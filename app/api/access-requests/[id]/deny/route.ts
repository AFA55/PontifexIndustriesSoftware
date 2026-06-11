export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/access-requests/[id]/deny   (legacy — Team Management)
 * Deny an access request with a reason. Delegates to the same shared logic as
 * the canonical PATCH /api/admin/access-requests/[id] endpoint.
 *
 * Audit identity is the authenticated caller (the legacy `reviewedBy` body
 * field is ignored — it was client-spoofable).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, resolveTenantScope } from '@/lib/api-auth';
import { denyAccessRequest } from '@/lib/access-requests';

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
    const body = (await request.json()) as { denialReason?: string };

    // Legacy contract: the Team Management UI requires a reason.
    if (!body.denialReason || body.denialReason.trim() === '') {
      return NextResponse.json({ error: 'Denial reason is required' }, { status: 400 });
    }

    const result = await denyAccessRequest({
      requestId: id,
      reason: body.denialReason,
      tenantId: scope.tenantId,
      approverUserId: auth.userId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: `Access request denied for ${result.data.email as string}`,
      data: result.data,
    });
  } catch (error) {
    console.error('[deny] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
