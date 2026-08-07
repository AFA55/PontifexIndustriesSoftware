export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/work-performed-reminders
 *
 * Runs every 15 minutes via Vercel Cron. Reminds operators to log the work
 * they've performed if they're on the clock with a dispatched job but haven't
 * submitted yet (work_completed_at still null).
 *
 *   - "Lunch" reminder ~4 hours into their shift
 *   - "Overdue" reminder once they hit ~7 hours and still haven't logged work
 *   - "Midday" reminder at a tenant-configurable WALL-CLOCK time (default
 *     11:55 tenant-local; notification_settings.auto_midday_work_reminder +
 *     midday_work_reminder_time) for clocked-in operators on an active
 *     dispatched job who haven't logged any work items yet today.
 *
 * Each fires at most once per operator per day (reminder_log dedup). Respects
 * per-user notification_preferences.
 *
 * Authorization: Bearer ${CRON_SECRET}  (fail-closed if env var unset)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendReminderOnce } from '@/lib/send-reminder';
import { todayInTz, workReminderPhase, parseHHMM, nowMinutesInTz, middayReminderDue } from '@/lib/reminder-timing';
import { PROFILE_PHONE_SELECT, readProfilePhone } from '@/lib/profile-phone';

const ACTIVE_STATUSES = ['scheduled', 'assigned', 'dispatched', 'in_route', 'in_progress', 'on_site'];

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let remindersSent = 0;

  try {
    const { data: tenants } = await supabaseAdmin.from('tenants').select('id, timezone');
    if (!tenants) return NextResponse.json({ success: true, remindersSent: 0 });

    const nowMs = Date.now();

    for (const tenant of tenants as { id: string; timezone: string | null }[]) {
      const tz = tenant.timezone || 'America/New_York';
      const today = todayInTz(tz);

      // Operators currently on the clock (clocked in today, not yet out)
      const { data: timecards } = await supabaseAdmin
        .from('timecards')
        .select('user_id, clock_in_time, clock_out_time')
        .eq('date', today)
        .eq('tenant_id', tenant.id)
        .not('clock_in_time', 'is', null)
        .is('clock_out_time', null);

      if (!timecards || timecards.length === 0) continue;

      const onClock = (timecards as Array<{ user_id: string; clock_in_time: string }>).map((t) => {
        const hoursIn = (nowMs - new Date(t.clock_in_time).getTime()) / 3_600_000;
        return { userId: t.user_id, hoursIn };
      });

      const userIds = onClock.map((o) => o.userId);

      // Which of these have a dispatched job today with work NOT yet submitted?
      const { data: openJobs } = await supabaseAdmin
        .from('job_orders')
        .select('id, assigned_to')
        .eq('tenant_id', tenant.id)
        .eq('scheduled_date', today)
        .in('status', ACTIVE_STATUSES)
        .not('dispatched_at', 'is', null)
        .is('work_completed_at', null)
        .in('assigned_to', userIds);

      const jobByOp = new Map<string, string>();
      for (const j of (openJobs || []) as Array<{ id: string; assigned_to: string | null }>) {
        if (j.assigned_to && !jobByOp.has(j.assigned_to)) jobByOp.set(j.assigned_to, j.id);
      }
      if (jobByOp.size === 0) continue;

      // Phone numbers for SMS fallback
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select(`id, ${PROFILE_PHONE_SELECT}`)
        .in('id', Array.from(jobByOp.keys()));
      const phoneMap = new Map<string, string | null>(
        (profiles || []).map((p: { id: string; phone: string | null; phone_number: string | null }) => [p.id, readProfilePhone(p)])
      );

      // ── Wall-clock MIDDAY phase (admin-configurable, default 11:55) ────────
      // Separate from the shift-relative lunch/overdue phases below. Targets
      // clocked-in operators on an active dispatched job who have NOT logged
      // any work items today. "Submitted today" signal: a work_items row for
      // their open job created since tenant-local midnight — cheap (one query
      // per tenant) and reliable because the work-performed page writes
      // work_items on every submit.
      const { data: settingsRow } = await supabaseAdmin
        .from('notification_settings')
        .select('auto_midday_work_reminder, midday_work_reminder_time')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const middayEnabled =
        (settingsRow as { auto_midday_work_reminder: boolean | null } | null)?.auto_midday_work_reminder ?? true;
      const middayTargetMin =
        parseHHMM((settingsRow as { midday_work_reminder_time: string | null } | null)?.midday_work_reminder_time ?? null) ??
        parseHHMM('11:55')!;
      const nowMin = nowMinutesInTz(tz);

      if (middayEnabled && middayReminderDue(nowMin, middayTargetMin) && jobByOp.size > 0) {
        // Tenant-local midnight as a UTC instant (±1 min): now minus
        // minutes-since-local-midnight. Never parse date strings as UTC here.
        const localMidnightIso = new Date(nowMs - nowMin * 60_000).toISOString();
        const { data: todayItems } = await supabaseAdmin
          .from('work_items')
          .select('operator_id')
          .in('job_order_id', Array.from(new Set(jobByOp.values())))
          .in('operator_id', Array.from(jobByOp.keys()))
          .gte('created_at', localMidnightIso);
        const loggedToday = new Set((todayItems || []).map((r: { operator_id: string }) => r.operator_id));

        for (const [opId, jobId] of jobByOp) {
          if (loggedToday.has(opId)) continue;
          const res = await sendReminderOnce(`work_midday:${today}`, {
            userId: opId,
            tenantId: tenant.id,
            category: 'work_performed_reminder',
            inAppType: 'reminder',
            title: 'Lunch check-in',
            message: "Lunch check-in: log the work you've done this morning.",
            jobOrderId: jobId,
            actionUrl: `/dashboard/job-schedule/${jobId}/work-performed`,
            smsPhone: phoneMap.get(opId) ?? null,
          });
          if (res) remindersSent++;
        }
      }

      for (const o of onClock) {
        const jobId = jobByOp.get(o.userId);
        if (!jobId) continue; // work already submitted or no dispatched job

        const phase = workReminderPhase(o.hoursIn);
        if (!phase) continue;

        const title = phase === 'lunch' ? 'Log your work' : 'Work not logged yet';
        const message = phase === 'lunch'
          ? "Quick reminder to log the work you've performed so far today."
          : "You've been on the clock 7+ hours — please log your work performed before clocking out.";

        const res = await sendReminderOnce(`work_${phase}:${today}`, {
          userId: o.userId,
          tenantId: tenant.id,
          category: 'work_performed_reminder',
          inAppType: 'reminder',
          title,
          message,
          jobOrderId: jobId,
          actionUrl: `/dashboard/job-schedule/${jobId}/work-performed`,
          smsPhone: phoneMap.get(o.userId) ?? null,
        });
        if (res) remindersSent++;
      }
    }

    return NextResponse.json({ success: true, remindersSent });
  } catch (error) {
    console.error('[work-performed-reminders] error:', error);
    return NextResponse.json({ success: false, remindersSent, error: String(error) }, { status: 500 });
  }
}
