/**
 * Takeoffs module — shared API route guard (same pattern as lib/hiring/api-guard.ts).
 *
 * Every /api/takeoffs/* route goes through requireTakeoffsAccess():
 *   1. requireAuth() (Bearer token)
 *   2. role must be an estimator-capable role
 *   3. tenant scope resolved to a guaranteed non-null tenantId
 *   4. tenants.features.takeoffs gate (super_admin bypasses)
 *
 * All downstream queries use supabaseAdmin with an explicit
 * .eq('tenant_id', guard.tenantId) — that IS the security boundary
 * (service role bypasses RLS).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveTenantScope } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const TAKEOFF_ROLES = ['admin', 'super_admin', 'operations_manager', 'salesman'];

export interface TakeoffsGuardSuccess {
  ok: true;
  userId: string;
  userEmail: string;
  role: string;
  tenantId: string;
}

export interface TakeoffsGuardFailure {
  ok: false;
  response: NextResponse;
}

export type TakeoffsGuardResult = TakeoffsGuardSuccess | TakeoffsGuardFailure;

export async function requireTakeoffsAccess(request: NextRequest): Promise<TakeoffsGuardResult> {
  const auth = await requireAuth(request);
  if (!auth.authorized) return { ok: false, response: auth.response };

  if (!TAKEOFF_ROLES.includes(auth.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden. Takeoffs access required.' }, { status: 403 }),
    };
  }

  const scope = await resolveTenantScope(request, auth);
  if ('response' in scope) return { ok: false, response: scope.response };
  const tenantId = scope.tenantId;

  if (auth.role !== 'super_admin') {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('features')
      .eq('id', tenantId)
      .maybeSingle();
    const features = (tenant?.features ?? {}) as Record<string, unknown>;
    // Absence ⇒ off for takeoffs (opt-in module, like hiring).
    if (features.takeoffs !== true) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'The takeoffs module is not enabled for this company.' },
          { status: 403 }
        ),
      };
    }
  }

  return { ok: true, userId: auth.userId, userEmail: auth.userEmail, role: auth.role, tenantId };
}
