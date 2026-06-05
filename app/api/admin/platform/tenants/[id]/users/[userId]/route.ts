export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * PATCH /api/admin/platform/tenants/[id]/users/[userId]  { role?, active? }
 * Change a tenant user's authorization role or (de)activate them.
 * PLATFORM CONSOLE, super_admin only.
 *
 * SECURITY MODEL (non-negotiable):
 *  - requireSuperAdmin.
 *  - The target tenant is the EXPLICIT path param [id]; never the caller's own.
 *  - Cross-tenant-escalation guard: re-fetch the target user and ASSERT
 *    user.tenant_id === [id] before any write. A 404 otherwise.
 *  - Every write carries `.eq('tenant_id', id)` AND `.eq('id', userId)`.
 *  - Role lives in profiles.role, never user_metadata.
 *
 * GUARD RAILS:
 *  - Cannot grant super_admin here (stays in grant-super-admin).
 *  - Cannot demote/deactivate the LAST active admin/owner of the tenant
 *    (active role in admin/super_admin/operations_manager → refuse if it hits 0).
 *  - Cannot self-demote or self-deactivate.
 */

/** Roles that count as an "admin/owner" for the last-admin guard. */
const ADMIN_OWNER_ROLES = ['admin', 'super_admin', 'operations_manager'];

/** Roles the platform console may assign via this route (super_admin excluded). */
const ASSIGNABLE_ROLES = [
  'operations_manager', 'admin', 'salesman', 'shop_manager',
  'inventory_manager', 'operator', 'apprentice', 'supervisor', 'shop_help',
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id, userId } = await params;

  try {
    // Verify the explicit target tenant exists.
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });
    }

    const body = (await request.json()) as { role?: string; active?: boolean };
    const newRole = typeof body.role === 'string' ? body.role.trim() : undefined;
    const newActive = typeof body.active === 'boolean' ? body.active : undefined;

    if (newRole === undefined && newActive === undefined) {
      return NextResponse.json({ error: 'Nothing to update (role or active required).' }, { status: 400 });
    }

    // Validate role if provided. Never grant super_admin here.
    if (newRole !== undefined) {
      if (newRole === 'super_admin') {
        return NextResponse.json(
          { error: 'super_admin cannot be granted here. Use the grant-super-admin flow.' },
          { status: 403 }
        );
      }
      if (!ASSIGNABLE_ROLES.includes(newRole)) {
        return NextResponse.json({ error: `Invalid role "${newRole}"` }, { status: 400 });
      }
    }

    // Cross-tenant-escalation guard: re-fetch the target user and ASSERT it
    // actually belongs to the named tenant before writing.
    const { data: targetUser } = await supabaseAdmin
      .from('profiles')
      .select('id, role, active, tenant_id')
      .eq('id', userId)
      .maybeSingle();

    if (!targetUser || targetUser.tenant_id !== id) {
      return NextResponse.json({ error: 'User not found in this tenant.' }, { status: 404 });
    }

    // Refuse self-demotion / self-deactivation.
    if (userId === auth.userId) {
      if (newActive === false) {
        return NextResponse.json({ error: 'You cannot deactivate yourself.' }, { status: 409 });
      }
      if (newRole !== undefined && newRole !== targetUser.role) {
        return NextResponse.json({ error: 'You cannot change your own role here.' }, { status: 409 });
      }
    }

    // Determine whether this change strips the target's admin/owner status.
    const wasAdminOwner = ADMIN_OWNER_ROLES.includes(targetUser.role) && targetUser.active !== false;
    const beingDeactivated = newActive === false;
    const beingDemoted = newRole !== undefined && !ADMIN_OWNER_ROLES.includes(newRole);
    const losesAdminStatus = wasAdminOwner && (beingDeactivated || beingDemoted);

    if (losesAdminStatus) {
      // Count remaining active admin/owner users in this tenant (excluding the target).
      const { data: admins } = await supabaseAdmin
        .from('profiles')
        .select('id, role, active')
        .eq('tenant_id', id)
        .in('role', ADMIN_OWNER_ROLES);

      const remainingActiveAdmins = (admins || []).filter(
        (u) => u.id !== userId && u.active !== false
      ).length;

      if (remainingActiveAdmins === 0) {
        return NextResponse.json(
          { error: 'Refusing to remove the last active admin/owner of this tenant.' },
          { status: 409 }
        );
      }
    }

    // Build the update.
    const updates: Record<string, any> = {};
    if (newRole !== undefined) updates.role = newRole;
    if (newActive !== undefined) updates.active = newActive;

    // Write scoped to BOTH the user id AND the explicit target tenant.
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .eq('tenant_id', id)
      .select('id, full_name, email, role, active, tenant_id')
      .single();

    if (error) throw error;

    // Audit — REAL audit_logs columns (user_id / resource_* / details / tenant_id).
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        user_email: auth.userEmail,
        action: 'platform_update_tenant_user',
        resource_type: 'profile',
        resource_id: userId,
        tenant_id: id,
        details: {
          target_tenant_id: id,
          changes: updates,
          previous: { role: targetUser.role, active: targetUser.active },
        },
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
