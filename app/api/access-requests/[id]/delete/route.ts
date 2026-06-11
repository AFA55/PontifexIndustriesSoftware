export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/access-requests/[id]/delete
 * Permanently deletes an access request.
 *
 * SECURITY HISTORY (guardian, Jun 11 2026): this route used to cascade-delete
 * the PROFILE (matched by email, NO tenant filter) and the GLOBAL auth user
 * whenever the request was 'approved'. That was built for the old
 * direct-account-creation flow and became a cross-tenant deletion primitive:
 * tenant X deleting its stale approved request could destroy a user who had
 * legitimately onboarded into tenant Y under the same email. The cascade is
 * REMOVED — approval now only ever creates a user_invitations row, so the
 * correct cleanup is to REVOKE the unaccepted invitation (otherwise deleting
 * an approved request would leave a live setup link = revocation bypass).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Security: only admins can delete access requests
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;
    const tenantId = await getTenantId(auth.userId);

    const { id: requestId } = await params;

    if (!requestId) {
      return NextResponse.json(
        { error: 'Request ID is required' },
        { status: 400 }
      );
    }

    // Fetch the request (tenant-scoped; unclaimed rows have tenant_id IS NULL —
    // the public form sets no tenant). Select the linked invitation so we can
    // revoke its setup token below.
    let delFetch = supabaseAdmin
      .from('access_requests')
      .select('email, status, tenant_id, invitation_id')
      .eq('id', requestId);
    if (tenantId) delFetch = delFetch.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    const { data: accessRequest, error: fetchError } = await delFetch.single();

    if (fetchError || !accessRequest) {
      return NextResponse.json(
        { error: 'Access request not found' },
        { status: 404 }
      );
    }

    // If the request was approved, REVOKE the unaccepted invitation it produced
    // so the emailed setup link stops working. Deleting the request is an
    // admin's "undo" — it must actually revoke access. We only ever touch
    // UNACCEPTED invitations (accepted_at IS NULL): once someone has onboarded,
    // removing them is account deactivation, a separate, deliberate flow.
    if (accessRequest.status === 'approved') {
      const invTenant = accessRequest.tenant_id ?? tenantId;
      try {
        if (accessRequest.invitation_id) {
          await supabaseAdmin
            .from('user_invitations')
            .delete()
            .eq('id', accessRequest.invitation_id)
            .is('accepted_at', null);
        } else if (invTenant) {
          // Pre-migration rows have no invitation_id link — fall back to
          // email + tenant, still unaccepted-only.
          await supabaseAdmin
            .from('user_invitations')
            .delete()
            .eq('email', (accessRequest.email || '').toLowerCase())
            .eq('tenant_id', invTenant)
            .is('accepted_at', null);
        }
      } catch (revokeError) {
        // Revocation failure must not be silent — the setup link would stay live.
        console.error('[access-requests/delete] invitation revoke failed:', revokeError);
        return NextResponse.json(
          { error: 'Could not revoke the pending invitation. Request not deleted — try again.' },
          { status: 500 }
        );
      }
    }

    // Delete the access request row itself (re-assert tenant scope).
    let del = supabaseAdmin.from('access_requests').delete().eq('id', requestId);
    if (tenantId) del = del.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    const { error: deleteError } = await del;

    if (deleteError) {
      console.error('[access-requests/delete] delete failed:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete request' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Access request deleted and any pending invitation revoked.',
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('[access-requests/delete] unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
