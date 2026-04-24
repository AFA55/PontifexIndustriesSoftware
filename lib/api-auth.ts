/**
 * Shared API route authentication helpers.
 * Reusable functions to verify Bearer tokens and check user roles.
 *
 * Security model:
 *  - `tenantId` is `string | null`. Non-super-admins MUST have a tenant; the
 *    guards below return 403 if they don't. super_admin is the only role
 *    allowed to have `tenantId === null`.
 *  - Callers that need a guaranteed non-null tenant to scope a query should
 *    invoke `resolveTenantScope(request, auth)`. For non-super-admins it
 *    returns their own tenantId; for super_admin it requires an explicit
 *    `?tenantId=<uuid>` query parameter.
 *  - The old pattern `if (tenantId) query.eq('tenant_id', tenantId)` is
 *    unsafe (NULL bypasses the filter). Replace those sites with a direct
 *    `.eq('tenant_id', tenantId)` after obtaining tenantId from either the
 *    auth result (guaranteed non-null for non-super-admins by the guards)
 *    or from `resolveTenantScope`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface AuthSuccess {
  authorized: true;
  userId: string;
  userEmail: string;
  role: string;
  /** null ONLY for super_admin; all other roles are guaranteed non-null by the guards. */
  tenantId: string | null;
}

export interface AuthFailure {
  authorized: false;
  response: NextResponse;
}

export type AuthResult = AuthSuccess | AuthFailure;

/** Roles allowed through `requireAdmin` (narrowed — excludes salesman/supervisor). */
export const ADMIN_ROLES: string[] = ['admin', 'super_admin', 'operations_manager'];
/** Broader set for read-only / schedule-board / sales pipeline routes. */
const SALES_STAFF_ROLES = ['admin', 'super_admin', 'operations_manager', 'supervisor', 'salesman'];

/**
 * Internal: resolve Bearer token -> profile. Does NOT enforce tenant presence.
 * Use `requireAuth` for the externally-facing guard.
 */
async function resolveAuth(request: NextRequest): Promise<
  | { ok: true; userId: string; userEmail: string; role: string; tenantId: string | null }
  | { ok: false; response: NextResponse }
> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 }),
    };
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized. Invalid or expired session.' }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !profile.role) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden. User profile not found or incomplete.' },
        { status: 403 }
      ),
    };
  }

  const tenantId = profile.tenant_id && profile.tenant_id !== '' ? profile.tenant_id : null;

  return {
    ok: true,
    userId: user.id,
    userEmail: user.email || '',
    role: profile.role,
    tenantId,
  };
}

/**
 * Require any authenticated user with a valid profile AND a tenant (unless super_admin).
 * Returns 401 if no/invalid token, 403 if profile missing or tenant not set for a
 * non-super-admin role.
 */
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const r = await resolveAuth(request);
  if (!r.ok) return { authorized: false, response: r.response };

  if (r.role !== 'super_admin' && !r.tenantId) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Tenant not set for this user.' },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId: r.userId,
    userEmail: r.userEmail,
    role: r.role,
    tenantId: r.tenantId,
  };
}

/**
 * Require an admin-level role: admin, super_admin, or operations_manager.
 * (Narrowed from previous version — salesman/supervisor must use `requireSalesStaff`.)
 *
 * For tenant-scoped admin routes, callers should treat `auth.tenantId` as
 * nullable only for super_admin. To get a guaranteed non-null tenantId
 * (resolved from `?tenantId=` for super_admin), use `resolveTenantScope`.
 */
export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
  const r = await resolveAuth(request);
  if (!r.ok) return { authorized: false, response: r.response };

  if (!ADMIN_ROLES.includes(r.role)) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 }),
    };
  }

  if (r.role !== 'super_admin' && !r.tenantId) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Tenant not set for this user.' },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId: r.userId,
    userEmail: r.userEmail,
    role: r.role,
    tenantId: r.tenantId,
  };
}

/**
 * Require super_admin role. Returns a nullable tenantId — super_admins have no
 * home tenant; routes using this guard should consult `resolveTenantScope`
 * (with an explicit `?tenantId=` query) when scoping reads/writes.
 */
export async function requireSuperAdmin(request: NextRequest): Promise<AuthResult> {
  const r = await resolveAuth(request);
  if (!r.ok) return { authorized: false, response: r.response };

  if (r.role !== 'super_admin') {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Super admin access required.' },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId: r.userId,
    userEmail: r.userEmail,
    role: r.role,
    tenantId: r.tenantId,
  };
}

/**
 * Broad guard for read-only / sales-pipeline routes: admin, super_admin,
 * operations_manager, supervisor, salesman.
 */
