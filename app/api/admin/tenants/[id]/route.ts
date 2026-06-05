export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { FEATURE_MODULE_MAP, LEGACY_ALIASES } from '@/lib/features';
import { PROTECTED_TENANT_IDS } from '@/lib/tenant-onboarding';

/** Tenant statuses that revoke access (block if last active tenant / Patriot). */
const DEACTIVATING_STATUSES = ['suspended', 'cancelled'];

/**
 * Drop any module key that resolves to a `core: true` module from an incoming
 * `features` map. Core modules must NEVER be stored/disabled (disabling breaks
 * the app). Legacy aliases are normalized before the core check.
 */
function stripCoreFeatureKeys(features: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(features)) {
    const canonical = (LEGACY_ALIASES[key] ?? key) as string;
    const mod = FEATURE_MODULE_MAP[canonical];
    if (mod?.core) continue; // never store a core key
    cleaned[key] = value;
  }
  return cleaned;
}

/**
 * GET /api/admin/tenants/[id] — Get tenant details with users
 * PATCH /api/admin/tenants/[id] — Update tenant
 * DELETE /api/admin/tenants/[id] — Delete tenant (soft: sets status to 'cancelled')
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  try {
    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Get tenant users with profile info
    const { data: users } = await supabaseAdmin
      .from('tenant_users')
      .select('*, profiles:user_id(full_name, email, role, avatar_url)')
      .eq('tenant_id', id);

    return NextResponse.json({
      success: true,
      data: { ...tenant, users: users || [] },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  try {
    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = [
      'name', 'domain', 'logo_url', 'primary_color', 'status', 'plan',
      'max_users', 'max_jobs_per_month', 'features', 'billing_email',
      'billing_address',
    ];

    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Guard rail (a): never store/disable a core module. Strip any core key
    // from an incoming features map.
    if (updates.features && typeof updates.features === 'object') {
      updates.features = stripCoreFeatureKeys(updates.features as Record<string, unknown>);
    }

    // Guard rail (b): a status change that revokes access (suspended/cancelled)
    // is blocked for the protected tenant (Patriot) and may not leave zero
    // active tenants.
    if (typeof updates.status === 'string' && DEACTIVATING_STATUSES.includes(updates.status)) {
      if (PROTECTED_TENANT_IDS.includes(id)) {
        return NextResponse.json(
          { error: 'This tenant is protected and cannot be suspended or cancelled.' },
          { status: 403 }
        );
      }

      // Count currently-active tenants. If this tenant is one of them and it's
      // the last active tenant, refuse (would lock everyone out).
      const { data: activeTenants } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('status', 'active');

      const activeIds = (activeTenants || []).map((t) => t.id);
      const targetIsActive = activeIds.includes(id);
      if (targetIsActive && activeIds.length <= 1) {
        return NextResponse.json(
          { error: 'Refusing to deactivate the last active tenant.' },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Audit
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        user_email: auth.userEmail,
        action: 'update_tenant',
        resource_type: 'tenant',
        resource_id: id,
        tenant_id: id,
        details: updates,
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  try {
    // Same guard rails as PATCH's deactivating-status path: DELETE soft-cancels a
    // tenant, which revokes access exactly like suspend/cancel — so it must NOT be
    // able to cancel the protected tenant (Patriot) or leave zero active tenants.
    if (PROTECTED_TENANT_IDS.includes(id)) {
      return NextResponse.json(
        { error: 'This tenant is protected and cannot be cancelled.' },
        { status: 403 }
      );
    }
    const { data: activeTenants } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('status', 'active');
    const activeIds = (activeTenants || []).map((t) => t.id);
    if (activeIds.includes(id) && activeIds.length <= 1) {
      return NextResponse.json(
        { error: 'Refusing to deactivate the last active tenant.' },
        { status: 409 }
      );
    }

    // Soft delete — set status to cancelled
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        user_email: auth.userEmail,
        action: 'delete_tenant',
        resource_type: 'tenant',
        resource_id: id,
        tenant_id: id,
        details: { soft_delete: true },
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
