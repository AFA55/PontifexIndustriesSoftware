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
 * the office placed him, he actually clocked in, and nothing was filed for that
 * person on that job on that date. All three — a placement on its own is a plan,
 * not attendance.
 *
 * WHO IS "HIM". Normally the LEAD OPERATOR: on a crew that has a lead, the lead
 * completes the ticket and the helper is blocked from day-complete by design, so
 * chasing the helper asks for something they cannot do.
 *
 * The exception is a crew placed with a HELPER AND NO OPERATOR (founder, Aug 20:
 * crews sometimes run under a sub who is not on Pontifex). There the helper is
 * the only Pontifex person on the job — they get the ticket, their day lands on
 * it, and they file a `helper_work_logs` row. Nobody else is going to. This
 * sweep used to filter those rows out at the query (`.not(operator_id, is,
 * null)`), so the one crew shape with no lead to fall back on was the one shape
 * never chased. It found seven unsubmitted tickets in its first live week.
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
import { isHelperLogHandled } from '@/lib/unfinished-tickets';

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

      // 1. Every placement in the window that put SOMEBODY on a job, for this
      //    tenant. Both seats, because a helper-only crew has no lead to chase.
      //    A row with neither is a skeleton holding a date open and owes nothing.
      const { data: placements } = await supabaseAdmin
        .from('job_daily_assignments')
        .select('job_order_id, operator_id, helper_id, assignment_date')
        .eq('tenant_id', tenant.id)
        .gte('assignment_date', startYMD)
        .lte('assignment_date', endYMD)
        .or('operator_id.not.is.null,helper_id.not.is.null');

      const placementRows = (placements as Array<{
        job_order_id: string; operator_id: string | null; helper_id: string | null; assignment_date: string;
      }>) ?? [];
      if (placementRows.length === 0) continue;

      // WHO OWES EACH DAY. The lead when the row has one; the helper only when it
      // does not. `findMissedTickets` asks about one person per row, so the owner
      // is resolved here and handed to it in the `operator_id` position — the
      // module's rule (placed + clocked in + nothing filed) is identical for both
      // seats, and the paperwork each one owes is what differs.
      const rows = placementRows.map((r) => ({
        job_order_id: r.job_order_id,
        operator_id: r.operator_id ?? r.helper_id ?? null,
        assignment_date: r.assignment_date,
      }));
      // "jobId|userId|date" for the days owed by a HELPER, so the chase reads
      // their helper log rather than an operator ticket they never had.
      const helperOwed = new Set(
        placementRows
          .filter((r) => !r.operator_id && r.helper_id)
          .map((r) => `${r.job_order_id}|${r.helper_id}|${r.assignment_date}`)
      );

      const userIds = Array.from(new Set(rows.map((r) => r.operator_id).filter(Boolean) as string[]));
      const jobIds = Array.from(new Set(rows.map((r) => r.job_order_id).filter(Boolean)));
      const dates = Array.from(new Set(rows.map((r) => r.assignment_date).filter(Boolean)));

      // 2. Who was actually on the clock, 3. what has already been filed,
      // 4. which of these jobs are still worth chasing.
      const [{ data: cards }, { data: logs }, { data: helperLogs }, { data: jobRows }] = await Promise.all([
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
        // The helper side of "already filed". Only consulted for helper-owed
        // days, and a bare "start" row does NOT count — /api/helper-work-log
        // inserts one with an EMPTY description the moment a helper presses
        // start, so treating its existence as filed would silence the chase for
        // every helper who opened the form and walked away. Same predicate the
        // clock-out gate uses (`isHelperLogHandled`).
        supabaseAdmin
          .from('helper_work_logs')
          .select('job_order_id, helper_id, log_date, completed_at, work_description')
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
      for (const h of ((helperLogs as Array<{
        job_order_id: string; helper_id: string; log_date: string;
        completed_at: string | null; work_description: string | null;
      }>) ?? [])) {
        if (!isHelperLogHandled(h)) continue;
        filed.add(`${h.job_order_id}|${h.helper_id}|${h.log_date}`);
      }

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
        // A helper is asked for the thing a helper actually files. Sending them
        // "your ticket is still open" points at a form they do not have — they
        // see the helper view and file a work log.
        const isHelperDay = helperOwed.has(`${m.jobOrderId}|${m.userId}|${m.date}`);
        const day = dayName(m.date);
        const { title, message } = isHelperDay
          ? {
              title: `${day}'s work log is still open`,
              message:
                `You worked ${m.customerName || m.jobNumber || 'a job'} on ${day} and your work log was ` +
                `never submitted. Open it and finish it so the day is on record.`,
            }
          : missedTicketMessage(m, day);
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
          // A helper is sent to their own job page, where HelperWorkLog renders;
          // the operator's work-performed form is not theirs to open.
          actionUrl: isHelperDay
            ? `/dashboard/my-jobs/${m.jobOrderId}`
            : `/dashboard/job-schedule/${m.jobOrderId}/work-performed?date=${m.date}`,
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
