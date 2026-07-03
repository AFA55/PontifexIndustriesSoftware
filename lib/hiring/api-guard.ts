/**
 * Hiring module — shared API route guard.
 *
 * Every authenticated /api/hiring/* route goes through requireHiringAdmin():
 *   1. requireAuth() (Bearer token, lib/api-auth.ts)
 *   2. role must be in HIRING_ADMIN_ROLES (admin / super_admin / operations_manager)
 *   3. tenant scope resolved to a guaranteed non-null tenantId
 *      (super_admin may pass ?tenantId=, else falls back to profile tenant)
 *   4. tenants.features.hiring gate — the module must be enabled for the tenant
 *      (super_admin bypasses the gate; the HIRE front-door tenant is always on)
 *
 * All downstream queries use supabaseAdmin with an explicit
 * .eq('tenant_id', guard.tenantId) — that IS the security boundary here
 * (service role bypasses RLS).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveTenantScope } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { HIRING_ADMIN_ROLES, HIRE_TENANT_ID } from '@/lib/hiring/types';

export interface HiringGuardSuccess {
  ok: true;
  userId: string;
  userEmail: string;
  role: string;
  /** Guaranteed non-null — resolved via resolveTenantScope for super_admin. */
  tenantId: string;
}

export interface HiringGuardFailure {
  ok: false;
  response: NextResponse;
}

export type HiringGuardResult = HiringGuardSuccess | HiringGuardFailure;

export async function requireHiringAdmin(request: NextRequest): Promise<HiringGuardResult> {
  const auth = await requireAuth(request);
  if (!auth.authorized) return { ok: false, response: auth.response };

  if (!HIRING_ADMIN_ROLES.includes(auth.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden. Hiring admin access required.' },
        { status: 403 }
      ),
    };
  }

  const scope = await resolveTenantScope(request, auth);
  if ('response' in scope) return { ok: false, response: scope.response };
  const tenantId = scope.tenantId;

  // Feature gate: tenants.features jsonb must include hiring: true.
  // super_admin bypasses (platform operators manage any tenant); the HIRE
  // front-door tenant is implicitly enabled.
  if (auth.role !== 'super_admin' && tenantId !== HIRE_TENANT_ID) {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('features')
      .eq('id', tenantId)
      .maybeSingle();
    const features = (tenant?.features ?? {}) as Record<string, unknown>;
    if (features.hiring !== true) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'The hiring module is not enabled for this company.' },
          { status: 403 }
        ),
      };
    }
  }

  return {
    ok: true,
    userId: auth.userId,
    userEmail: auth.userEmail,
    role: auth.role,
    tenantId,
  };
}

/** Fire-and-forget hiring_events insert — never blocks or fails the response. */
export function logHiringEvent(row: {
  tenant_id: string;
  job_id?: string | null;
  candidate_id?: string | null;
  event_type: string;
  meta?: Record<string, unknown>;
  actor_id?: string | null;
}): void {
  Promise.resolve(
    supabaseAdmin.from('hiring_events').insert({
      tenant_id: row.tenant_id,
      job_id: row.job_id ?? null,
      candidate_id: row.candidate_id ?? null,
      event_type: row.event_type,
      meta: row.meta ?? {},
      actor_id: row.actor_id ?? null,
    })
  )
    .then(() => {})
    .catch(() => {});
}
