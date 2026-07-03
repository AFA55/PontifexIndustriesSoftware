export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/hiring/jobs/[id]/candidates
 * Optional query param: ?status=unreviewed|shortlisted|rejected
 *
 * Lists a job's candidates (excludes soft-deleted), newest applications first.
 * Response: { success, data: { candidates } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireHiringAdmin } from '@/lib/hiring/api-guard';
import { CANDIDATE_STATUSES, type CandidateStatus } from '@/lib/hiring/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireHiringAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  if (status && !CANDIDATE_STATUSES.includes(status as CandidateStatus)) {
    return NextResponse.json(
      { error: `Invalid status filter. Must be one of: ${CANDIDATE_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const { data: job } = await supabaseAdmin
      .from('hiring_jobs')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', guard.tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    let query = supabaseAdmin
      .from('hiring_candidates')
      .select('*')
      .eq('job_id', id)
      .eq('tenant_id', guard.tenantId)
      .is('deleted_at', null)
      .order('applied_at', { ascending: false });
    if (status) query = query.eq('status', status);

    const { data: candidates, error } = await query;
    if (error) {
      console.error('hiring candidates GET error:', error);
      return NextResponse.json({ error: 'Failed to load candidates' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { candidates: candidates || [] } });
  } catch (err) {
    console.error('Unexpected error in hiring/jobs/[id]/candidates GET:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
