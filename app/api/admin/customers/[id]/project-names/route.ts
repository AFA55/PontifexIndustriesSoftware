export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/customers/[id]/project-names
 * Returns all unique project names used by a customer across their job history.
 * Used by the smart schedule form for project name suggestions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSalesStaff } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: customerId } = await params;

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    // Fetch all jobs for this customer that have a non-empty project_name
    const { data: jobs, error } = await supabaseAdmin
      .from('job_orders')
      .select('project_name, scheduled_date')
      .eq('customer_id', customerId)
      .eq('tenant_id', auth.tenantId)
      .not('project_name', 'is', null)
      .neq('project_name', '')
      .order('scheduled_date', { ascending: false });

    if (error) {
      console.error('Error fetching project names:', error);
      return NextResponse.json({ success: true, data: [] });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Group by project_name — deduplicate and aggregate
    const projectMap = new Map<string, { last_used: string; job_count: number }>();

    for (const job of jobs) {
      const name = job.project_name as string;
      const date = (job.scheduled_date as string) || '';

      if (!projectMap.has(name)) {
        projectMap.set(name, { last_used: date, job_count: 1 });
      } else {
        const existing = projectMap.get(name)!;
        existing.job_count += 1;
        if (date > existing.last_used) {
          existing.last_used = date;
        }
      }
    }

    // Convert to array, sort by last_used DESC, limit 20
    const data = Array.from(projectMap.entries())
      .map(([project_name, stats]) => ({
        project_name,
        last_used: stats.last_used,
        job_count: stats.job_count,
      }))
      .sort((a, b) => b.last_used.localeCompare(a.last_used))
      .slice(0, 20);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in project-names GET:', error);
    return NextResponse.json({ success: true, data: [] });
  }
}
