export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireSalesStaff } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/admin/active-jobs-summary
 * Returns a compact list of active jobs (in_progress, on_site, in_route, assigned)
 * with operator name and work_items count for the admin dashboard card.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    // Fetch active jobs
    const { data: jobsRaw, error: jobsError } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, assigned_to, status, scheduled_date, arrival_time')
      .eq('tenant_id', auth.tenantId)
      .in('status', ['assigned', 'in_route', 'on_site', 'in_progress'])
      .order('scheduled_date', { ascending: true })
      .limit(20);

    if (jobsError) {
      return NextResponse.json({ error: 'Failed to fetch active jobs' }, { status: 500 });
    }

    const jobs = jobsRaw ?? [];

    if (jobs.length === 0) {
      return NextResponse.json({ success: true, data: [] });
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

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('active-jobs-summary error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
