/**
 * Opt-in, per-tenant MODULE-GATING helper for API routes (server-side).
 *
 * ⚠️ OPT-IN / CURRENTLY UNUSED: this helper is NOT wired into any existing
 * route. It exists so that FUTURE / NEW non-core routes can voluntarily refuse
 * a request when the acting tenant has explicitly disabled the relevant module
 * in their switchboard. Do NOT retrofit it onto existing routes, and NEVER
 * apply it to a `core` module (auth/jobs/notifications/billing/etc.) — doing so
 * could 404 a live tenant mid-session.
 *
 * Semantics mirror `isModuleEnabled` (lib/features.ts):
 *  - core / absent / unknown module key  ⇒  allowed (default-ON)
 *  - module key explicitly set to false  ⇒  403 'Module not enabled for this account'
 *
 * FAIL-OPEN: any error resolving the tenant or loading its features returns
 * `allowed: true`. A transient DB hiccup must never lock a tenant out of a
 * feature they actually have. The switchboard is subtractive only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveTenantScope, type AuthSuccess } from '@/lib/api-auth';
import { isModuleEnabled, type ModuleKey } from '@/lib/features';

export interface ModuleGateResult {
  /** True when the request may proceed (core / absent / unknown / fail-open). */
  allowed: boolean;
  /** Populated only when `allowed` is false — a ready-to-return 403 response. */
  response?: NextResponse;
}

/**
 * Check whether the acting tenant has `moduleKey` enabled.
 *
 * @example  // in a FUTURE non-core route, after requireAdmin(request):
 *   const gate = await requireModule(request, auth, 'voice_checkout');
 *   if (!gate.allowed) return gate.response;
 *
 * @param request   the incoming request (used to resolve a super_admin's ?tenantId)
 * @param auth      a successful auth result from requireAuth/requireAdmin/etc.
 * @param moduleKey the canonical module this route belongs to
 */
export async function requireModule(
  request: NextRequest,
  auth: AuthSuccess,
  moduleKey: ModuleKey
): Promise<ModuleGateResult> {
  try {
    // Resolve which tenant we're acting on (own tenant, or super_admin's ?tenantId).
    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) {
      // Could not resolve a tenant — fail OPEN rather than block the request.
      return { allowed: true };
    }

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('features')
      .eq('id', scope.tenantId)
      .maybeSingle();

    // Any lookup error ⇒ fail OPEN (never lock a tenant out on a DB hiccup).
    if (error) return { allowed: true };

    const features = (data?.features ?? {}) as Record<string, unknown>;

    // core / absent / unknown ⇒ allowed; explicit false ⇒ blocked.
    if (isModuleEnabled(moduleKey, features)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      response: NextResponse.json(
        { error: 'Module not enabled for this account' },
        { status: 403 }
      ),
    };
  } catch {
    // Fail OPEN on any unexpected error.
    return { allowed: true };
  }
}
