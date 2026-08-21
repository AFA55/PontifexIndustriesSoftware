export const dynamic = 'force-dynamic';

/**
 * PUT /api/admin/jobs/[id]/schedule
 * Update scheduled_date and end_date for a job.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { releaseParkedJobFields } from '@/lib/job-phases';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await params;
    const body = await request.json();
    const { scheduled_date, end_date } = body;

    if (!scheduled_date) {
      return NextResponse.json({ error: 'scheduled_date is required' }, { status: 400 });
    }

    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    }

    // P0-3: verify the job belongs to caller's tenant before mutating
    const { data: jobCheck } = await supabaseAdmin
      .from('job_orders')
      .select(
        'id, tenant_id, status, assigned_to, helper_assigned_to, on_hold, on_hold_placed_at, on_hold_released_at'
      )
      .eq('id', jobId)
      .maybeSingle();
    if (!jobCheck || jobCheck.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from('job_orders')
      .update({
        scheduled_date,
        end_date: end_date || null,
        scheduled_end_date: end_date || null,
        // Putting a parked job back on the calendar un-parks it. Giving it a
        // date is the office saying it is happening again; leaving the flag set
        // is how a job ends up scheduled AND parked at the same time.
        //
        // `scheduling: true` is stated OUTRIGHT because this route exists to
        // write a date and refuses the request without one (400, above). The
        // crew it passes is the job's EXISTING crew, which on its own says
        // nothing about whether the office is re-dating the job or emptying
        // it — so the release cannot be left to infer it. See the precondition
        // note on releaseParkedJobFields().
        ...releaseParkedJobFields({
          job: jobCheck,
          operatorId: jobCheck.assigned_to ?? null,
          helperId: jobCheck.helper_assigned_to ?? null,
          scheduling: true,
        }),
      })
      .eq('id', jobId)
      .eq('tenant_id', tenantId);

    if (error) {
      return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        tenant_id: tenantId,
        actor_id: auth.userId,
        action: 'job_schedule_updated',
        resource_type: 'job_order',
        resource_id: jobId,
        details: { scheduled_date, end_date: end_date || null },
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, message: 'Schedule updated.' });
  } catch (err) {
    console.error('Error in PUT /api/admin/jobs/[id]/schedule:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
