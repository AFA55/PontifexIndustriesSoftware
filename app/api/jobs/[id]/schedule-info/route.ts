/**
 * API Route: GET /api/jobs/[id]/schedule-info
 * Returns schedule date info for a job — used by the day-complete page to
 * determine if today is the final scheduled day so we can hide/show the
 * "Continue to Next Day" vs "Complete Job" options intelligently.
 *
 * Auth: requireAuth() — any authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    const { data: job, error } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, scheduled_date, scheduled_end_date, end_date, status')
      .eq('id', jobId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Prefer scheduled_end_date (newer field), fall back to end_date (legacy multi-day field)
    const endDate = (job as any).scheduled_end_date ?? (job as any).end_date ?? null;

    return NextResponse.json({
      success: true,
      data: {
        scheduled_date: (job as any).scheduled_date ?? null,
        scheduled_end_date: endDate,
        status: job.status,
        job_number: job.job_number,
      },
    });
  } catch (err) {
    console.error('Error fetching schedule info:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
