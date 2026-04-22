/**
 * Shared API route authentication helpers.
 * Reusable functions to verify Bearer tokens and check user roles.
 * Pattern based on /app/api/admin/users/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface AuthSuccess {
  authorized: true;
  userId: string;
  userEmail: string;
  role: string;
  tenantId: string;
}

interface AuthFailure {
  authorized: false;
  response: NextResponse;
}

type AuthResult = AuthSuccess | AuthFailure;

/**
 * Require the request to have a valid Bearer token belonging to an admin user.
 * Returns 401 if no/invalid token, 403 if not admin.
 */
export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      ),
    };
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized. Invalid or expired session.' },
        { status: 401 }
      ),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !['admin', 'super_admin', 'operations_manager'].includes(profile.role)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Admin access required.' },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId: user.id,
    userEmail: user.email || '',
    role: profile.role,
    tenantId: profile.tenant_id || '',
  };
}

/**
 * Require the request to have a valid Bearer token belonging to sales-capable staff.
 * Admits admin, super_admin, operations_manager, supervisor, and salesman.
 * Used for routes that salesman/supervisor must access (schedule form, active jobs, invoices, etc.).
 */
export async function requireSalesStaff(request: NextRequest): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth;

  if (!['admin', 'super_admin', 'operations_manager', 'supervisor', 'salesman'].includes(auth.role)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Sales staff access required.' },
        { status: 403 }
      ),
    };
  }

  return auth;
}

/**
 * Admin role list shared across guards that perform self-or-admin access checks.
 */
export const ADMIN_ROLES = ['admin', 'super_admin', 'operations_manager'] as const;

/**
 * Require the request to have a valid Bearer token belonging to a super_admin user.
 * Returns 401 if no/invalid token, 403 if not super_admin.
 */
export async function requireSuperAdmin(request: NextRequest): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth;

  if (auth.role !== 'super_admin') {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Super admin access required.' },
        { status: 403 }
      ),
    };
  }

  return auth;
}

/**
 * Require the request to have a valid Bearer token belonging to an admin, super_admin, or salesman.
 * Used for Schedule Board access where all three roles can view.
 */
export async function requireScheduleBoardAccess(request: NextRequest): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth;

  if (!['admin', 'super_admin', 'salesman', 'operations_manager', 'supervisor'].includes(auth.role)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Schedule board access required.' },
        { status: 403 }
      ),
    };
  }

  return auth;
}

/**
 * Require the request to have a valid Bearer token for any authenticated user.
 * Returns 401 if no/invalid token.
 */
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
  const statusCode = error.status || error.statusCode || 0;
  // Stringify the entire error object as a last-resort catch
  const errorStr = (() => {
    try { return JSON.stringify(error).toLowerCase(); } catch { return ''; }
  })();
  return (
    // PostgreSQL: undefined_table
    code === '42P01' ||
    // PostgREST: table/view not found
    code === 'PGRST204' || code === 'PGRST205' ||
    // PostgREST: relation does not exist (may come as different codes)
    code === 'PGRST301' || code === 'PGRST302' ||
    // Message-based detection — specific to table/relation errors only
    (message.includes('relation') && message.includes('does not exist')) ||
    message.includes('undefined table') ||
    (message.includes('could not find') && message.includes('relation')) ||
    // Details/hint-based detection (relation-specific)
    (details.includes('relation') && details.includes('does not exist')) ||
    (hint.includes('relation') && hint.includes('does not exist')) ||
    // Full error string fallback for edge cases
    (errorStr.includes('relation') && errorStr.includes('does not exist'))
  );
}

/**
 * Require a valid Bearer token belonging to a shop user.
 * Stub -- accepts any authenticated user for now.
 */
export async function requireShopUser(request: NextRequest): Promise<AuthResult> {
  return requireAuth(request);
}

/**
 * Require a valid Bearer token belonging to a shop manager (admin).
 * Stub -- delegates to requireAdmin for now.
 */
export async function requireShopManager(request: NextRequest): Promise<AuthResult> {
  return requireAdmin(request);
}

export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      ),
    };
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized. Invalid or expired session.' },
        { status: 401 }
      ),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !profile.role) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. User profile not found or incomplete.' },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId: user.id,
    userEmail: user.email || '',
    role: profile.role,
    tenantId: profile.tenant_id || '',
  };
}

/**
 * Require the request to have a valid Bearer token belonging to a super_admin or operations_manager.
 * Used for the Operations Hub diagnostics dashboard.
 */
export async function requireOpsManager(request: NextRequest): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth;

  if (!['super_admin', 'operations_manager'].includes(auth.role)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Operations manager or super admin access required.' },
        { status: 403 }
      ),
    };
  }

  return auth;
}
