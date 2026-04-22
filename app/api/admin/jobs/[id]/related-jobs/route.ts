export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/jobs/[id]/related-jobs
 * Returns the parent job (if any) and all continuation jobs for a given job.
 *
 * Response: { parent: job|null, continuations: job[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

const JOB_SELECT_FIELDS =
  'id, job_number, status, scheduled_date, project_name, estimated_cost, created_at, parent_job_id';

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    // Fetch this job to find out if it has a parent
    const { data: thisJob, error: thisJobError } = await supabaseAdmin
      .from('job_orders')
      .select('parent_job_id')
      .eq('id', jobId)
      .eq('tenant_id', tenantId)
      .single();

    if (thisJobError || !thisJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Fetch parent job (if this job has one)
    let parent = null;
    if (thisJob.parent_job_id) {
      const { data: parentJob, error: parentError } = await supabaseAdmin
        .from('job_orders')
        .select(JOB_SELECT_FIELDS)
        .eq('id', thisJob.parent_job_id)
        .eq('tenant_id', tenantId)
        .single();

      if (parentError) {
        console.error('Error fetching parent job:', parentError);
        // Non-fatal — return null parent
      } else {
        parent = parentJob;
      }
    }

    // Fetch all continuation jobs (jobs where parent_job_id = this job's id)
    const { data: continuations, error: continuationsError } = await supabaseAdmin
      .from('job_orders')
      .select(JOB_SELECT_FIELDS)
      .eq('parent_job_id', jobId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (continuationsError) {
      console.error('Error fetching continuation jobs:', continuationsError);
      return NextResponse.json({ error: 'Failed to fetch related jobs' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        parent,
        continuations: continuations ?? [],
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /related-jobs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
