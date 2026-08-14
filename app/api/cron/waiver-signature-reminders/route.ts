export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/waiver-signature-reminders
 *
 * Chases the OPERATOR — not the customer — until the utility waiver is signed.
 *
 * FOUNDER (Aug 13): "We have a system set up so when they click In Route for the
 * first time it sends a notification to the contact on site letting them know
 * our ETA and sends the utility waiver. But we also need a notification to go
 * out to THE OPERATOR based on their estimated arrival, if the utility waiver
 * has not been signed yet — to make them get it signed by the on-site contact,
 * or to resend it. It's important we get that document signed, and we need them
 * to remember to get it signed."
 *
 * WHY THIS IS THE URGENT ONE. Half the loop already existed: the first In Route
 * tap fires `sendWaiver()` to the site contact, and then nothing ever checks
 * whether it came back. Of every job that has gone In Route in production,
 * exactly ONE has `utility_waiver_signed = true`. The document that stands
 * between the company and a cut-conduit claim was being sent into silence.
 *
 * THE RULE
 *   Once a crew is en route on a job that requires a waiver, and the waiver is
 *   still unsigned by the time they are due on site, tell the operator. Repeat
 *   on an escalating schedule while it stays unsigned and the job stays live.
 *   Stop the instant it is signed — `utility_waiver_signed` is checked on every
 *   pass, so a signature ends the chase without any cleanup.
 *
 * WHEN "DUE ON SITE" IS
 *   `in_route_at` + 30 minutes — a deliberately conservative stand-in, NOT the
 *   job's `arrival_time`. That column is a bare "08:00" with no date or zone,
 *   and resolving it means guessing a timezone; guessing wrong either nags a
 *   crew still driving or stays silent through a whole job. Batch 3's GPS ETA
 *   replaces it when it lands. All of that reasoning lives in one place —
 *   lib/waiver-chase — so there is a single thing to change.
 *
 * ESCALATION — three nudges, then stop shouting:
 *   due            → "get it signed before you start"
 *   due + 45 min   → "still not signed — get it now or resend"
 *   due + 2 hours  → "unsigned, work is under way"
 *
 * Each step fires at most once per operator per job, via the reminder_log
 * UNIQUE constraint (sendReminderOnce). Safe under concurrent cron runs.
 *
 * Authorization: Bearer ${CRON_SECRET} (fail-closed if the env var is unset)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendReminderOnce } from '@/lib/send-reminder';
import { waiverChaseStep, type WaiverChaseStep } from '@/lib/waiver-chase';
import { PROFILE_PHONE_SELECT, readProfilePhone } from '@/lib/profile-phone';

