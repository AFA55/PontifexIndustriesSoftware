export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/jobs/[id]/commission-rate
 *
 * Set or clear the per-job commission rate override on a job_order.
 * `null` clears the override → commission falls back to the salesman's
 * profiles.commission_rate_default.
 *
 * Body:
 *   {
 *     commission_rate: number | null;  // 0–100, or null to clear
 *   }
 *
 * Auth: requireAdmin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await params;

    const body = await request.json().catch(() => ({} as any));
    const { commission_rate } = body ?? {};

    // Validate: must be null OR a number 0–100.
    let resolved: number | null;
    if (commission_rate === null || commission_rate === undefined) {
      resolved = null;
    } else {
      const parsed = Number(commission_rate);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        return NextResponse.json(
          { error: 'commission_rate must be a number between 0 and 100, or null' },
          { status: 400 }
        );
      }
      resolved = parsed;
    }

    // Verify the job exists and tenant-check.
    const { data: job, error: fetchErr } = await supabaseAdmin
      .from('job_orders')
      .select('id, tenant_id, job_number, commission_rate')
      .eq('id', jobId)
      .maybeSingle();

    if (fetchErr || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (auth.role !== 'super_admin') {
      if (!auth.tenantId || job.tenant_id !== auth.tenantId) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
    }

    const previousRate = job.commission_rate;

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('job_orders')
      .update({ commission_rate: resolved })
      .eq('id', jobId)
      .select('id, job_number, commission_rate, tenant_id')
      .single();

    if (updateErr) {
      console.error('[jobs/commission-rate] update error:', updateErr.message);
      return NextResponse.json({ error: 'Failed to update commission rate' }, { status: 500 });
    }

    // Fire-and-forget audit log.
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        tenant_id: job.tenant_id,
        user_id: auth.userId,
        user_email: auth.userEmail,
        user_role: auth.role,
        action: 'admin_update_job_commission_rate',
        resource_type: 'job_order',
        resource_id: jobId,
        details: {
          job_number: job.job_number,
          previous_rate: previousRate,
          new_rate: resolved,
        },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    console.error('[jobs/commission-rate] unexpected error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
