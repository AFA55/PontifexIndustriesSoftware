export const dynamic = 'force-dynamic';

/**
 * API Route: DELETE /api/admin/jobs/[id]
 * Permanently removes a job and all related records (scope, progress,
 * completion requests, invoices with only this job's line items, etc.)
 * using the public.delete_job_order_cascade(uuid) RPC.
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

    // Verify the job exists. Non-super-admins are scoped to their tenant.
    let query = supabaseAdmin
      .from('job_orders')
      .select('id, job_number, tenant_id')
      .eq('id', jobId);
    if (tenantId) query = query.eq('tenant_id', tenantId);
    const { data: job, error: jobError } = await query.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const { error: rpcError } = await supabaseAdmin.rpc('delete_job_order_cascade', {
      p_job_id: jobId,
    });

    if (rpcError) {
      console.error('[DELETE /jobs] cascade failed', { jobId, rpcError });
      return NextResponse.json(
        { error: 'Failed to delete job', debug: rpcError.message },
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
        details: { job_number: job.job_number },
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data: { id: jobId } });
  } catch (error: unknown) {
    console.error('Unexpected error in DELETE /jobs/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
