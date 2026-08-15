export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/jobs/[id]/closeout-nudge
 *
 * The office tells the crew, by hand, to go finish a work ticket they left
 * open.
 *
 * FOUNDER (Aug 15): "this is an example of something the PM should have known —
 * they haven't completed their job. That job is done but the operator hasn't
 * pressed submit or completed job. We should have a button that sends a
 * notification to them to complete their job."
 *
 * Sibling of `waiver-nudge` and built the same way — same dispatcher, same
 * dedup mechanism, same audit — so the two buttons behave identically under the
 * hand. What differs is WHO it reaches: the operator who worked the day that
 * was left open, not whoever holds the job today. See lib/closeout-nudge.
 *
 * AUTH: `requireSalesStaff` (admin, super_admin, operations_manager,
 * supervisor, salesman) — a POST that mutates no job data and only sends a
 * notification the `work-performed-reminders` cron could have sent anyway.
 *
 * Returns: { success: true, data: { notified, alreadyNotified, openDays, recipients, message } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { sendReminderOnce } from '@/lib/send-reminder';
import { PROFILE_PHONE_SELECT, readProfilePhone } from '@/lib/profile-phone';
import { formatDay } from '@/lib/dates';
import {
  canNudgeCloseout,
  closeoutNudgeDedupKey,
  closeoutNudgeMessage,
  closeoutNudgeSummary,
  closeoutRecipients,
  describeOpenDays,
  isCloseoutClosed,
  openWorkDays,
  type DailyLogRow,
  type WorkDayRow,
} from '@/lib/closeout-nudge';
import {
  currentDailyAssignments,
  resolveWaiverNudgeRecipients,
  type WaiverNudgeDailyRow,
} from '@/lib/waiver-nudge';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    let q = supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, tenant_id, status, assigned_to, helper_assigned_to')
      .eq('id', jobId);
    // super_admin has no home tenant; every other role is pinned to theirs.
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data: job, error } = await q.maybeSingle();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (isCloseoutClosed(job.status)) {
      return NextResponse.json(
        { error: 'This job is already closed — there is nothing left to wrap up.' },
        { status: 400 }
      );
    }

    // ── What was left open ─────────────────────────────────────────────────
    const [{ data: items }, { data: logs }] = await Promise.all([
      supabaseAdmin
        .from('work_items')
        .select('work_date, day_number, operator_id')
        .eq('job_order_id', jobId),
      supabaseAdmin
        .from('daily_job_logs')
        .select('log_date, day_number, day_completed_at, operator_id')
        .eq('job_order_id', jobId)
        // `daily_job_logs` holds one row per OPERATOR per day, so a day has
        // several. Without an explicit order PostgREST's row order is arbitrary
        // and the resolved recipient list varies between identical requests.
        .order('log_date', { ascending: true })
        .order('created_at', { ascending: true }),
    ]);

    const openDays = openWorkDays(
      (items as WorkDayRow[]) ?? [],
      (logs as DailyLogRow[]) ?? []
    );

    if (!canNudgeCloseout({ jobStatus: job.status, openDays })) {
      return NextResponse.json(
        { error: 'Every logged day on this job is already wrapped up.' },
        { status: 400 }
      );
    }

    // ── Who to tell ────────────────────────────────────────────────────────
    // The operators on the open days. Only if those days name nobody at all do
    // we fall back to the current crew, resolved through all three assignment
    // paths (job slots, job_crew, per-day board) — reading only `assigned_to`
    // is the mistake that has produced four production bugs in a week.
    const [{ data: crewRows }, { data: dailyRows }] = await Promise.all([
      supabaseAdmin.from('job_crew').select('user_id').eq('job_order_id', jobId),
      supabaseAdmin
        .from('job_daily_assignments')
        .select('operator_id, helper_id, assignment_date')
        .eq('job_order_id', jobId),
    ]);

    // Local calendar day as 'YYYY-MM-DD', matched as a STRING against the
    // ledger's bare date column — never `new Date(dateStr)`.
    const todayYMD = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const fallbackCrew = resolveWaiverNudgeRecipients(
      job as { assigned_to: string | null; helper_assigned_to: string | null },
      (crewRows as Array<{ user_id: string | null }>) ?? [],
      currentDailyAssignments(dailyRows as WaiverNudgeDailyRow[], todayYMD),
    );

    const recipients = closeoutRecipients(openDays, fallbackCrew);
    const daysLabel = describeOpenDays(openDays, (d) =>
      formatDay(d, { month: 'short', day: 'numeric' })
    );

    if (recipients.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          notified: 0,
          alreadyNotified: 0,
          openDays: openDays.length,
          recipients: [],
          message: closeoutNudgeSummary({ notified: 0, alreadyNotified: 0 }),
        },
      });
    }

    // `id` must be in the select — PROFILE_PHONE_SELECT is only the two phone
    // columns, and a sibling cron once shipped without it, silently keying
    // every phone under `undefined`.
    const { data: profs } = await supabaseAdmin
      .from('profiles')
      .select(`id, full_name, ${PROFILE_PHONE_SELECT}`)
      .in('id', recipients);

    const profById = new Map<string, { full_name: string | null; phone: string | null }>(
      ((profs as Array<Record<string, unknown>>) ?? []).map((p) => [
        String(p.id),
        {
          full_name: (p.full_name as string | null) ?? null,
          phone: readProfilePhone(p as { phone_number?: string | null; phone?: string | null }),
        },
      ])
    );

    const nowMs = Date.now();
    const dedupKey = closeoutNudgeDedupKey(jobId, nowMs);
    const { title, message } = closeoutNudgeMessage({
      customerName: job.customer_name,
      daysLabel,
    });

    let notified = 0;
    let alreadyNotified = 0;
    const notifiedNames: string[] = [];

    for (const userId of recipients) {
      const prof = profById.get(userId);
      const sent = await sendReminderOnce(dedupKey, {
        userId,
        tenantId: (job.tenant_id as string) ?? null,
        // The same preference bucket the `work-performed-reminders` cron uses —
        // someone who muted automatic ticket nagging has muted this too, which
        // is the correct reading of that setting.
        category: 'work_performed_reminder',
        inAppType: 'warning',
        notificationType: 'work_ticket_incomplete',
        title,
        message,
        actionUrl: `/dashboard/job-schedule/${jobId}`,
        jobOrderId: jobId,
        smsPhone: prof?.phone ?? null,
        metadata: {
          job_number: job.job_number,
          open_days: openDays.length,
          source: 'manual_office_nudge',
          requested_by: auth.userId,
        },
      });

      // `sendReminderOnce` returns null for a duplicate; a DeliveryResult is
      // truthy even when every channel failed, so count a real delivery only
      // when something actually landed.
      if (sent === null) {
        alreadyNotified += 1;
      } else if (sent.inApp || sent.push || sent.sms || sent.email) {
        notified += 1;
        notifiedNames.push(prof?.full_name || 'Crew member');
      }
    }

    // Fire-and-forget audit — who leaned on the button, and for which job.
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        // NOT NULL in the audit_logs schema — omitting either drops the row on
        // the floor, and a fire-and-forget insert would never tell us.
        user_email: auth.userEmail || 'unknown',
        user_role: auth.role || 'unknown',
        action: 'closeout_nudge_sent',
        resource_type: 'job_order',
        resource_id: jobId,
        details: {
          job_number: job.job_number,
          open_days: openDays.length,
          notified,
          already_notified: alreadyNotified,
          recipient_count: recipients.length,
        },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        notified,
        alreadyNotified,
        openDays: openDays.length,
        recipients: notifiedNames,
        message: closeoutNudgeSummary({ notified, alreadyNotified, names: notifiedNames }),
      },
    });
  } catch (e: unknown) {
    console.error('[closeout-nudge] error', e);
    return NextResponse.json({ error: 'Failed to send the reminder.' }, { status: 500 });
  }
}
