export const dynamic = 'force-dynamic';

/**
 * API Route: DELETE /api/admin/jobs/[id]
 * Soft-deletes a job by setting deleted_at + status='cancelled'.
 * Hard deletion is intentionally avoided: job_daily_assignments (payroll audit
 * records) reference job_orders with ON DELETE RESTRICT, so a hard DELETE would
 * be blocked at the DB level once any operator has been assigned to the job.
 * Keeping deleted_at lets us answer "was operator X assigned on Thursday?" for
 * payroll disputes even after the job is removed from the UI.
 *
 * DELETE — requireAdmin, tenant-scoped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    // Verify the job exists and belongs to this tenant.
    let query = supabaseAdmin
      .from('job_orders')
      .select('id, job_number, tenant_id, deleted_at')
      .eq('id', jobId);
    if (tenantId) query = query.eq('tenant_id', tenantId);
    const { data: job, error: jobError } = await query.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.deleted_at) {
      // Already soft-deleted — treat as success (idempotent).
      return NextResponse.json({ success: true, data: { id: jobId } });
    }

    // Soft-delete: mark deleted_at and cancel the job.
    // job_daily_assignments FK is ON DELETE RESTRICT so hard-deleting would fail
    // anyway once an operator has been assigned — soft-delete is the only safe path.
    const { error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update({
        deleted_at: new Date().toISOString(),
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('[DELETE /jobs] soft-delete failed', { jobId, updateError });
      return NextResponse.json(
        { error: 'Failed to delete job', debug: updateError.message },
        { status: 500 }
      );
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: auth.userId,
        user_email: auth.userEmail,
        user_role: auth.role,
        action: 'job.delete',
        resource_type: 'job_order',
        resource_id: jobId,
        details: { job_number: job.job_number, soft_delete: true },
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data: { id: jobId } });
  } catch (error: unknown) {
    console.error('Unexpected error in DELETE /jobs/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
