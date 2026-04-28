export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireSalesStaff } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Keep this list in sync with app/api/admin/active-jobs/route.ts so the
// dashboard summary card matches the full list.
const FULL_ADMIN_ROLES = ['super_admin', 'operations_manager', 'admin'] as const;

/**
 * GET /api/admin/active-jobs-summary
 * Returns a compact list of active jobs (in_progress, on_site, in_route, assigned)
 * with operator name and work_items count for the admin dashboard card.
 *
 * Role scoping mirrors /api/admin/active-jobs:
 *  - super_admin / operations_manager / admin: see all tenant jobs (or self if `?mine=true`)
 *  - salesman / supervisor / etc.: ALWAYS scoped to created_by = self
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const isFullAdmin = (FULL_ADMIN_ROLES as readonly string[]).includes(auth.role);
    const mineFlag = request.nextUrl.searchParams.get('mine') === 'true';
    const shouldScope = !isFullAdmin || mineFlag;

    // Fetch active jobs
    let jobsQuery = supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, assigned_to, status, scheduled_date, arrival_time, created_by')
      .eq('tenant_id', auth.tenantId)
      .in('status', ['assigned', 'in_route', 'on_site', 'in_progress'])
      .order('scheduled_date', { ascending: true })
      .limit(20);

    if (shouldScope) {
      jobsQuery = jobsQuery.eq('created_by', auth.userId);
    }

    const { data: jobsRaw, error: jobsError } = await jobsQuery;

    if (jobsError) {
      return NextResponse.json({ error: 'Failed to fetch active jobs' }, { status: 500 });
    }

    const jobs = jobsRaw ?? [];

    if (jobs.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        scope: {
          is_scoped: shouldScope,
          role: auth.role,
          scoped_to_user: shouldScope ? auth.userId : null,
        },
      });
    }

    // Fetch operator names
    const operatorIds = [...new Set(jobs.map((j: any) => j.assigned_to).filter(Boolean))];
    let profileMap: Record<string, string> = {};
    if (operatorIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', operatorIds);
      for (const p of profiles ?? []) {
        profileMap[p.id] = p.full_name ?? '';
      }
    }

    // Fetch work_items counts per job
    const jobIds = jobs.map((j: any) => j.id);
    let workCountMap: Record<string, number> = {};
    if (jobIds.length > 0) {
      const { data: workItems } = await supabaseAdmin
        .from('work_items')
        .select('job_id')
        .in('job_id', jobIds);
      for (const wi of workItems ?? []) {
        workCountMap[wi.job_id] = (workCountMap[wi.job_id] ?? 0) + 1;
      }
    }

    const data = jobs.map((j: any) => ({
      id: j.id,
      job_number: j.job_number,
      customer_name: j.customer_name,
      operator_name: j.assigned_to ? (profileMap[j.assigned_to] ?? null) : null,
      status: j.status,
      scheduled_date: j.scheduled_date,
      scheduled_time: j.arrival_time ?? null,
      work_items_count: workCountMap[j.id] ?? 0,
    }));

    return NextResponse.json({
      success: true,
      data,
      scope: {
        is_scoped: shouldScope,
        role: auth.role,
        scoped_to_user: shouldScope ? auth.userId : null,
      },
    });
  } catch (err) {
    console.error('active-jobs-summary error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
