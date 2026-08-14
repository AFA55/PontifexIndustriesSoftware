export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/missing-ticket-reminders
 *
 * Runs every 15 minutes; sends at ~07:15 tenant-local, right after the clock-in
 * nudge, so the first thing a crew sees in the morning is any ticket they left
 * open behind them.
 *
 * A day exists in this system only because somebody tapped "day complete".
 * Dante was at AM King Wednesday AND Thursday, tapped once, and Wednesday
 * vanished — off the printed ticket, out of Daily Progress, out of the day
 * count. Aiden lost Aug 4 on Parkk the same way. Nothing told either of them.
 *
 * The rule for "he missed one" is in lib/missing-ticket.ts and is unit-tested:
 * the office placed him as LEAD, he actually clocked in, and no daily log
 * exists for that person on that job on that date. All three — a placement on
 * its own is a plan, not attendance.
 *
 * Authorization: Bearer ${CRON_SECRET}  (fail-closed if env var unset)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendReminderOnce } from '@/lib/send-reminder';
import { todayInTz, nowMinutesInTz, parseHHMM, middayReminderDue } from '@/lib/reminder-timing';
import { PROFILE_PHONE_SELECT, readProfilePhone } from '@/lib/profile-phone';
import {
  findMissedTickets,
  missedTicketMessage,
  MISSING_TICKET_LOOKBACK_DAYS,
  MISSING_TICKET_TIME,
} from '@/lib/missing-ticket';
import { dayName } from '@/lib/dates';

/**
 * Only OPEN jobs are chased.
 *
 * Cancelled work is obvious — nobody owes a day that was called off. Finished
 * work is the subtler one, and dropping it removed most of the noise from the
 * first live sweep. Dante was placed on Southern Basements Monday and Tuesday
 * and filed nothing either day; he closed the whole job out on Wednesday
 * morning instead. Chasing him for Monday and Tuesday would be asking for
 * paperwork he has already handed in, on a job the customer has signed for.
 * Once a job is complete, a missing middle day is an office correction, not a
 * 7am nudge — and the day's HOURS are on the ticket regardless now, because
 * they come from the clock and the crew ledger rather than from the tap.
 *
 * The case this is for stays covered: AM King is still open, so Dante's
 * Wednesday is still chased.
 */
