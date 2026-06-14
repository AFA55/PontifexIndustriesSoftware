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
        const { data: authUsersPage } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const emailTakenInAuth = authUsersPage?.users?.some(
          (u) => u.id !== id && u.email?.toLowerCase() === newEmail
        );
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

    // 1. Release the login email (auth first) so it's reusable immediately.
    const freedEmail = `deleted+${id}@pontifex.invalid`;
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
      email: freedEmail,
      email_confirm: true,
    });
    if (authErr) {
      console.error('[profiles DELETE] failed to release auth email (no changes made):', authErr);
      return NextResponse.json(
        { error: 'Failed to remove user. No changes were saved.' },
        { status: 500 }
      );
    }

    // 2. Soft-delete the profile + mirror the freed email.
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
      console.error('[profiles DELETE] profile soft-delete failed AFTER auth email release:', profErr);
      return NextResponse.json(
        { error: 'User partially removed — contact support.' },
        { status: 500 }
      );
    }

    // Clean up any lingering invitation / access-request rows for the original
    // email so a fresh request/invite starts clean (best-effort).
    const originalEmail = (target.email || '').trim().toLowerCase();
    if (originalEmail) {
      await supabaseAdmin.from('user_invitations').delete().ilike('email', originalEmail);
      await supabaseAdmin.from('access_requests').delete().ilike('email', originalEmail);
    }

    return NextResponse.json({
      success: true,
      message: `${target.full_name || 'User'} removed. Their email is free to invite again.`,
    });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/admin/profiles/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
