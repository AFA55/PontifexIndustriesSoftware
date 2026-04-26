export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/jobs/[id]/work-performed-draft
 * Admin view of ALL operators' in-progress (draft) work-performed state for a job.
 *
 * Returns every daily_job_logs row for the job that has a non-null
 * work_performed_draft, joined with the operator's profile for display.
 * Useful for real-time admin visibility into what operators are logging
 * before they submit end-of-day.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    // Verify the job exists and belongs to the admin's tenant
    const jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id')
      .eq('id', jobId);
    if (tenantId) {
      jobQuery.eq('tenant_id', tenantId);
    }
    const { data: job, error: jobError } = await jobQuery.maybeSingle();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Fetch all log rows for this job that have a draft in progress
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('daily_job_logs')
      .select(
        'id, operator_id, day_number, log_date, work_performed_draft, work_performed_draft_updated_at'
      )
      .eq('job_order_id', jobId)
      .not('work_performed_draft', 'is', null)
      .order('log_date', { ascending: false });

    if (logsError) {
      console.error('Error fetching work-performed drafts (admin):', logsError);
      return NextResponse.json(
        { error: 'Failed to fetch drafts' },
        { status: 500 }
      );
    }

    if (!logs || logs.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Bulk-fetch operator profiles for all unique operator IDs
    const operatorIds = [...new Set(logs.map((l) => l.operator_id))];
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', operatorIds);

    const profileMap: Record<string, { full_name: string | null; email: string | null }> =
      {};
    for (const p of profiles ?? []) {
      profileMap[p.id] = { full_name: p.full_name, email: p.email };
    }

    const result = logs.map((log) => ({
      log_id: log.id,
      operator_id: log.operator_id,
      operator_name: profileMap[log.operator_id]?.full_name ?? 'Unknown',
      operator_email: profileMap[log.operator_id]?.email ?? null,
      day_number: log.day_number,
      log_date: log.log_date,
      draft: log.work_performed_draft,
      updated_at: log.work_performed_draft_updated_at,
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error('Unexpected error in GET admin work-performed-draft:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
