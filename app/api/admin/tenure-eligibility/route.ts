export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/tenure-eligibility
 *
 * Read-only view of holiday-pay eligibility by the 60-day rule. Returns the
 * hourly field + shop staff with their hire_date, days employed, and whether
 * they're eligible (≥ 60 days). A NULL hire_date is grandfathered (eligible),
 * matching the holiday apply endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

const ELIGIBLE_ROLES = ['operator', 'apprentice', 'shop_manager', 'shop_help'];
const TENURE_DAYS = 60;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, role, hire_date, active')
    .eq('tenant_id', auth.tenantId)
    .in('role', ELIGIBLE_ROLES)
    .order('full_name');
  if (error) {
    console.error('tenure-eligibility error:', error);
    return NextResponse.json({ error: 'Failed to load employees' }, { status: 500 });
  }

  const todayMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();

  const employees = (data ?? [])
    .filter((p) => p.active !== false)
    .map((p) => {
      let daysEmployed: number | null = null;
      if (p.hire_date) {
        const hiredMs = new Date(`${p.hire_date}T00:00:00`).getTime();
        if (Number.isFinite(hiredMs)) daysEmployed = Math.floor((todayMs - hiredMs) / 86_400_000);
      }
      // NULL hire_date → grandfathered eligible; else eligible when ≥ 60 days.
      const eligible = p.hire_date == null || (daysEmployed != null && daysEmployed >= TENURE_DAYS);
      return {
        id: p.id,
        fullName: p.full_name || 'Unknown',
        role: p.role,
        hireDate: p.hire_date ?? null,
        daysEmployed,
        eligible,
        grandfathered: p.hire_date == null,
      };
    });

  return NextResponse.json({
    success: true,
    data: {
      thresholdDays: TENURE_DAYS,
      eligibleCount: employees.filter((e) => e.eligible).length,
      pendingCount: employees.filter((e) => !e.eligible).length,
      employees,
    },
  });
}
