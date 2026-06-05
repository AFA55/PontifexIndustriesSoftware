export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createAdminUser } from '@/lib/tenant-onboarding';

/**
 * Cross-tenant user management (PLATFORM CONSOLE, super_admin only).
 *
 *   GET  /api/admin/platform/tenants/[id]/users
 *        — list profiles WHERE tenant_id = [id]
 *   POST /api/admin/platform/tenants/[id]/users  { email, name, role, tempPassword? }
 *        — add a user TO tenant [id]
 *
 * SECURITY MODEL (non-negotiable):
 *  - requireSuperAdmin on every verb.
 *  - The target tenant is the EXPLICIT path param [id]. We resolve it directly
 *    (verify it exists) and NEVER use the caller's own tenant_id as scope.
 *  - supabaseAdmin bypasses RLS, so the app layer is the enforcement boundary:
 *    every read/write is `.eq('tenant_id', id)`.
 *  - Role lives in profiles.role, never user_metadata.
 */

/** Known authorization roles. super_admin is intentionally EXCLUDED here. */
const ASSIGNABLE_ROLES = [
  'operations_manager', 'admin', 'salesman', 'shop_manager',
  'inventory_manager', 'operator', 'apprentice', 'supervisor', 'shop_help',
];

/** Verify the explicit target tenant exists; returns 404 response otherwise. */
async function resolveTargetTenant(
  id: string
): Promise<{ tenant: { id: string; name: string } } | { response: NextResponse }> {
  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (error || !tenant) {
    return { response: NextResponse.json({ error: 'Tenant not found.' }, { status: 404 }) };
  }
  return { tenant };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  const target = await resolveTargetTenant(id);
  if ('response' in target) return target.response;

  try {
    // Source of truth = profiles scoped to the EXPLICIT target tenant.
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role, active, avatar_url, created_at, tenant_id')
      .eq('tenant_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  const target = await resolveTargetTenant(id);
  if ('response' in target) return target.response;

  try {
    const body = (await request.json()) as {
      email?: string;
      name?: string;
      role?: string;
      tempPassword?: string;
    };

    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    const role = body.role?.trim();

    if (!email || !name || !role) {
      return NextResponse.json({ error: 'email, name, and role are required' }, { status: 400 });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }
    // Never grant super_admin here — that stays in grant-super-admin.
    if (role === 'super_admin') {
      return NextResponse.json(
        { error: 'super_admin cannot be granted here. Use the grant-super-admin flow.' },
        { status: 403 }
      );
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return NextResponse.json({ error: `Invalid role "${role}"` }, { status: 400 });
    }

    // Refuse if a profile with this email already exists (avoid hijacking an
    // existing user, possibly in another tenant).
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, tenant_id')
      .eq('email', email)
      .maybeSingle();
    if (existingProfile) {
      return NextResponse.json(
        { error: 'A user with this email already exists.' },
        { status: 409 }
      );
    }

    // Add the user TO the explicit target tenant via the shared onboarding logic.
    const result = await createAdminUser(
      id,
      { email, fullName: name, tempPassword: body.tempPassword || undefined, role },
      { tenantUserRole: 'member', invitedBy: auth.userId }
    );

    // Audit — REAL audit_logs columns (user_id / resource_* / details / tenant_id).
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        user_email: auth.userEmail,
        action: 'platform_add_tenant_user',
        resource_type: 'profile',
        resource_id: result.userId,
        tenant_id: id,
        details: { target_tenant_id: id, email, role, invited: result.invited },
      })
    ).catch(() => {});

    return NextResponse.json(
      { success: true, data: { userId: result.userId, invited: result.invited } },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
