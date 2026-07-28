export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/pending-jobs/[id]/reactivate — office/admin (requireSalesStaff)
 * Pushes a parked (on_hold) job back onto the active schedule, optionally with
 * new dates. Clears the on-hold state and notifies the assigned operator if the
 * job is dispatched.
 *
 * Body: { scheduled_date?: string, end_date?: string|null }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { sendNotification } from '@/lib/send-reminder';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json().catch(() => ({}));
    const scheduledDate = (body.scheduled_date ?? '').toString().trim() || null;
    const endDate = body.end_date === null ? null : (body.end_date ?? '').toString().trim() || undefined;

    // Load the parked job (tenant-scoped).
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, tenant_id, status, assigned_to, job_number, customer_name')
      .eq('id', id);
    if (auth.tenantId) jobQuery = jobQuery.eq('tenant_id', auth.tenantId);
    const { data: job, error: jobErr } = await jobQuery.single();
    if (jobErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    // Reactivate: assigned → 'assigned' (still dispatched to an operator),
    // otherwise back to 'scheduled'. Clear the on-hold state.
    const nowIso = new Date().toISOString();
    const updateFields: Record<string, any> = {
      status: job.assigned_to ? 'assigned' : 'scheduled',
      on_hold: false,
      on_hold_released_at: nowIso,
      updated_at: nowIso,
    };
    if (scheduledDate) updateFields.scheduled_date = scheduledDate;
    if (endDate !== undefined) updateFields.end_date = endDate;

    const { error: updErr } = await supabaseAdmin.from('job_orders').update(updateFields).eq('id', id);
    if (updErr) {
      console.error('Error reactivating job:', updErr);
      return NextResponse.json({ error: 'Failed to reactivate the job' }, { status: 500 });
    }

    // Notify the assigned operator that the job is back on their schedule.
    if (job.assigned_to) {
      sendNotification({
        userId: job.assigned_to,
        tenantId: job.tenant_id ?? null,
        category: 'job_dispatched',
        title: 'Job back on your schedule 📋',
        message: `${job.job_number || 'A job'} for ${job.customer_name || 'a customer'} is ready again${scheduledDate ? ` for ${scheduledDate}` : ''}.`,
        inAppType: 'job_order',
        jobOrderId: id,
        actionUrl: '/dashboard/my-jobs',
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in POST /reactivate:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
