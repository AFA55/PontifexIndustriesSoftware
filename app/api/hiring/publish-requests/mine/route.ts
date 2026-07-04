export const dynamic = 'force-dynamic';

/**
 * API Route: /api/hiring/publish-requests/mine?jobId=
 *  GET — the LATEST publish request for one of the caller's jobs. Drives
 *        the customer-facing "Ad review" status line on the job Overview
 *        tab (pending / approved / published / rejected + note).
 *
 * Auth: requireHiringAdmin — tenant-scoped; a tenant only ever sees its
 * own requests (explicit tenant_id filter, house pattern).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireHiringAdmin } from '@/lib/hiring/api-guard';

export async function GET(request: NextRequest) {
  const guard = await requireHiringAdmin(request);
  if (!guard.ok) return guard.response;

  const jobId = request.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'jobId query parameter is required' }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('hiring_publish_requests')
      .select('id, job_id, status, review_note, reviewed_at, channels, daily_budget, created_at, updated_at')
      .eq('tenant_id', guard.tenantId)
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('hiring/publish-requests/mine GET error:', error);
      return NextResponse.json({ error: 'Failed to load publish request' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { request: data ?? null } });
  } catch (err) {
    console.error('Unexpected error in hiring/publish-requests/mine GET:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
