export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/jobs/[id]/notify-salesperson
 * POST — Notify the assigned salesperson that a job is ready for billing
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { notifySalesperson } from '@/lib/notify-salesperson';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    // Fetch job and verify it belongs to this tenant
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, job_number, project_name, salesperson_id')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);

    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (!job.salesperson_id) {
      return NextResponse.json(
        { success: false, error: 'No salesperson assigned to this job' },
        { status: 422 }
      );
    }

    // Route through the shared helper — writes to the `notifications` table
    // with the correct columns (the bell reads from there) AND sends a
    // best-effort email. The previous direct insert into schedule_notifications
    // used wrong column names (user_id/notification_type/is_read instead of
    // recipient_id/type/read) and silently failed every time.
    await notifySalesperson({
      event: 'invoice_ready',
      jobOrderId: jobId,
      recipientUserId: job.salesperson_id,
      tenantId: tenantId || null,
      subjectName: job.job_number,
      customerName: job.project_name || undefined,
    });

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'salesperson_notified',
        entity_type: 'job_order',
        entity_id: jobId,
        details: {
          job_number: job.job_number,
          salesperson_id: job.salesperson_id,
          notification_type: 'job_completed',
        },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data: { notified: true } });
  } catch (error: unknown) {
    console.error('Error in POST /notify-salesperson:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
