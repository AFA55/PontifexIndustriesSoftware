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
import { PLATFORM_TENANT_ID } from '@/lib/rbac';

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

// Read-only view roles: SALES_STAFF + shop_manager. Used by routes that only
// expose data (no mutations). shop_manager needs to SEE the schedule + active
// jobs (to coordinate equipment drops, plan pulls), but should NOT create or
// edit jobs — write routes keep using SALES_STAFF_ROLES or stricter.
const SCHEDULE_VIEWER_ROLES = [...SALES_STAFF_ROLES, 'shop_manager'];

/**
 * Internal: resolve Bearer token -> profile. Does NOT enforce tenant presence.
 * Use `requireAuth` for the externally-facing guard.
 */
async function resolveAuth(request: NextRequest): Promise<
  | { ok: true; userId: string; userEmail: string; role: string; tenantId: string | null }
  | { ok: false; response: NextResponse }
> {
  const authHeader = request.headers.get('authorization');
  // Case- and whitespace-tolerant. The old `replace('Bearer ', '')` matched one
  // exact literal, so `bearer <jwt>` or a double space left the prefix INSIDE
  // the token — which GoTrue rejects as malformed. That is a live candidate for
  // the "token is malformed" 401 the founder hit while printing a work ticket
  // on Aug 15, so the parse is widened and the diagnostic below records whether
  // a prefix was actually found.
  const hadBearerPrefix = /^\s*bearer\s+/i.test(authHeader ?? '');
  const token = authHeader?.replace(/^\s*bearer\s+/i, '').trim();

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 }),
    };
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    // WHY WE LOG THE TOKEN'S SHAPE (founder, Aug 15 — "I tried to print the work
    // ticket and it said error… this is what the PMs and admin were telling me").
    //
    // This branch had been flattening EVERY auth failure into one sentence, so
    // the office reported "invalid or expired session" while the Supabase auth
    // log said something completely different for that same second:
    //   GET /user 403 "token is malformed: token contains an invalid number of
    //   segments" — i.e. not expired at all, the bearer wasn't a JWT.
    //
    // Never the token itself, and never a fragment of it — a bearer token is a
    // live credential and logs are not a safe place for one. Length and segment
    // count are enough to tell "expired" from "garbage" from "truncated", which
    // is the distinction that cost us the diagnosis.
    const segments = token.split('.').length;
    console.warn(
      '[auth] rejected bearer token',
      JSON.stringify({
        reason: authError?.message ?? 'no user returned',
        token_length: token.length,
        token_segments: segments,
        well_formed_jwt: segments === 3,
        // A missing prefix means the client sent the raw token (or something
        // else entirely) with no "Bearer " at all — worth telling apart from a
        // token that was simply stale.
        had_bearer_prefix: hadBearerPrefix,
        path: new URL(request.url).pathname,
      })
    );
    // Distinguish the two for the CLIENT too, so a page can tell a session that
    // needs refreshing from one that was never valid.
    const malformed = segments !== 3;
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: malformed
            ? 'Unauthorized. Your sign-in token was not readable — please sign in again.'
            : 'Unauthorized. Invalid or expired session.',
          code: malformed ? 'malformed_token' : 'invalid_session',
        },
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
 * READ-ONLY timecard access: the admin set PLUS supervisor.
 *
 * THE BUG (Aug 15 sweep): the timecards page admits five roles via
 * lib/auth.ts `isAdmin()`, and every timecard route is `requireAdmin`, which is
 * three. The supervisor's own dashboard has a Timecards button on it. So David
 * clicked through, the page rendered, every request 403'd, and the screen sat
 * blank forever with no error — the platform's signature defect, where the page
 * admits a role the backend refuses.
 *
 * lib/rbac.ts grants supervisor `timecards: 'view'`, so viewing is the intent.
 * VIEW ONLY: approve, edit, delete and no-show stay on `requireAdmin`, because
 * his preset says view and someone who oversees the crew should not also be
 * able to approve their own crew's hours.
 *
 * Salesman is deliberately NOT here — they have no timecards card at all, and
 * `isAdmin()` admitting them to that page was simply wrong.
 */
export const TIMECARD_VIEWER_ROLES: string[] = [...ADMIN_ROLES, 'supervisor'];

