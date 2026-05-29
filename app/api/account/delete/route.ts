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
 * Deletion strategy = full anonymization + permanent login lockout (NOT row
 * deletion). ~30 tables reference auth.users(id) — some NO ACTION (a hard delete
 * would be blocked for any real operator) and some CASCADE (e.g. timecards —
 * a hard delete would destroy payroll records that must be retained by law).
 * So we instead irreversibly remove all personal data and disable the account:
 *
 *   1. close_account(userId) [DB function, migration 20260529]: anonymizes the
 *      profile (strips all PII, sets deleted_at + active=false), purges
 *      purely-personal records (notifications, push tokens, pending access
 *      requests), and revokes all auth sessions. Legally-required records
 *      (payroll/timecards/invoices) are retained de-identified — what our
 *      privacy policy promises and what Apple permits for record retention.
 *   2. Anonymize + permanently ban the Supabase Auth identity: tombstone email,
 *      random unknowable password, cleared metadata, 100-year ban. The person
 *      can never sign in again and no auth PII remains.
 *
 * Net effect to the user and to Apple: the account is deleted (no login, no
 * personal data). The client logs the user out and redirects on success.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
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

    // --- Step 1: anonymize profile + purge personal data (atomic) -------------
    const { error: closeError } = await supabaseAdmin.rpc('close_account', { p_user_id: userId });
    if (closeError) {
      console.error('[account/delete] close_account failed:', closeError.message);
      logApiError({ endpoint: '/api/account/delete', method: 'POST', error: new Error(closeError.message), request });
      return NextResponse.json(
        { error: 'Failed to delete account. Please contact support@pontifexindustries.com.' },
        { status: 500 }
      );
    }

    // --- Step 2: anonymize + permanently ban the auth identity ----------------
    // (Not deleteUser — that would be blocked by NO ACTION FKs or destroy
    //  CASCADE-linked payroll records. This removes auth PII + locks out login.)
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: `deleted+${userId}@deleted.invalid`,
      password: `${randomUUID()}${randomUUID()}`,
      user_metadata: {},
      app_metadata: { account_deleted: true, deleted_at: new Date().toISOString() },
      ban_duration: '876000h', // ~100 years — permanent lockout
    });
    if (authError) {
      console.error('[account/delete] auth anonymize/ban failed:', authError.message);
      logApiError({ endpoint: '/api/account/delete', method: 'POST', error: new Error(authError.message), request });
      return NextResponse.json(
        { error: 'Failed to delete account. Please contact support@pontifexindustries.com.' },
        { status: 500 }
      );
    }

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