/** A crew is only chased while the job is actually live. */
const LIVE_STATUSES = ['in_route', 'on_site', 'in_progress', 'pending_completion'];

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let remindersSent = 0;
  const skipped: string[] = [];

  try {
    // Jobs that are live, need a waiver, and haven't got one back.
    const { data: jobs } = await supabaseAdmin
      .from('job_orders')
      .select(
        `id, job_number, customer_name, tenant_id, status, arrival_time,
         scheduled_date, end_date, in_route_at, assigned_to, helper_assigned_to,
         require_waiver_signature, utility_waiver_signed`
      )
      .in('status', LIVE_STATUSES)
      .eq('require_waiver_signature', true)
      .not('in_route_at', 'is', null)
      .or('utility_waiver_signed.is.null,utility_waiver_signed.eq.false');

    // A job carries its `in_route_at` and its live status across a reschedule.
    // JOB-2026-160762 was moved to today but still holds an Aug 10 In Route
    // stamp and `in_progress` — chasing its crew off a three-day-old stamp is
    // noise, and noise is how a legal reminder gets ignored. Only chase a job
    // whose span actually covers today.
    const todayYMD = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ success: true, remindersSent: 0 });
    }

    const nowMs = Date.now();

    for (const job of jobs as any[]) {
      const startsBy = !job.scheduled_date || job.scheduled_date <= todayYMD;
      const endsAfter = !job.end_date || job.end_date >= todayYMD;
      if (!startsBy || !endsAfter) {
        skipped.push(`${job.job_number}: not scheduled for today`);
        continue;
      }

      // NOTE: measured from in_route_at, not from the job's `arrival_time`.
      // That column is a bare "08:00" with no date or timezone, and resolving it
      // means guessing a zone — the same class of mistake that produced the
      // "213 hours on site" reading. See lib/waiver-chase for the reasoning;
      // pass `etaMs` once batch 3's GPS ETA exists and it takes over.
      const step: WaiverChaseStep | null = waiverChaseStep({
        nowMs,
        inRouteAt: job.in_route_at,
      });
      if (!step) continue;

      // Chase the crew who are actually on it. The helper gets it too: on a
      // two-person crew the lead is often the one cutting while the helper is
      // the one free to walk over to the contact.
      const recipients = [job.assigned_to, job.helper_assigned_to].filter(Boolean) as string[];
      if (recipients.length === 0) {
        skipped.push(`${job.job_number}: nobody assigned`);
        continue;
      }

      // SMS was structurally unreachable: sendNotification only texts when
      // `smsPhone` is supplied, and this cron never supplied one. Two of the
      // five people it chased have sms_enabled = true and a phone on file and
      // still got nothing but a bell — for the document that shifts liability
      // for unmarked conduit onto the customer.
      const { data: profs } = await supabaseAdmin
        .from('profiles')
        // `id` is NOT in PROFILE_PHONE_SELECT (it is just 'phone_number, phone'), so
        // without it every row came back with `p.id === undefined`, the Map held one
        // entry keyed undefined, and every lookup returned null — leaving SMS exactly
        // as unreachable as before the fix that was supposed to enable it. Every other
        // caller of this constant prefixes `id`; this one did not, and the `(p: any)`
        // cast is why the compiler stayed quiet.
        .select(`id, ${PROFILE_PHONE_SELECT}`)
        .in('id', recipients);
      const phoneById = new Map<string, string | null>(
        (profs ?? []).map((p: any) => [p.id, readProfilePhone(p)])
      );

      for (const userId of recipients) {
        // The key carries the DAY. `in_route_at` is stamped once, on the first
        // tap ever, so without a date every step was already burned by the end
        // of day one and a multi-day job went unchased for the rest of its run —
        // BWC runs Aug 13–17 and had spent all three steps by 14:15 on the 13th.
        // Per-day means the crew is reminded each morning they are still on it.
        const sent = await sendReminderOnce(`waiver_unsigned:${job.id}:${todayYMD}:${step.key}`, {
          userId,
          tenantId: job.tenant_id ?? null,
          category: 'document_to_sign',
          inAppType: step.key === 'overdue' ? 'error' : 'warning',
          notificationType: 'waiver_unsigned',
          title: step.title,
          message: step.message(job.customer_name || 'the customer'),
          actionUrl: `/dashboard/job-schedule/${job.id}/utility-waiver`,
          jobOrderId: job.id,
          smsPhone: phoneById.get(userId) ?? null,
          metadata: { step: step.key, job_number: job.job_number, day: todayYMD },
        });
        // `sent` is a DeliveryResult, not a boolean — it is truthy even when
        // every channel failed. Count a delivery only if something landed.
        if (sent && (sent.inApp || sent.push || sent.sms || sent.email)) remindersSent += 1;
      }
    }

    return NextResponse.json({
      success: true,
      remindersSent,
      jobsChecked: jobs.length,
      ...(skipped.length > 0 ? { skipped } : {}),
    });
  } catch (e: any) {
    console.error('[waiver-signature-reminders]', e);
    return NextResponse.json({ error: 'Reminder run failed' }, { status: 500 });
  }
}