export async function requireTimecardViewer(request: NextRequest): Promise<AuthResult> {
  const r = await resolveAuth(request);
  if (!r.ok) return { authorized: false, response: r.response };

  if (!TIMECARD_VIEWER_ROLES.includes(r.role)) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Forbidden. Timecard access required.' }, { status: 403 }),
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

/** Roles allowed to APPROVE a pending job onto the schedule. */
export const JOB_APPROVER_ROLES: string[] = [
  'admin',
  'super_admin',
  'operations_manager',
  'supervisor',
  'salesman',
];

/**
 * Guard for pushing a pending job onto the schedule.
 *
 * FOUNDER (Aug 13): "Give permission to Adam Ingalls and David Schadt, the
 * supervisors — add this to their permissions so they could push jobs if I'm
 * not here."
 *
 * Adam is a `salesman` and David a `supervisor`, and approval sat behind
 * `requireAdmin` (admin | super_admin | operations_manager), so neither could
 * release a job. Work stopped whenever the founder was away.
 *
 * Deliberately its OWN guard rather than widening ADMIN_ROLES. Widening that
 * constant would have handed a salesman every admin route on the platform —
 * timecard edits, team permissions, deletions — to fix one button. This grants
 * exactly the one capability that was asked for.
 */
export async function requireJobApprover(request: NextRequest): Promise<AuthResult> {
  const r = await resolveAuth(request);
  if (!r.ok) return { authorized: false, response: r.response };

  if (!JOB_APPROVER_ROLES.includes(r.role)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. You do not have permission to approve jobs.' },
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
    role: r.role,
    tenantId: r.tenantId,
    userEmail: r.userEmail,
  };
}

/**
 * Read-only guard for routes that schedule viewers can see:
 * SALES_STAFF + shop_manager. Use on GET routes that return schedule /
 * active-jobs / job summary data. NEVER use on POST/PATCH/DELETE.
 */
export async function requireScheduleViewer(request: NextRequest): Promise<AuthResult> {
  const r = await resolveAuth(request);
  if (!r.ok) return { authorized: false, response: r.response };

  if (!SCHEDULE_VIEWER_ROLES.includes(r.role)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Schedule viewer access required.' },
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
 * Schedule-board access: read-only view roles (SALES_STAFF + shop_manager).
 * shop_manager needs to SEE the schedule to plan equipment pulls + coordinate
 * drops — they can't create or edit jobs (those routes still go through
 * requireSalesStaff or stricter guards).
 */
export async function requireScheduleBoardAccess(request: NextRequest): Promise<AuthResult> {
  return requireScheduleViewer(request);
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
 * - For super_admin: prefers an explicit `?tenantId=<uuid>` from the request URL
 *   (404 if that tenant does not exist). If the param is ABSENT, it falls back
 *   to the super_admin's own profile tenant_id; only when neither is available
 *   does it return a 400. (It does NOT hard-require the query param.)
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

  // super_admin. Resolve the caller's OWN tenant first (auth.tenantId may be
  // null in the type; look it up from the profile if so).
  let callerTenant = auth.tenantId;
  if (!callerTenant) {
    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', auth.userId)
      .maybeSingle();
    callerTenant = prof?.tenant_id ?? null;
  }
  // Only the PLATFORM OWNER (Pontifex parent org) may act across tenants via
  // ?tenantId=. A tenant-scoped super_admin (e.g. a client's own super_admin)
  // is confined to their OWN tenant regardless of any override — otherwise one
  // client's super_admin could read/write another client's data.
  const isPlatformOwner = callerTenant === PLATFORM_TENANT_ID;

  const { searchParams } = new URL(request.url);
  const explicit = searchParams.get('tenantId') || searchParams.get('tenant_id');

  if (explicit) {
    if (!isPlatformOwner) {
      // Non-owner super_admin — ignore the override, scope to their own tenant.
      if (callerTenant) return { tenantId: callerTenant };
      return {
        response: NextResponse.json(
          { error: 'Forbidden. Cross-tenant access is restricted to the platform owner.' },
          { status: 403 }
        ),
      };
    }
    // Platform owner — validate the target tenant exists.
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

  // No explicit tenantId — scope to the caller's own tenant.
  if (callerTenant) {
    return { tenantId: callerTenant };
  }

  return {
    response: NextResponse.json(
      { error: 'Could not resolve tenant. Pass ?tenantId= or ensure your profile has a tenant_id.' },
      { status: 400 }
    ),
  };
}

/**
 * Require the PLATFORM OWNER (Pontifex parent org super_admin) — role
 * super_admin AND tenant_id === PLATFORM_TENANT_ID. Use on platform-console /
 * cross-tenant routes (tenants CRUD, grant-super-admin, backups, platform/*) so
 * a tenant-scoped super_admin can't reach the owner console over the wire.
 */
export async function requirePlatformOwner(request: NextRequest): Promise<AuthResult> {
  const r = await resolveAuth(request);
  if (!r.ok) return { authorized: false, response: r.response };

  let tenantId = r.tenantId;
  if (r.role === 'super_admin' && !tenantId) {
    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', r.userId)
      .maybeSingle();
    tenantId = prof?.tenant_id ?? null;
  }

  if (r.role !== 'super_admin' || tenantId !== PLATFORM_TENANT_ID) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Platform owner access required.' },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId: r.userId,
    userEmail: r.userEmail,
    role: r.role,
    tenantId,
  };
}

/**
 * Tenant resolution for billing/subscription routes.
 *
 * Billing is a per-tenant action: a tenant admin manages their OWN tenant's
 * subscription (auth.tenantId); a platform super_admin can act on any tenant.
 * Same as resolveTenantScope, but for a super_admin with no ?tenantId and no
 * profile tenant, falls back to the sole tenant when exactly one exists
 * (the single-tenant trial). With multiple tenants, super_admin must pass ?tenantId.
 */
export async function resolveBillingTenant(
  request: NextRequest,
  auth: AuthSuccess
): Promise<{ tenantId: string } | { response: NextResponse }> {
  const scope = await resolveTenantScope(request, auth);
  if ('tenantId' in scope) return scope;
  if (auth.role === 'super_admin') {
    const { data } = await supabaseAdmin.from('tenants').select('id').limit(2);
    if (data && data.length === 1) return { tenantId: data[0].id };
  }
  return scope;
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
