export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/account/delete
 *
 * Self-service account deletion — required by App Store Guideline 5.1.1(v)
 * ("If your app supports account creation, you must also offer account deletion
 * within the app."). Self-registration exists via /request-access, so this is
 * mandatory for the iOS app.
 *
 * The caller can ONLY delete their OWN account: the target is always
 * `auth.userId` from the verified Bearer token — never an id from the body.
 * That also makes it tenant-safe (a user can only ever reach their own record).
 *
 * Deletion strategy (mirrors the proven admin cleanup in
 * /api/access-requests/[id]/delete):
 *   1. Delete the profiles row. If a foreign-key constraint blocks the delete
 *      (business records like timecards/job logs may reference the profile),
 *      fall back to scrubbing all personal data (PII) and deactivating — so the
 *      personal data is removed even when the row must survive for referential
 *      integrity. Deactivation-only is NOT acceptable to Apple, hence the scrub.
 *   2. Delete the Supabase Auth user (removes credentials + identity). This is
 *      the operative "account no longer exists / cannot sign in" step.
 *
 * The client logs the user out and redirects after a success response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit';
import { logApiError } from '@/lib/error-logger';

export async function POST(request: NextRequest) {
  try {
    // Self-scoped: any authenticated user may delete their own account.
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const userId = auth.userId;
    const userEmail = auth.userEmail;

    // --- Step 1: remove the profile / personal data ---------------------------
    const { error: deleteProfileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (deleteProfileError) {
      // FK constraint (business records reference this profile) — scrub PII
      // instead so no personal data remains, then deactivate.
      console.warn('[account/delete] profile delete blocked, scrubbing PII:', deleteProfileError.message);
      await supabaseAdmin
        .from('profiles')
        .update({
          full_name: 'Deleted User',
          nickname: null,
          phone: null,
          phone_number: null,
          date_of_birth: null,
          profile_picture_url: null,
          emergency_contact_name: null,
          emergency_contact_phone: null,
          emergency_contact_relationship: null,
          active: false,
        })
        .eq('id', userId);
    }

    // --- Step 2: delete the auth user (credentials + identity) ----------------
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error('[account/delete] auth user delete failed:', deleteAuthError.message);
      logApiError({ endpoint: '/api/account/delete', method: 'POST', error: new Error(deleteAuthError.message), request });
      return NextResponse.json(
        { error: 'Failed to delete account. Please contact support@pontifexindustries.com.' },
        { status: 500 }
      );
    }

    // --- Fire-and-forget cleanup of dependent personal records ----------------
    if (userEmail) {
      Promise.resolve(
        supabaseAdmin.from('access_requests').delete().eq('email', userEmail.toLowerCase())
      ).then(() => {}).catch(() => {});
    }
    Promise.resolve(
      supabaseAdmin.from('push_tokens').delete().eq('user_id', userId)
    ).then(() => {}).catch(() => {});

    // Audit log (fire-and-forget inside the helper).
    logAuditEvent({
      userId,
      userEmail,
      userRole: auth.role,
      action: 'delete',
      resourceType: 'profile',
      resourceId: userId,
      details: { selfDeletion: true },
      request,
    });

    return NextResponse.json(
      { success: true, message: 'Your account and personal data have been deleted.' },
      { status: 200 }
    );
  } catch (error) {
    console.error('[account/delete] unexpected error:', error);
    logApiError({ endpoint: '/api/account/delete', method: 'POST', error: error as Error, request });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
