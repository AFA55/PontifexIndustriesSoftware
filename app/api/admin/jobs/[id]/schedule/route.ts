/**
 * PUT /api/admin/jobs/[id]/schedule
 * Update scheduled_date and end_date for a job.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await params;
    const body = await request.json();
    const { scheduled_date, end_date } = body;

    if (!scheduled_date) {
      return NextResponse.json({ error: 'scheduled_date is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('job_orders')
      .update({
        scheduled_date,
        end_date: end_date || null,
      })
      .eq('id', jobId)
      .eq('tenant_id', auth.tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        tenant_id: auth.tenantId,
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
