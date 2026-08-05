export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/waiver-reminders
 *
 * Chases unsigned liability waivers on jobs where the crew is already rolling.
 *
 * WHY: the waiver goes out when the operator taps In Route, but a site contact
 * who doesn't open the text right away is the whole problem — the crew arrives
 * and starts cutting with nothing signed. This sweep re-sends the SAME link
 * once the crew has been travelling long enough to be close, and tells the
 * operator so they can chase the contact in person instead of assuming.
 *
 * Rules, deliberately conservative:
 *   • Only jobs that are in_route / on_site / in_progress and require a waiver.
 *   • Only after REMIND_AFTER_MINUTES since the last send — roughly "about the
 *     time you're pulling up".
 *   • At most REMINDER_LIMIT reminders per job, ever. A waiver chase must not
 *     turn into a text-message barrage at a customer.
 *
 * Authorization: Bearer ${CRON_SECRET} (fail-closed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendWaiver, WAIVER_REQUEST_TYPE } from '@/lib/waiver-dispatch';

/** Roughly how long after dispatch a crew is arriving on a typical local job. */
const REMIND_AFTER_MINUTES = 25;
/** Hard ceiling on reminders per job, so this can never become spam. */
const REMINDER_LIMIT = 2;
const BATCH = 25;

const ACTIVE_STATUSES = ['in_route', 'on_site', 'in_progress'];

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  if ((request.headers.get('authorization') || '') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: jobs, error } = await supabaseAdmin
    .from('job_orders')
    .select('id, tenant_id, job_number, assigned_to, status, in_route_at')
    .in('status', ACTIVE_STATUSES)
    .eq('require_waiver_signature', true)
    .not('utility_waiver_signed', 'is', true)
    .not('in_route_at', 'is', null)
    .order('in_route_at', { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error('[waiver-reminders] fetch error:', error);
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 });
  }
  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ success: true, checked: 0, reminded: 0 });
  }

  const cutoff = Date.now() - REMIND_AFTER_MINUTES * 60_000;
  let reminded = 0;
  let skipped = 0;

  for (const job of jobs) {
    try {
      const { data: req } = await supabaseAdmin
        .from('signature_requests')
        .select('id, sent_at, signed_at, form_data')
        .eq('job_order_id', job.id)
        .eq('request_type', WAIVER_REQUEST_TYPE)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Nothing was ever sent (e.g. the job went In Route before this feature
      // existed, or the send failed) — send it now rather than only reminding.
      // Already signed on the request side: the job row just hasn't caught up.
      if (req?.signed_at) { skipped++; continue; }

      const lastSent = req?.sent_at ? new Date(req.sent_at).getTime() : null;
      if (lastSent !== null && lastSent > cutoff) { skipped++; continue; }

      // Reminder count is tracked on the request itself so it survives restarts
      // and can't drift from the row it describes.
      const formData = (req?.form_data as Record<string, unknown> | null) ?? {};
      const priorReminders = Number(formData.waiver_reminders ?? 0);
      if (priorReminders >= REMINDER_LIMIT) { skipped++; continue; }

      const result = await sendWaiver({
        jobId: job.id,
        tenantId: job.tenant_id,
        reason: 'reminder',
      });

      if (result.outcome === 'sent') {
        reminded++;
        if (req?.id) {
          await supabaseAdmin
            .from('signature_requests')
            .update({ form_data: { ...formData, waiver_reminders: priorReminders + 1 } })
            .eq('id', req.id);
        }

        // Tell the crew, so they can chase it face to face instead of assuming
        // the customer got the text.
        if (job.assigned_to) {
          // Column names verified against the live schema — `action_url`, not
          // `link`. PostgREST rejects the WHOLE insert on one unknown column,
          // so a guess here would silently drop every operator notification.
          const { error: notifyError } = await supabaseAdmin.from('notifications').insert({
            user_id: job.assigned_to,
            tenant_id: job.tenant_id,
            job_id: job.id,
            title: 'Waiver still unsigned',
            message:
              `The liability waiver for ${job.job_number || 'this job'} still isn't signed. ` +
              `We re-sent it — please get the site contact to sign before you start cutting.`,
            type: 'warning',
            priority: 'high',
            action_url: `/dashboard/my-jobs/${job.id}`,
          });
          if (notifyError) {
            console.error('[waiver-reminders] operator notification failed:', notifyError);
          }
        }
      } else {
        skipped++;
      }
    } catch (e) {
      console.error(`[waiver-reminders] job ${job.id} failed:`, e);
      skipped++;
    }
  }

  return NextResponse.json({ success: true, checked: jobs.length, reminded, skipped });
}
