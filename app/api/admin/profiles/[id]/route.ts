export const dynamic = 'force-dynamic';

/**
 * API Route: GET/PATCH /api/admin/profiles/[id]
 * Get or update a single operator/helper profile. Includes project history.
 * Access: admin, super_admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, ADMIN_ROLES } from '@/lib/api-auth';
import { getRoleRank } from '@/lib/rbac';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET: Single profile with project history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    if (id !== auth.userId && !ADMIN_ROLES.includes(auth.role as typeof ADMIN_ROLES[number])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, nickname, email, phone, phone_number, date_of_birth, hire_date, next_review_date, role, active, profile_picture_url, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, created_at, tenant_id')
      .eq('id', id)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Tenant isolation: a non-super-admin may only view profiles in their own tenant
    // (or their own profile). super_admin may view any tenant.
    if (id !== auth.userId && auth.role !== 'super_admin' && profile.tenant_id !== auth.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch project history — jobs where this person was operator or helper
    const { data: jobHistory } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, job_type, location, status, scheduled_date, end_date, work_completed_at')
      .or(`assigned_to.eq.${id},helper_assigned_to.eq.${id}`)
      .is('deleted_at', null)
      .order('scheduled_date', { ascending: false })
      .limit(50);

    return NextResponse.json({
      success: true,
      data: {
        ...profile,
        project_history: jobHistory || [],
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/profiles/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: Update profile fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const isAdmin = ADMIN_ROLES.includes(auth.role as typeof ADMIN_ROLES[number]);
    if (id !== auth.userId && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Resolve the target to enforce tenant isolation + role-grant caps before updating.
    const { data: target } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id, role, email')
      .eq('id', id)
      .single();
    if (!target) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    // Non-super-admin may only edit profiles within their own tenant (or themselves).
    if (id !== auth.userId && auth.role !== 'super_admin' && target.tenant_id !== auth.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Only super_admin may grant the super_admin role or edit an existing super_admin.
    if (
      auth.role !== 'super_admin' &&
      (body.role === 'super_admin' || target.role === 'super_admin')
    ) {
      return NextResponse.json({ error: 'Forbidden: insufficient privilege for super_admin role' }, { status: 403 });
    }

    // ── Email change handling (login identity — auth-sensitive) ───────────────
    // When the PATCH body includes `email`, enforce management authZ + tenant +
    // rank guards, global uniqueness, then sync auth.users FIRST and profiles
    // SECOND. We resolve the new email up-front so we can apply the auth update
    // AFTER the profiles update below (auth first, profiles second per spec).
    let emailChange: { newEmail: string } | null = null;
    if (body.email !== undefined && body.email !== null) {
      const isManagement = ADMIN_ROLES.includes(auth.role);
      // 1. AuthZ: only admin / operations_manager / super_admin may change ANY email.
      if (!isManagement) {
        return NextResponse.json(
          { error: 'Forbidden: you cannot change a login email.' },
          { status: 403 }
        );
      }

      // 3. Rank guard: a caller may not edit the email of a profile whose role
      //    outranks OR EQUALS theirs — unless they are super_admin, or it's their
      //    own profile. (Tenant isolation already enforced above.)
      const isSelf = id === auth.userId;
      if (auth.role !== 'super_admin' && !isSelf) {
        if (getRoleRank(target.role) >= getRoleRank(auth.role)) {
          return NextResponse.json(
            { error: 'Forbidden: you cannot change the email of a user at or above your access level.' },
            { status: 403 }
          );
        }
      }

      // 4. Normalize + validate.
      const newEmail = String(body.email).trim().toLowerCase();
      if (!EMAIL_RE.test(newEmail)) {
        return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
      }

      const currentEmail = (target.email || '').trim().toLowerCase();
      if (newEmail !== currentEmail) {
        // 5. Global uniqueness — auth.users is GLOBAL (one row per email
        //    platform-wide). Reject if ANY other profile OR auth user (in ANY
        //    tenant) already uses this email. Mirrors the invite cross-tenant guard.
        const { data: clashProfile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .ilike('email', newEmail)
          .neq('id', id)
          .maybeSingle();
        if (clashProfile) {
          return NextResponse.json(
            { error: 'A user with this email already exists.' },
            { status: 409 }
          );
        }
        // Reliable email → auth uid lookup (RPC) instead of a single-page
        // listUsers({perPage:1000}) scan that silently misses users past page 1.
        const { data: authUidForEmail } = await supabaseAdmin
          .rpc('auth_user_id_by_email', { p_email: newEmail });
        const emailTakenInAuth = !!authUidForEmail && authUidForEmail !== id;
        if (emailTakenInAuth) {
          return NextResponse.json(
            { error: 'A user with this email already exists.' },
            { status: 409 }
          );
        }
        emailChange = { newEmail };
      }
      // If unchanged, fall through and let it be a no-op (stripped below).
    }

    // Non-admins editing their own profile cannot change role or active status.
    // NOTE: `email` is deliberately EXCLUDED from this generic field loop. It is
    // the login identity and is handled exclusively via the `emailChange` path
    // above (management-only, rank-guarded, globally-unique, auth.users-synced).
    // Letting it through here would desync auth.users ↔ profiles.
    const selfOnlyFields = [
      'full_name', 'nickname', 'phone', 'phone_number',
      'date_of_birth', 'profile_picture_url',
      'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
    ];
    const adminOnlyFields = ['hire_date', 'next_review_date', 'role', 'active'];
    const allowedFields = isAdmin
      ? [...selfOnlyFields, ...adminOnlyFields]
      : selfOnlyFields;

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // ── Sync auth.users FIRST when the email is changing ──────────────────────
    // Update the auth identity before touching profiles so (a) login works with
    // the new email and (b) no confirmation email is sent (email_confirm: true).
    // If this fails, we DO NOT touch the profile and return the error.
    if (emailChange) {
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
        email: emailChange.newEmail,
        email_confirm: true,
      });
      if (authErr) {
        console.error('[profiles PATCH] auth.users email update failed (profile untouched):', authErr);
        return NextResponse.json(
          { error: 'Failed to update login email. No changes were saved.' },
          { status: 500 }
        );
      }
      // Auth update succeeded — mirror into profiles.email below.
      updateData.email = emailChange.newEmail;
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      // If we already moved the auth email but the profile write failed, the two
      // stores are desynced. Log loudly and attempt to revert auth.users back to
      // the prior email so login + records stay consistent.
      if (emailChange) {
        const priorEmail = (target.email || '').trim().toLowerCase();
        console.error(
          `[profiles PATCH] DESYNC: auth.users email for ${id} was changed to ` +
          `"${emailChange.newEmail}" but profiles update FAILED. Attempting auth revert to "${priorEmail}".`
        );
        if (priorEmail) {
          const { error: revertErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
            email: priorEmail,
            email_confirm: true,
          });
          if (revertErr) {
            console.error(
              `[profiles PATCH] CRITICAL: failed to revert auth.users email for ${id}. ` +
              `auth="${emailChange.newEmail}" profiles="${priorEmail}" are now DESYNCED. Manual fix required.`,
              revertErr
            );
          }
        }
        return NextResponse.json(
          { error: 'Failed to update profile. Login email change was rolled back.' },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/admin/profiles/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Permanently remove a user AND FREE THEIR EMAIL for re-use.
//
// We do NOT hard-delete the auth/profile rows — users carry FK history
// (timecards, jobs, equipment, inventory) that a hard delete would either break
// or orphan. Instead we:
//   1. Release the LOGIN EMAIL — rename auth.users.email (and mirror in profiles)
//      to a dead sentinel `deleted+<id>@pontifex.invalid`, so the original email
//      is immediately reusable for a fresh invite / access request. This is the
//      fix for "deleted a user but the email still says already-exists".
//   2. Soft-delete the profile — deleted_at + active=false — so it drops out of
//      Team Profiles and every `deleted_at IS NULL` query, while history stays.
//
// Management only; tenant- + rank-guarded; cannot delete yourself or a user at
// or above your own access level (only super_admin can remove a super_admin).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    if (!ADMIN_ROLES.includes(auth.role as typeof ADMIN_ROLES[number])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (id === auth.userId) {
      return NextResponse.json({ error: "You can't remove your own account." }, { status: 400 });
    }

    const { data: target } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id, role, email, full_name')
      .eq('id', id)
      .single();
    if (!target) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    // Tenant isolation (super_admin may cross tenants).
    if (auth.role !== 'super_admin' && target.tenant_id !== auth.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Rank guard: can't remove a peer/superior; only super_admin removes super_admin.
    if (
      auth.role !== 'super_admin' &&
      (target.role === 'super_admin' || getRoleRank(target.role) >= getRoleRank(auth.role))
    ) {
      return NextResponse.json(
        { error: 'Forbidden: you cannot remove a user at or above your access level.' },
        { status: 403 }
      );
    }

    // Capture the original email up front — used for the invite/access-request
    // cleanup at the end (it gets overwritten on the rows below).
    const originalEmail = (target.email || '').trim().toLowerCase();

    // Single dead-sentinel address used at BOTH layers (auth + profile). Matches
    // the address close_account() writes (`deleted+<id>@deleted.invalid`) so the
    // two stores end consistent and the original email is freed everywhere.
    const freedEmail = `deleted+${id}@deleted.invalid`;

    // 1. Anonymize PII + revoke sessions + purge personal rows via the reusable
    //    close_account() RPC (service-role only). Best-effort: if it errors we log
    //    and continue (the email-freeing rename+ban below MUST still run), but we
    //    track the outcome so we don't silently report a clean scrub that failed.
    let piiScrubbed = true;
    const { error: closeErr } = await supabaseAdmin.rpc('close_account', { p_user_id: id });
    if (closeErr) {
      piiScrubbed = false;
      console.error(
        '[profiles DELETE] close_account() FAILED — PII was NOT scrubbed; continuing to free the ' +
        `email so the login is still killed. User ${id} retains personal data — manual scrub required.`,
        closeErr
      );
    }

    // 2. Free the LOGIN EMAIL — the GUARANTEED, history-safe path. We do NOT
    //    hard-delete the auth user: profiles_id_fkey is ON DELETE NO ACTION (so a
    //    delete would fail anyway while the profile row exists), and deleting the
    //    profile row would risk cascading away retained payroll/timecard history.
    //    Instead, rename the auth email to a dead sentinel + permanently BAN the
    //    identity (876000h ≈ 100 years) so it can never authenticate again.
    let emailFreed = false;
    const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
      email: freedEmail,
      email_confirm: true,
      ban_duration: '876000h',
    });
    if (banErr) {
      console.error('[profiles DELETE] failed to release/ban auth email (no changes made):', banErr);
      return NextResponse.json(
        { error: 'Failed to delete user. No changes were saved.' },
        { status: 500 }
      );
    }
    emailFreed = true;

    // 3. Soft-delete the profile + mirror the freed sentinel email (NEVER hard-delete
    //    the row — payroll/timecard FKs depend on it). close_account() already set
    //    deleted_at/active/anonymized fields when it succeeded; stamp them here too
    //    so the row is consistent even if that RPC errored, and align the profile
    //    email to the same auth sentinel.
    const { error: profErr } = await supabaseAdmin
      .from('profiles')
      .update({
        deleted_at: new Date().toISOString(),
        active: false,
        email: freedEmail,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (profErr) {
      // The auth identity is already banned + renamed (email is freed regardless),
      // so the user can't log in — but the profile row may still show. Log loudly.
      console.error('[profiles DELETE] profile soft-delete failed AFTER auth email release:', profErr);
      return NextResponse.json(
        { error: 'User login was removed but their profile record could not be updated — contact support.' },
        { status: 500 }
      );
    }

    // 4. Clean up any lingering invitation / access-request rows for the original
    //    email so a fresh request/invite starts clean (best-effort).
    if (originalEmail) {
      await supabaseAdmin.from('user_invitations').delete().ilike('email', originalEmail);
      await supabaseAdmin.from('access_requests').delete().ilike('email', originalEmail);
    }

    return NextResponse.json({
      success: true,
      message: piiScrubbed
        ? `${target.full_name || 'User'} permanently deleted; email freed.`
        : `${target.full_name || 'User'}'s login was removed and their email freed, but scrubbing their personal info failed — contact support to finish the scrub.`,
      emailFreed,
      piiScrubbed,
    });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/admin/profiles/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
