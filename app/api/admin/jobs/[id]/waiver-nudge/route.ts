export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/jobs/[id]/waiver-nudge
 *
 * The office, by hand, tells the crew on a LIVE job to go get the utility
 * waiver signed.
 *
 * FOUNDER (Aug 15): "create a button where, if the job is ACTIVE and they
 * haven't gotten it signed, admin or PMs and supervisors can send notifications
 * to them to get that waiver signed — just make it a button in job view."
 *
 * This is the manual twin of the `waiver-signature-reminders` cron, and it
 * deliberately reuses that machinery rather than growing a second one:
 *   • wording        → lib/waiver-chase (`manualWaiverChaseStep`), so the crew
 *                      cannot tell a hand-pressed nudge from an automatic one
 *   • delivery       → lib/send-reminder (`sendReminderOnce`) — the one
 *                      dispatcher, which honours each person's channel prefs
 *   • dedup          → the reminder_log UNIQUE constraint, keyed per job per
 *                      hour, so leaning on the button cannot spam a crew
 *   • phone lookup   → PROFILE_PHONE_SELECT, because `profiles` has two phone
 *                      columns and the wrong one is empty
 *
 * WHO IT REACHES. All three assignment paths (job slots, `job_crew`, and the
 * per-day `job_daily_assignments` board) — see lib/waiver-nudge for why reading
 * only `assigned_to` has produced four production bugs in a week.
 *
 * AUTH: `requireSalesStaff` — admin, super_admin, operations_manager,
 * supervisor, salesman. That guard is documented for read-only routes, and this
 * is a POST, so to be explicit: it is used here because the role set is exactly
 * the one the founder named, and because the request mutates NO job data. It
 * sends a notification the recipients could have been sent by a clock anyway.
 *
 * Returns: { success: true, data: { notified, alreadyNotified, recipients, message } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { notFoundInCompany } from '@/lib/tenant-scope';
import { sendReminderOnce } from '@/lib/send-reminder';
import { manualWaiverChaseStep } from '@/lib/waiver-chase';
import { PROFILE_PHONE_SELECT, readProfilePhone } from '@/lib/profile-phone';
import {
  canNudgeWaiver,
  currentDailyAssignments,
  resolveWaiverNudgeRecipients,
  waiverNudgeDedupKey,
  waiverNudgeSummary,
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
      .select(
        `id, job_number, customer_name, tenant_id, status, in_route_at,
         assigned_to, helper_assigned_to,
         require_waiver_signature, utility_waiver_signed`
      )
      .eq('id', jobId);
    // super_admin has no home tenant; every other role is pinned to theirs.
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data: job, error } = await q.maybeSingle();

    if (error || !job) {
      // Same answer for missing and cross-company — see lib/tenant-scope.ts.
      return notFoundInCompany(tenantId);
    }

    // Refuse the pointless cases in words, not with a silent success: a closed
    // job or an already-signed waiver means the button should not have been
    // there, and saying so beats pretending something was sent.
    if (!job.require_waiver_signature) {
      return NextResponse.json(
        { error: 'This job does not require a utility waiver.' },
        { status: 400 }
      );
    }
    if (job.utility_waiver_signed) {
      return NextResponse.json(
        { error: 'The utility waiver on this job is already signed.' },
        { status: 400 }
      );
    }
    if (!canNudgeWaiver({
      requireWaiver: job.require_waiver_signature,
      signed: job.utility_waiver_signed,
      jobStatus: job.status,
    })) {
      return NextResponse.json(
        { error: 'This job is closed — the waiver can no longer be chased.' },
        { status: 400 }
      );
    }

    // ── Who is on this job, from all three paths ───────────────────────────
    const [{ data: crewRows }, { data: dailyRows }] = await Promise.all([
      supabaseAdmin.from('job_crew').select('user_id').eq('job_order_id', jobId),
      supabaseAdmin
        .from('job_daily_assignments')
        .select('operator_id, helper_id, assignment_date')
        .eq('job_order_id', jobId),
    ]);

    // Local calendar day as 'YYYY-MM-DD' — matched as a STRING against the
    // ledger's bare date column. Never `new Date(dateStr)`; that is the bug
    // that renders June 1 as "Sun, May 31" in every US timezone.
    const todayYMD = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const recipients = resolveWaiverNudgeRecipients(
      job as { assigned_to: string | null; helper_assigned_to: string | null },
      (crewRows as Array<{ user_id: string | null }>) ?? [],
      currentDailyAssignments(dailyRows as WaiverNudgeDailyRow[], todayYMD),
    );

    if (recipients.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          notified: 0,
          alreadyNotified: 0,
          recipients: [],
          message: waiverNudgeSummary({ notified: 0, alreadyNotified: 0 }),
        },
      });
    }

    // Names for the confirmation, phones for the SMS channel. `id` must be in
    // the select — PROFILE_PHONE_SELECT is only the two phone columns, and the
    // cron next door once shipped without it, which silently keyed every phone
    // under `undefined` and left SMS as unreachable as before the fix.
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
    const step = manualWaiverChaseStep({ nowMs, inRouteAt: job.in_route_at });
    const dedupKey = waiverNudgeDedupKey(jobId, nowMs);
    const message = step.message(job.customer_name || 'the customer');

    let notified = 0;
    let alreadyNotified = 0;
    const notifiedNames: string[] = [];

    for (const userId of recipients) {
      const prof = profById.get(userId);
      const sent = await sendReminderOnce(dedupKey, {
        userId,
        tenantId: (job.tenant_id as string) ?? null,
        category: 'document_to_sign',
        inAppType: 'warning',
        notificationType: 'waiver_unsigned',
        title: step.title,
        message,
        actionUrl: `/dashboard/job-schedule/${jobId}/utility-waiver`,
        jobOrderId: jobId,
        smsPhone: prof?.phone ?? null,
        metadata: {
          step: step.key,
          job_number: job.job_number,
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
        action: 'waiver_nudge_sent',
        resource_type: 'job_order',
        resource_id: jobId,
        details: {
          job_number: job.job_number,
          step: step.key,
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
        recipients: notifiedNames,
        message: waiverNudgeSummary({ notified, alreadyNotified, names: notifiedNames }),
      },
    });
  } catch (e: unknown) {
    console.error('[waiver-nudge] error', e);
    return NextResponse.json({ error: 'Failed to send the waiver reminder.' }, { status: 500 });
  }
}
