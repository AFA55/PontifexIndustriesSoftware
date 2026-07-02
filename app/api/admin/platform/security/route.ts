export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/platform/security — Platform Hub security signals (super_admin only).
 *
 * Per-tenant signals are live-queried straight from `profiles`/`timecards`/`audit_logs`.
 * Platform-wide posture (RLS coverage, dependency audit, IDOR sweep) is NOT computed
 * here — there is no safe way to run schema introspection or `npm audit` from a
 * request handler without turning this route into a SQL-execution surface, so that
 * data lives as a static, dated summary in the page itself (see
 * app/dashboard/platform/security/page.tsx). This route never fabricates a number
 * it can't back with a real query.
 *
 * Tenant names are resolved via a two-step lookup (not a PostgREST embed — see
 * health-alerts/route.ts's lookupTenantNames / lib/tools/command-center-tools.ts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, isTableNotFoundError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/** Admin-tier roles per lib/rbac.ts ROLE_RANK (super_admin=8, operations_manager=7, admin=6). */
const ADMIN_TIER_ROLES = new Set(['super_admin', 'operations_manager', 'admin']);

/** Flag a tenant when more than this share of its users sit in an admin-tier role. */
const OVER_PROVISION_RATIO = 0.4;
/** ...but only once a tenant has enough users for the ratio to mean anything. */
const OVER_PROVISION_MIN_USERS = 3;

/** A profile is "stale" when it's active but has shown no timecard activity in this window. */
const STALE_ACCOUNT_DAYS = 60;

interface TenantSecuritySignal {
  tenantId: string;
  tenantName: string;
  companyCode: string | null;
  totalUsers: number;
  activeUsers: number;
  roleDistribution: Record<string, number>;
  adminTierCount: number;
  adminTierRatio: number;
  overProvisioned: boolean;
  staleAccountCount: number;
  staleAccounts: { id: string; email: string; fullName: string | null }[];
  recentAuditEvents: number;
}

async function lookupTenantNames(tenantIds: string[]): Promise<Map<string, { name: string; company_code: string | null }>> {
  const uniqueIds = [...new Set(tenantIds)];
  if (uniqueIds.length === 0) return new Map();
  const { data } = await supabaseAdmin.from('tenants').select('id, name, company_code').in('id', uniqueIds);
  return new Map((data ?? []).map((t) => [t.id, { name: t.name, company_code: t.company_code }]));
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { data: tenants, error: tenantsError } = await supabaseAdmin
    .from('tenants')
    .select('id, name, company_code');

  if (tenantsError) {
    return NextResponse.json({ error: tenantsError.message }, { status: 500 });
  }

  const tenantIds = (tenants ?? []).map((t) => t.id);
  const namesByTenant = await lookupTenantNames(tenantIds);

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, role, active, tenant_id, deleted_at')
    .in('tenant_id', tenantIds);

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const liveProfiles = (profiles ?? []).filter((p) => !p.deleted_at);

  // profiles has no last_sign_in_at/last_active_at column — the honest proxy
  // available today is "most recent timecard row", which only covers users
  // who clock in/out (office-only roles will show as stale even if they log
  // in daily; label this clearly in the UI rather than pretend it's a login signal).
  const since = new Date(Date.now() - STALE_ACCOUNT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let recentTimecardUserIds = new Set<string>();
  let timecardsAvailable = true;
  const { data: recentTimecards, error: timecardsError } = await supabaseAdmin
    .from('timecards')
    .select('user_id')
    .gte('created_at', since);

  if (timecardsError) {
    if (isTableNotFoundError(timecardsError)) {
      timecardsAvailable = false;
    } else {
      return NextResponse.json({ error: timecardsError.message }, { status: 500 });
    }
  } else {
    recentTimecardUserIds = new Set((recentTimecards ?? []).map((t) => t.user_id));
  }

  let auditLogsAvailable = true;
  let auditCountsByTenant = new Map<string, number>();
  const { data: recentAudit, error: auditError } = await supabaseAdmin
    .from('audit_logs')
    .select('tenant_id')
    .gte('created_at', since);

  if (auditError) {
    if (isTableNotFoundError(auditError)) {
      auditLogsAvailable = false;
    } else {
      return NextResponse.json({ error: auditError.message }, { status: 500 });
    }
  } else {
    auditCountsByTenant = (recentAudit ?? []).reduce((map, row) => {
      if (!row.tenant_id) return map;
      map.set(row.tenant_id, (map.get(row.tenant_id) || 0) + 1);
      return map;
    }, new Map<string, number>());
  }

  const byTenant = new Map<string, typeof liveProfiles>();
  for (const p of liveProfiles) {
    if (!p.tenant_id) continue;
    const list = byTenant.get(p.tenant_id) || [];
    list.push(p);
    byTenant.set(p.tenant_id, list);
  }

  const signals: TenantSecuritySignal[] = tenantIds.map((tenantId) => {
    const tenantMeta = namesByTenant.get(tenantId);
    const tenantProfiles = byTenant.get(tenantId) || [];
    const totalUsers = tenantProfiles.length;
    const activeProfiles = tenantProfiles.filter((p) => p.active);
    const activeUsers = activeProfiles.length;

    const roleDistribution: Record<string, number> = {};
    let adminTierCount = 0;
    for (const p of tenantProfiles) {
      roleDistribution[p.role] = (roleDistribution[p.role] || 0) + 1;
      if (ADMIN_TIER_ROLES.has(p.role)) adminTierCount += 1;
    }
    const adminTierRatio = totalUsers > 0 ? adminTierCount / totalUsers : 0;

    const staleAccounts = timecardsAvailable
      ? activeProfiles
          .filter((p) => !recentTimecardUserIds.has(p.id))
          .map((p) => ({ id: p.id, email: p.email, fullName: p.full_name }))
      : [];

    return {
      tenantId,
      tenantName: tenantMeta?.name || 'Unknown tenant',
      companyCode: tenantMeta?.company_code || null,
      totalUsers,
      activeUsers,
      roleDistribution,
      adminTierCount,
      adminTierRatio,
      overProvisioned: totalUsers >= OVER_PROVISION_MIN_USERS && adminTierRatio > OVER_PROVISION_RATIO,
      staleAccountCount: staleAccounts.length,
      staleAccounts: staleAccounts.slice(0, 20),
      recentAuditEvents: auditCountsByTenant.get(tenantId) || 0,
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      tenants: signals,
      timecardsAvailable,
      auditLogsAvailable,
      staleWindowDays: STALE_ACCOUNT_DAYS,
      staleAccountCaveat:
        'Stale = no timecard activity in the window. profiles has no login timestamp, so office-only roles that never clock in will always show as stale — this is an activity proxy, not a real last-login signal.',
    },
  });
}
