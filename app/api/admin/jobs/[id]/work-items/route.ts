export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/jobs/[id]/work-items
 * GET  — List all work items for a job
 * POST — Create a new work item; auto-triggers any billing milestones
 *        whose completion threshold is now met (fire-and-forget)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Calculate the overall scope completion percentage for a job based on
 * work_items totals vs the expected_scope JSONB on the job_orders row.
 * Returns a value 0-100. Falls back to 0 if expected scope is not set.
 */
async function calcScopePercent(jobId: string, tenantId: string): Promise<number> {
  const [jobRes, itemsRes] = await Promise.all([
    supabaseAdmin
      .from('job_orders')
      .select('expected_scope')
      .eq('id', jobId)
      .single(),
    supabaseAdmin
      .from('work_items')
      .select('core_quantity, linear_feet_cut')
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId),
  ]);

  const expectedScope = (jobRes.data?.expected_scope as Record<string, unknown>) || {};
  const items = itemsRes.data || [];

  const expectedCores = Number(expectedScope.cores || 0);
  const expectedLinear = Number(expectedScope.linear_feet || 0);

  const totalExpected = expectedCores + expectedLinear;
  if (totalExpected === 0) return 0;

  const actualCores = items.reduce((s, i) => s + Number(i.core_quantity || 0), 0);
  const actualLinear = items.reduce((s, i) => s + Number(i.linear_feet_cut || 0), 0);

  const totalActual = actualCores + actualLinear;
  return Math.min(100, (totalActual / totalExpected) * 100);
}

/**
 * Trigger a single milestone: mark it triggered and send a notification.
 * Pure fire-and-forget — errors are swallowed.
 */
async function triggerMilestone(
  milestoneId: string,
  jobOrderId: string,
  milestonePercent: number,
  label: string,
  tenantId: string,
  triggeredByUserId: string
): Promise<void> {
  const now = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from('billing_milestones')
    .update({ triggered_at: now, notification_sent: true, notified_at: now })
    .eq('id', milestoneId);

  if (updateError) {
    console.error('Auto-trigger: failed to update milestone', milestoneId, updateError);
    return;
  }

  // Look up salesperson on the job
  const { data: job } = await supabaseAdmin
    .from('job_orders')
    .select('salesperson_id, job_number, customer_name')
    .eq('id', jobOrderId)
    .single();

  const notifyUserId = job?.salesperson_id || triggeredByUserId;

  await supabaseAdmin.from('schedule_notifications').insert({
    recipient_id: notifyUserId,
    job_order_id: jobOrderId,
    type: 'billing_milestone',
    title: 'Billing milestone reached',
    message: `${label} — ${milestonePercent}% complete${job?.job_number ? ` (${job.job_number})` : ''}`,
    metadata: {
      milestone_id: milestoneId,
      milestone_percent: milestonePercent,
      label,
      job_number: job?.job_number ?? null,
      customer_name: job?.customer_name ?? null,
      auto_triggered: true,
      triggered_by: triggeredByUserId,
      triggered_at: now,
    },
    tenant_id: tenantId || null,
  });
}

/**
 * After a work item save, check all untriggered milestones and auto-fire
 * any whose threshold is now met. Runs entirely fire-and-forget.
 */
function autoTriggerMilestones(
  jobId: string,
  tenantId: string,
  triggeredByUserId: string
): void {
  Promise.resolve(
    (async () => {
      const currentPct = await calcScopePercent(jobId, tenantId);

      let milestonesQuery = supabaseAdmin
        .from('billing_milestones')
        .select('id, milestone_percent, label, job_order_id')
        .eq('job_order_id', jobId)
        .is('triggered_at', null);
      if (tenantId) milestonesQuery = milestonesQuery.eq('tenant_id', tenantId);
      const { data: untriggered } = await milestonesQuery;

      if (!untriggered || untriggered.length === 0) return;

      const toTrigger = untriggered.filter((m) => currentPct >= m.milestone_percent);

      await Promise.all(
        toTrigger.map((m) =>
          triggerMilestone(
            m.id,
            m.job_order_id,
            m.milestone_percent,
            m.label,
            tenantId,
            triggeredByUserId
          ).catch(() => {})
        )
      );
    })()
  ).catch(() => {});
}

// ── Route handlers ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    }

    const query = supabaseAdmin
      .from('work_items')
      .select('*')
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId);

    const { data: workItems, error } = await query.order('day_number', { ascending: true });

    if (error) {
      console.error('Error fetching work items:', error);
      return NextResponse.json({ error: 'Failed to fetch work items' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: workItems || [] });
  } catch (error: unknown) {
    console.error('Error in GET /work-items:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    }

    const body = await request.json();

    // Verify the job exists and belongs to this tenant
    const jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id')
      .eq('id', jobId)
      .eq('tenant_id', tenantId);
    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Build the insert payload — spread caller body, enforce tenant/job ids
    const workItemData = {
      ...body,
      job_order_id: jobId,
      tenant_id: tenantId,
      operator_id: body.operator_id || auth.userId,
    };

    const { data: workItem, error: insertError } = await supabaseAdmin
      .from('work_items')
      .insert(workItemData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating work item:', insertError);
      return NextResponse.json(
        { error: 'Failed to create work item', details: insertError.message },
        { status: 500 }
      );
    }

    // ── Auto-trigger billing milestones (fire-and-forget, non-blocking) ────
    autoTriggerMilestones(jobId, tenantId, auth.userId);

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'work_item_created',
        entity_type: 'work_item',
        entity_id: workItem.id,
        details: { job_order_id: jobId },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data: { work_item: workItem } }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error in POST /work-items:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
