export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/job-orders/[id]/full-detail
 * Fetch complete job order record with resolved operator and helper names.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    // Tenant filtering
    const tenantId = await getTenantId(auth.userId);

    // Fetch full job record
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', id);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Resolve operator name
    let operator_name: string | null = null;
    if (job.assigned_to) {
      const { data: opProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', job.assigned_to)
        .single();
      operator_name = opProfile?.full_name || null;
    }

    // Resolve helper name
    let helper_name: string | null = null;
    if (job.helper_assigned_to) {
      const { data: helpProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', job.helper_assigned_to)
        .single();
      helper_name = helpProfile?.full_name || null;
    }

    // Resolve project manager name (project_manager_id → profiles)
    let project_manager_name: string | null = null;
    if (job.project_manager_id) {
      const { data: pmProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', job.project_manager_id)
        .maybeSingle();
      project_manager_name = pmProfile?.full_name || null;
    }

    // Linked tickets (parent_job_id). Two tickets on the same job = a SECOND
    // CREW dispatched via Duplicate, or added scope. Surfacing the link stops
    // the office reading a copy as a stray double-entry.
    let linked_parent_job_number: string | null = null;
    if (job.parent_job_id) {
      let pq = supabaseAdmin
        .from('job_orders')
        .select('job_number')
        .eq('id', job.parent_job_id);
      if (tenantId) pq = pq.eq('tenant_id', tenantId);
      const { data: parentRow } = await pq.maybeSingle();
      linked_parent_job_number = parentRow?.job_number ?? null;
    }
    let copiesQuery = supabaseAdmin
      .from('job_orders')
      .select('id', { count: 'exact', head: true })
      .eq('parent_job_id', id);
    if (tenantId) copiesQuery = copiesQuery.eq('tenant_id', tenantId);
    const { count: linked_copies_count } = await copiesQuery;

    return NextResponse.json({
      success: true,
      data: {
        ...job,
        operator_name,
        helper_name,
        project_manager_name,
        linked_parent_job_number,
        linked_copies_count: linked_copies_count ?? 0,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching job full detail:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