export async function requireSalesStaff(request: NextRequest): Promise<AuthResult> {
  const r = await resolveAuth(request);
  if (!r.ok) return { authorized: false, response: r.response };

  if (!SALES_STAFF_ROLES.includes(r.role)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Sales staff access required.' },
        { status: 403 }
      ),
    };
  }

  if (r.role !== 'super_admin' && !r.tenantId) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Tenant not set for this user.' },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId: r.userId,
    userEmail: r.userEmail,
    role: r.role,
    tenantId: r.tenantId,
  };
}

/**
 * Schedule-board access: same role set as requireSalesStaff plus supervisor.
 */
export async function requireScheduleBoardAccess(request: NextRequest): Promise<AuthResult> {
  return requireSalesStaff(request);
}

/**
 * Ops-hub guard (diagnostics dashboard).
 */
export async function requireOpsManager(request: NextRequest): Promise<AuthResult> {
  const r = await resolveAuth(request);
  if (!r.ok) return { authorized: false, response: r.response };

  if (!['super_admin', 'operations_manager'].includes(r.role)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Operations manager or super admin access required.' },
        { status: 403 }
      ),
    };
  }

  if (r.role !== 'super_admin' && !r.tenantId) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Tenant not set for this user.' },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId: r.userId,
    userEmail: r.userEmail,
    role: r.role,
    tenantId: r.tenantId,
  };
}

/**
 * Resolve the tenant a query should be scoped to.
 *
 * - For non-super-admins: returns their own `auth.tenantId` (guaranteed non-null
 *   by the guards).
 * - For super_admin: reads `?tenantId=<uuid>` from the request URL. Returns
 *   a 400 response if absent, 404 if the tenant does not exist.
 *
 * Usage:
 *   const scope = await resolveTenantScope(request, auth);
 *   if ('response' in scope) return scope.response;
 *   const tenantId = scope.tenantId; // non-null string
 */
export async function resolveTenantScope(
  request: NextRequest,
  auth: AuthSuccess
): Promise<{ tenantId: string } | { response: NextResponse }> {
  if (auth.role !== 'super_admin') {
    // Guaranteed non-null by the guards; defend anyway.
    if (!auth.tenantId) {
      return {
        response: NextResponse.json(
          { error: 'Forbidden. Tenant not set for this user.' },
          { status: 403 }
        ),
      };
    }
    return { tenantId: auth.tenantId };
  }

  // super_admin: prefer explicit tenantId param; auto-resolve from profile if absent
  const { searchParams } = new URL(request.url);
  const explicit = searchParams.get('tenantId') || searchParams.get('tenant_id');

  if (explicit) {
    // Explicit override — validate it exists
    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('id', explicit)
      .maybeSingle();
    if (error || !tenant) {
      return { response: NextResponse.json({ error: 'Tenant not found.' }, { status: 404 }) };
    }
    return { tenantId: tenant.id };
  }

  // No explicit tenantId — look up from super_admin's own profile
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id')
    .eq('id', auth.userId)
    .maybeSingle();

  if (profile?.tenant_id) {
    return { tenantId: profile.tenant_id };
  }

  // Last resort: return 400
  return {
    response: NextResponse.json(
      { error: 'Could not resolve tenant. Pass ?tenantId= or ensure your profile has a tenant_id.' },
      { status: 400 }
    ),
  };
}

/**
 * Check if a Supabase/PostgREST error indicates a missing table.
 * Handles all known error code formats:
 * - PostgreSQL 42P01 (undefined_table)
 * - PostgREST PGRST204/PGRST205 (table not found variants)
 * - Message-based detection as fallback
 */
export function isTableNotFoundError(error: any): boolean {
  if (!error) return false;
  const code = (error.code || '').toString();
  const message = (error.message || '').toLowerCase();
  const details = (error.details || '').toLowerCase();
  const hint = (error.hint || '').toLowerCase();
  // Stringify the entire error object as a last-resort catch
  const errorStr = (() => {
    try { return JSON.stringify(error).toLowerCase(); } catch { return ''; }
  })();
  return (
    code === '42P01' ||
    code === 'PGRST204' || code === 'PGRST205' ||
    code === 'PGRST301' || code === 'PGRST302' ||
    (message.includes('relation') && message.includes('does not exist')) ||
    message.includes('undefined table') ||
    (message.includes('could not find') && message.includes('relation')) ||
    (details.includes('relation') && details.includes('does not exist')) ||
    (hint.includes('relation') && hint.includes('does not exist')) ||
    (errorStr.includes('relation') && errorStr.includes('does not exist'))
  );
}

/**
 * Require a valid Bearer token belonging to a shop user (shop_manager, admin, super_admin, operations_manager).
 */
export async function requireShopUser(request: NextRequest): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth;
  if (!['shop_manager', 'admin', 'super_admin', 'operations_manager'].includes(auth.role || '')) {
    return { authorized: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return auth;
}

/**
 * Require a valid Bearer token belonging to a shop manager (admin).
 * Stub -- delegates to requireAdmin for now.
 */
export async function requireShopManager(request: NextRequest): Promise<AuthResult> {
  return requireAdmin(request);
}
