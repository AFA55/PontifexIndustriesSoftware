export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/pending-jobs/[id]/park — office/admin (requireSalesStaff)
 * Manually moves a scheduled job OFF the active board into the Pending Jobs
 * bucket (status='on_hold'), with an optional reason. The office pushes it back
 * up later from the Pending Jobs page.
 *
 * Body: { reason?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { toLocalYMD } from '@/lib/dates';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json().catch(() => ({}));
    const reason = (body.reason ?? '').toString().trim() || null;

    // Load the job (tenant-scoped).
    let jobQuery = supabaseAdmin.from('job_orders').select('id, status').eq('id', id);
    if (auth.tenantId) jobQuery = jobQuery.eq('tenant_id', auth.tenantId);
    const { data: job, error: jobErr } = await jobQuery.single();
    if (jobErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (job.status === 'completed') {
      return NextResponse.json({ error: 'Completed jobs cannot be moved to Pending.' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    let updateQuery = supabaseAdmin
      .from('job_orders')
      .update({
        status: 'on_hold',
        on_hold: true,
        on_hold_reason: reason || 'Moved to Pending by office',
        on_hold_placed_at: nowIso,
        on_hold_placed_by: auth.userId,
        updated_at: nowIso,
      })
      .eq('id', id);
    if (auth.tenantId) updateQuery = updateQuery.eq('tenant_id', auth.tenantId); // defense-in-depth
    const { error: updErr } = await updateQuery;
    if (updErr) {
      console.error('Error parking job:', updErr);
      return NextResponse.json({ error: 'Failed to move the job to Pending' }, { status: 500 });
    }

    // ── Close the live phase, if this job has any ───────────────────────────
    // Only jobs that have already been restarted carry phase rows; a job on its
    // first run has none, and parking it deliberately writes nothing. That is
    // what lets this feature ship without a backfill and leaves the five jobs
    // already sitting parked in production untouched.
    //
    // Fire-and-forget on purpose: the park itself has landed, and the ticket
    // computes the visible gap from the days actually worked either side, not
    // from this stamp. It only labels the pause. A missing table (migration not
    // yet applied) lands here harmlessly too.
    Promise.resolve(
      supabaseAdmin
        .from('job_phases')
        // toLocalYMD, never `nowIso.slice(0, 10)` — that is the UTC date, which
        // is the previous day for most of the evening in US timezones and would
        // print a pause that started a day early.
        .update({ parked_on: toLocalYMD(), park_reason: reason, parked_by: auth.userId })
        .eq('job_order_id', id)
        .eq('tenant_id', auth.tenantId)
        .is('parked_on', null)
    )
      .then(({ error }) => {
        if (error) console.error('park: closing the live phase failed:', error);
      })
      .catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in POST /park:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
