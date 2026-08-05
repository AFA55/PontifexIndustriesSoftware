export const dynamic = 'force-dynamic';

/**
 * GET  /api/job-orders/[id]/waiver — does this job need a waiver, is it signed?
 * POST /api/job-orders/[id]/waiver — send or re-send it to the site contact.
 *
 * The operator's screen calls GET before work starts so the crew can see
 * "Waiver signed ✓" or a "Resend waiver" button, and POST when they press it.
 *
 * Anyone on the job (or an admin) may read and resend. Resending is a low-risk,
 * idempotent action — it re-delivers the SAME link rather than minting a new
 * document — and the crew on site are exactly the people who need it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { getWaiverStatus, sendWaiver } from '@/lib/waiver-dispatch';

type RouteContext = { params: Promise<{ id: string }> };

const ADMIN_ROLES = ['admin', 'super_admin', 'operations_manager', 'supervisor'];

/** Is this person on the job (lead, helper, or crew) — or an admin? */
async function canAccessJob(
  jobId: string,
  userId: string,
  role: string | null | undefined,
  tenantId: string | null
): Promise<{ ok: boolean; found: boolean }> {
  let q = supabaseAdmin
    .from('job_orders')
    .select('id, assigned_to, helper_assigned_to')
    .eq('id', jobId);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data: job } = await q.maybeSingle();
  if (!job) return { ok: false, found: false };

  if (ADMIN_ROLES.includes(role || '')) return { ok: true, found: true };
  if (job.assigned_to === userId || job.helper_assigned_to === userId) {
    return { ok: true, found: true };
  }

  const { data: crewRow } = await supabaseAdmin
    .from('job_crew')
    .select('id')
    .eq('job_order_id', jobId)
    .eq('user_id', userId)
    .maybeSingle();
  return { ok: !!crewRow, found: true };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = await getTenantId(auth.userId);

    const access = await canAccessJob(jobId, auth.userId, auth.role, tenantId);
    if (!access.found) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (!access.ok) return NextResponse.json({ error: 'You are not on this job' }, { status: 403 });

    const status = await getWaiverStatus(jobId, tenantId);
    if (!status) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    console.error('Unexpected error in GET /waiver:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = await getTenantId(auth.userId);

    const access = await canAccessJob(jobId, auth.userId, auth.role, tenantId);
    if (!access.found) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (!access.ok) return NextResponse.json({ error: 'You are not on this job' }, { status: 403 });

    const result = await sendWaiver({
      jobId,
      tenantId,
      triggeredBy: auth.userId,
      reason: 'manual',
    });

    // Report what actually happened. A waiver that could not be delivered must
    // NOT come back as a success — the crew would start work believing the site
    // contact had been asked to sign.
    const httpStatus =
      result.outcome === 'sent' || result.outcome === 'already_signed'
        ? 200
        : result.outcome === 'job_not_found'
          ? 404
          : 409;

    return NextResponse.json(
      {
        success: result.outcome === 'sent' || result.outcome === 'already_signed',
        data: result,
        message: result.message,
        ...(result.outcome !== 'sent' && result.outcome !== 'already_signed'
          ? { error: result.message }
          : {}),
      },
      { status: httpStatus }
    );
  } catch (error) {
    console.error('Unexpected error in POST /waiver:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
