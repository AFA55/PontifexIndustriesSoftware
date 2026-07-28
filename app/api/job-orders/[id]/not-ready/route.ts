export const dynamic = 'force-dynamic';

/**
 * POST /api/job-orders/[id]/not-ready
 *
 * Operator (or admin) reports "we arrived on-site but the contractor/site
 * wasn't ready". Records reason + GPS photos + an on-site signature (the
 * contractor rep signs on the operator's phone), parks the job to `on_hold`
 * (the Pending Jobs bucket), and notifies the job's project manager.
 *
 * Body: { reason, photo_urls?: string[], signature_data?: string, signer_name?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { sendNotification } from '@/lib/send-reminder';

const ADMIN_ROLES = ['super_admin', 'operations_manager', 'admin', 'salesman', 'shop_manager', 'inventory_manager', 'supervisor'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json().catch(() => ({}));
    const reason = (body.reason ?? '').toString().trim();
    const photoUrls = Array.isArray(body.photo_urls) ? body.photo_urls.filter(Boolean) : [];
    const signatureData = (body.signature_data ?? '').toString() || null;
    const signerName = (body.signer_name ?? '').toString().trim() || null;

    if (!reason) {
      return NextResponse.json({ error: 'Please describe what was not ready.' }, { status: 400 });
    }

    // A null tenant would bypass the tenant filter below AND the admin-role
    // short-circuit in the authz check — require it explicitly (0 null-tenant
    // users exist today, but don't leave the hole open).
    const tenantId = await getTenantId(auth.userId);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
    }

    const { data: job, error: jobErr } = await supabaseAdmin
      .from('job_orders')
      .select('id, tenant_id, assigned_to, helper_assigned_to, job_number, customer_name, project_manager_id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();
    if (jobErr || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Authz: the assigned operator/helper on the job, or an office/admin role.
    const isAdmin = ADMIN_ROLES.includes(auth.role);
    if (!isAdmin && job.assigned_to !== auth.userId && job.helper_assigned_to !== auth.userId) {
      return NextResponse.json({ error: 'Not authorized for this job' }, { status: 403 });
    }

    const nowIso = new Date().toISOString();

    const { data: report, error: repErr } = await supabaseAdmin
      .from('job_not_ready_reports')
      .insert({
        job_order_id: id,
        tenant_id: job.tenant_id ?? tenantId ?? null,
        reported_by: auth.userId,
        reason,
        photo_urls: photoUrls,
        signature_data: signatureData,
        signer_name: signerName,
        arrived_at: nowIso,
        signed_at: signatureData ? nowIso : null,
      })
      .select()
      .single();

    if (repErr) {
      console.error('Error saving not-ready report:', repErr);
      return NextResponse.json({ error: 'Failed to save the report' }, { status: 500 });
    }

    // Park the job to on_hold → Pending Jobs (off the active board).
    const { error: parkErr } = await supabaseAdmin
      .from('job_orders')
      .update({
        status: 'on_hold',
        on_hold: true,
        on_hold_reason: `Site not ready: ${reason}`.slice(0, 500),
        on_hold_placed_at: nowIso,
        on_hold_placed_by: auth.userId,
        updated_at: nowIso,
      })
      .eq('id', id);
    // Parking is the whole point — if it fails, don't report success (the job
    // would stay on the active board while everyone believes it's parked).
    if (parkErr) {
      console.error('Error parking job to on_hold:', parkErr);
      return NextResponse.json({ error: 'Report saved, but the job could not be moved to Pending. Please try again.' }, { status: 500 });
    }

    // Notify the project manager (fire-and-forget — never blocks the response).
    if (job.project_manager_id) {
      sendNotification({
        userId: job.project_manager_id,
        tenantId: job.tenant_id ?? null,
        category: 'general',
        title: 'Job not ready ⚠️',
        message: `${job.job_number || 'A job'} for ${job.customer_name || 'a customer'} — the crew arrived but the site wasn't ready. It's in Pending Jobs for review.`,
        inAppType: 'warning',
        jobOrderId: id,
        actionUrl: '/dashboard/admin/pending-jobs',
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error('Unexpected error in POST /not-ready:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
