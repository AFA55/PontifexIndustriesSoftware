export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/platform/health-alerts — open platform_health_alerts for the
 * Platform Hub alerts surface (super_admin only). Tenant names are joined via
 * a two-step lookup (not a PostgREST embed — this repo has a documented
 * embed-fragility gotcha, see lib/tools/command-center-tools.ts's lookupNames).
 *
 * Returns: { success, data: [{ id, tenantId, tenantName, checkType, severity,
 *   message, details, createdAt }] } sorted critical → warning → info, newest first.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

async function lookupTenantNames(tenantIds: (string | null)[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(tenantIds.filter((id): id is string => !!id))];
  if (uniqueIds.length === 0) return new Map();
  const { data } = await supabaseAdmin.from('tenants').select('id, name').in('id', uniqueIds);
  return new Map((data ?? []).map((t) => [t.id, t.name]));
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { data: alerts, error } = await supabaseAdmin
    .from('platform_health_alerts')
    .select('id, tenant_id, check_type, severity, message, details, created_at')
    .eq('resolved', false)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = alerts ?? [];
  const namesByTenant = await lookupTenantNames(rows.map((r) => r.tenant_id));

  const data = rows
    .map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      tenantName: r.tenant_id ? namesByTenant.get(r.tenant_id) || 'Unknown tenant' : 'Platform-wide',
      checkType: r.check_type,
      severity: r.severity,
      message: r.message,
      details: r.details,
      createdAt: r.created_at,
    }))
    .sort((a, b) => {
      const sevDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
      if (sevDiff !== 0) return sevDiff;
      return b.createdAt.localeCompare(a.createdAt);
    });

  return NextResponse.json({ success: true, data });
}