const CHASEABLE_STATUSES = [
  'scheduled', 'assigned', 'dispatched', 'in_route', 'in_progress', 'on_site',
];

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // `?force=1` runs the sweep regardless of the wall clock, for a live demo or
  // a manual chase. Dedup still applies, so it can never double-send.
  const force = new URL(request.url).searchParams.get('force') === '1';

  let remindersSent = 0;
  const chased: Array<{ user: string; job: string | null; date: string }> = [];

  try {
    const { data: tenants } = await supabaseAdmin.from('tenants').select('id, timezone');
    if (!tenants) return NextResponse.json({ success: true, remindersSent: 0 });

    for (const tenant of tenants as { id: string; timezone: string | null }[]) {
      const tz = tenant.timezone || 'America/New_York';
      const today = todayInTz(tz);

      if (!force) {
        const target = parseHHMM(MISSING_TICKET_TIME);
        if (target === null || !middayReminderDue(nowMinutesInTz(tz), target)) continue;
      }

      // The window ends YESTERDAY: today's ticket is not late yet.
      const end = new Date(`${today}T00:00:00`);
      end.setDate(end.getDate() - 1);
      const start = new Date(end);
      start.setDate(start.getDate() - (MISSING_TICKET_LOOKBACK_DAYS - 1));
      const ymd = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const startYMD = ymd(start);
      const endYMD = ymd(end);

      // 1. Every named LEAD placement in the window, for this tenant.
      const { data: placements } = await supabaseAdmin
        .from('job_daily_assignments')
        .select('job_order_id, operator_id, assignment_date')
        .eq('tenant_id', tenant.id)
        .gte('assignment_date', startYMD)
        .lte('assignment_date', endYMD)
        .not('operator_id', 'is', null);

      const rows = (placements as Array<{
        job_order_id: string; operator_id: string | null; assignment_date: string;
      }>) ?? [];
      if (rows.length === 0) continue;

      const userIds = Array.from(new Set(rows.map((r) => r.operator_id).filter(Boolean) as string[]));
      const jobIds = Array.from(new Set(rows.map((r) => r.job_order_id).filter(Boolean)));
      const dates = Array.from(new Set(rows.map((r) => r.assignment_date).filter(Boolean)));

      // 2. Who was actually on the clock, 3. what has already been filed,
      // 4. which of these jobs are still worth chasing.
      const [{ data: cards }, { data: logs }, { data: jobRows }] = await Promise.all([
        supabaseAdmin
          .from('timecards')
          .select('user_id, date, clock_in_time')
          .in('user_id', userIds)
          .in('date', dates),
        supabaseAdmin
          .from('daily_job_logs')
          .select('job_order_id, operator_id, log_date')
          .in('job_order_id', jobIds)
          .in('log_date', dates),
        supabaseAdmin
          .from('job_orders')
          .select('id, job_number, customer_name, status')
          .in('id', jobIds),
      ]);

      const clockedIn = new Set(
        ((cards as Array<{ user_id: string; date: string; clock_in_time: string | null }>) ?? [])
          .filter((c) => !!c.clock_in_time)
          .map((c) => `${c.user_id}|${c.date}`)
      );
      const filed = new Set(
        ((logs as Array<{ job_order_id: string; operator_id: string; log_date: string }>) ?? [])
          .map((l) => `${l.job_order_id}|${l.operator_id}|${l.log_date}`)
      );

      const jobs = new Map<string, { job_number: string | null; customer_name: string | null }>();
      const chaseable = new Set<string>();
      for (const j of ((jobRows as Array<{
        id: string; job_number: string | null; customer_name: string | null; status: string | null;
      }>) ?? [])) {
        jobs.set(j.id, { job_number: j.job_number, customer_name: j.customer_name });
        if (j.status && CHASEABLE_STATUSES.includes(j.status)) chaseable.add(j.id);
      }

      const missed = findMissedTickets({ placements: rows, clockedIn, filed, jobs })
        .filter((m) => chaseable.has(m.jobOrderId));
      if (missed.length === 0) continue;

      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select(`id, ${PROFILE_PHONE_SELECT}`)
        .in('id', Array.from(new Set(missed.map((m) => m.userId))));
      const phoneMap = new Map<string, string | null>(
        ((profiles as Array<{ id: string; phone: string | null; phone_number: string | null }>) ?? [])
          .map((p) => [p.id, readProfilePhone(p)])
      );

      for (const m of missed) {
        const { title, message } = missedTicketMessage(m, dayName(m.date));
        const res = await sendReminderOnce(`missing_ticket:${m.jobOrderId}:${m.date}`, {
          userId: m.userId,
          tenantId: tenant.id,
          category: 'work_performed_reminder',
          inAppType: 'warning',
          title,
          message,
          jobOrderId: m.jobOrderId,
          // Deep link carries the DATE so the backfill opens on the right day
          // rather than on today — the whole point is that the day is not today.
          actionUrl: `/dashboard/job-schedule/${m.jobOrderId}/work-performed?date=${m.date}`,
          smsPhone: phoneMap.get(m.userId) ?? null,
        });
        if (res) {
          remindersSent++;
          chased.push({ user: m.userId, job: m.jobNumber, date: m.date });
        }
      }
    }

    return NextResponse.json({ success: true, remindersSent, chased });
  } catch (error) {
    console.error('[missing-ticket-reminders] error:', error);
    return NextResponse.json({ success: false, remindersSent, error: String(error) }, { status: 500 });
  }
}
