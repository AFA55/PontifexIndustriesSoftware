export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/billing-milestones/[id]/trigger
 * Manually trigger a billing milestone:
 * - Sets triggered_at, notification_sent, notified_at
 * - Inserts a schedule_notification to the salesperson on the job
 * - Returns the updated milestone
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: milestoneId } = await context.params;
    const tenantId = auth.tenantId;

    // ── 1. Fetch the milestone ──────────────────────────────────────────────
    let milestoneQuery = supabaseAdmin
      .from('billing_milestones')
      .select('*')
      .eq('id', milestoneId);
    if (tenantId) milestoneQuery = milestoneQuery.eq('tenant_id', tenantId);

    const { data: milestone, error: fetchError } = await milestoneQuery.single();

    if (fetchError || !milestone) {
      return NextResponse.json({ error: 'Billing milestone not found' }, { status: 404 });
    }

    if (milestone.triggered_at) {
      return NextResponse.json(
        { error: 'Milestone has already been triggered', data: { milestone } },
        { status: 409 }
      );
    }

    // ── 2. Mark milestone as triggered ─────────────────────────────────────
    const now = new Date().toISOString();

    const { data: updatedMilestone, error: updateError } = await supabaseAdmin
      .from('billing_milestones')
      .update({
        triggered_at: now,
        notification_sent: true,
        notified_at: now,
      })
      .eq('id', milestoneId)
      .select()
      .single();

    if (updateError) {
      console.error('Error triggering billing milestone:', updateError);
      return NextResponse.json({ error: 'Failed to trigger billing milestone' }, { status: 500 });
    }

    // ── 3. Look up the salesperson on the job ───────────────────────────────
    const { data: job } = await supabaseAdmin
      .from('job_orders')
      .select('salesperson_id, job_number, customer_name')
      .eq('id', milestone.job_order_id)
      .single();

    const notifyUserId = job?.salesperson_id || auth.userId;

    // ── 4. Send in-app notification (fire-and-forget) ───────────────────────
    Promise.resolve(
      supabaseAdmin.from('schedule_notifications').insert({
        recipient_id: notifyUserId,
        job_order_id: milestone.job_order_id,
        type: 'billing_milestone',
        title: 'Billing milestone reached',
        message: `${milestone.label} — ${milestone.milestone_percent}% complete${job?.job_number ? ` (${job.job_number})` : ''}`,
        metadata: {
          milestone_id: milestoneId,
          milestone_percent: milestone.milestone_percent,
          label: milestone.label,
          job_number: job?.job_number ?? null,
          customer_name: job?.customer_name ?? null,
          triggered_by: auth.userId,
          triggered_at: now,
        },
        tenant_id: tenantId || null,
      })
    ).then(({ error: notifError }) => {
      if (notifError) console.error('Error sending billing milestone notification:', notifError);
    }).catch(() => {});

    // ── 5. Fire-and-forget audit log ────────────────────────────────────────
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'billing_milestone_triggered',
        entity_type: 'billing_milestone',
        entity_id: milestoneId,
        details: {
          job_order_id: milestone.job_order_id,
          milestone_percent: milestone.milestone_percent,
          label: milestone.label,
          notified_user_id: notifyUserId,
          triggered_at: now,
        },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data: { milestone: updatedMilestone } });
  } catch (error: unknown) {
    console.error('Error in POST /billing-milestones/[id]/trigger:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
