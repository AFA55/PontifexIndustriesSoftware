export const dynamic = 'force-dynamic';

/**
 * POST /api/job-orders/[id]/reset-day
 *
 * Clear ONE DAY's submitted work ticket so the operator can enter it again.
 *
 * WHY (founder, Aug 2026): once a day's ticket is submitted it locks — which is
 * correct, because a submitted ticket is a record. But an operator who typed
 * the wrong footage, picked the wrong work type, or fat-fingered a quantity had
 * NO way back. Their only options were to leave a wrong number on the customer's
 * ticket or call the office. Now they can wipe that day and retype it.
 *
 * WHAT IT WILL NOT DO — deliberately:
 *   • It never touches a COMPLETED job. Once the customer has signed, the record
 *     is closed; corrections go through the office so they're attributable.
 *   • It only ever clears the CALLER'S OWN work. On a crew job one operator
 *     cannot wipe another's submission.
 *   • It does not touch photos, timecards or the job's status — only the work
 *     entered for that day.
 *
 * Body: { date: 'YYYY-MM-DD' }  (defaults to the tenant's today)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { tenantToday } from '@/lib/tenant-timezone';

type RouteContext = { params: Promise<{ id: string }> };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = await getTenantId(auth.userId);
    const body = await request.json().catch(() => ({}));

    // ── The job, and whether this person is on it ──────────────────────────
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, status, assigned_to, helper_assigned_to, tenant_id, job_number')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job } = await jobQuery.maybeSingle();
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    let onJob = job.assigned_to === auth.userId || job.helper_assigned_to === auth.userId;
    if (!onJob) {
      const { data: crewRow } = await supabaseAdmin
        .from('job_crew')
        .select('id')
        .eq('job_order_id', jobId)
        .eq('user_id', auth.userId)
        .maybeSingle();
      onJob = !!crewRow;
    }
    const isAdmin = ['admin', 'super_admin', 'operations_manager'].includes(auth.role || '');
    if (!onJob && !isAdmin) {
      return NextResponse.json({ error: 'You are not on this job' }, { status: 403 });
    }

    // A signed, completed job is a closed record — corrections go through the
    // office so they are attributable to whoever made them.
    if (!isAdmin && ['completed', 'cancelled', 'archived'].includes(String(job.status))) {
      return NextResponse.json(
        {
          error:
            'This job is already closed out. Ask the office to correct it — a signed record can\'t be reset from here.',
        },
        { status: 409 }
      );
    }

    const date = YMD.test(String(body.date || '')) ? String(body.date) : await tenantToday(tenantId);

    // ── Clear ONLY this person's work for THAT DAY ─────────────────────────
    // work_items has no date column — it carries `day_number` and sometimes a
    // `daily_log_id`. The day's log is the authority for both, so resolve it
    // first and scope the delete through it. Without a log there is nothing
    // submitted for that day and nothing to clear.
    const { data: log } = await supabaseAdmin
      .from('daily_job_logs')
      .select('id, day_number')
      .eq('job_order_id', jobId)
      .eq('operator_id', auth.userId)
      .eq('log_date', date)
      .maybeSingle();

    if (!log) {
      return NextResponse.json(
        { error: `You have nothing submitted for ${date} on this job.` },
        { status: 404 }
      );
    }

    let del = supabaseAdmin
      .from('work_items')
      .delete({ count: 'exact' })
      .eq('job_order_id', jobId)
      .eq('operator_id', auth.userId);
    // Prefer the explicit link; fall back to the day number the log carries.
    del = log.day_number != null
      ? del.or(`daily_log_id.eq.${log.id},day_number.eq.${log.day_number}`)
      : del.eq('daily_log_id', log.id);
    const { count: itemsDeleted, error: itemsError } = await del;
    if (itemsError) {
      console.error('[reset-day] work_items delete failed:', itemsError);
      return NextResponse.json(
        { error: 'Could not clear the work items. Nothing was changed — try again.' },
        { status: 500 }
      );
    }

    const { error: logError } = await supabaseAdmin
      .from('daily_job_logs')
      .update({
        work_performed: [],
        work_performed_draft: null,
        day_completed_at: null,
        hours_worked: 0,
        notes: null,
      })
      .eq('id', log.id);
    if (logError) {
      console.error('[reset-day] daily log reset failed:', logError);
      return NextResponse.json(
        { error: 'The work items were cleared but the day did not reopen. Tell the office.' },
        { status: 500 }
      );
    }

    // Audit — a reset is a real event and the office should be able to see it.
    Promise.resolve(
      supabaseAdmin.from('job_orders_history').insert({
        job_order_id: jobId,
        job_number: job.job_number,
        changed_by: auth.userId,
        changed_by_name: auth.userEmail,
        changed_by_role: auth.role,
        change_type: 'day_ticket_reset',
        changes: { date, work_items_removed: itemsDeleted ?? null },
      })
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      data: { date, cleared: true },
      message: `Your work for ${date} was cleared. Enter it again when you're ready.`,
    });
  } catch (error) {
    console.error('Unexpected error in reset-day:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
