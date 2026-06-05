export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/clock-in-reminders
 *
 * Runs every 5 minutes via Vercel Cron. Reminds operators to clock in around
 * their scheduled start time.
 *
 *   - "Pre" reminder fires ~5 min BEFORE their earliest scheduled job arrival
 *   - "Post" reminder fires ~5 min AFTER, only if they still haven't clocked in
 *
 * "Start time" = the earliest arrival_time among the operator's jobs scheduled
 * for today (their schedule-board start time). Computed in each tenant's
 * timezone. Each reminder fires at most once per operator per day (reminder_log
 * dedup). Respects per-user notification_preferences.
 *
 * Authorization: Bearer ${CRON_SECRET}  (fail-closed if env var unset)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendReminderOnce } from '@/lib/send-reminder';
import { parseHHMM, todayInTz, nowMinutesInTz, clockInReminderPhase, minutesToLabel } from '@/lib/reminder-timing';

const ACTIVE_STATUSES = ['scheduled', 'assigned', 'dispatched', 'in_route', 'in_progress', 'on_site'];

export async function GET(request: NextRequest) {
  // Auth — fail closed
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let remindersSent = 0;
  const errors: string[] = [];

  try {
    const { data: tenants } = await supabaseAdmin.from('tenants').select('id, timezone');
    if (!tenants) return NextResponse.json({ success: true, remindersSent: 0 });

    for (const tenant of tenants as { id: string; timezone: string | null }[]) {
      const tz = tenant.timezone || 'America/New_York';
      const today = todayInTz(tz);
      const nowMin = nowMinutesInTz(tz);

      // Tenant-wide default start time fallback (for operators scheduled today
      // but with no resolved arrival_time on any of their jobs).
      const { data: tenantRow } = await supabaseAdmin
        .from('tenants')
        .select('default_start_time')
        .eq('id', tenant.id)
        .maybeSingle();
      const defaultStartMin = parseHHMM((tenantRow as { default_start_time: string | null } | null)?.default_start_time ?? null) ?? parseHHMM('07:00')!;

      // 1. Jobs scheduled for the operator today (direct assignment).
      //    No longer drops null arrival_time — those operators fall back to the
      //    tenant default start time below so they still get reminded.
      const { data: jobs } = await supabaseAdmin
        .from('job_orders')
        .select('id, assigned_to, helper_assigned_to, arrival_time, scheduled_date, status')
        .eq('tenant_id', tenant.id)
        .eq('scheduled_date', today)
        .in('status', ACTIVE_STATUSES);

      // 2. Per-day assignment overrides for today
      const { data: dailyAssignments } = await supabaseAdmin
        .from('job_daily_assignments')
        .select('operator_id, helper_id, job_order_id, job_orders(arrival_time)')
        .eq('assignment_date', today);

      // Build operator -> earliest start (minutes). Track who is scheduled today
      // (even without a resolved arrival_time) so they can fall back to the
      // tenant default start time.
      const earliestStart = new Map<string, number>();
      const scheduledOps = new Set<string>();
      const consider = (opId: string | null | undefined, arrival: string | null) => {
        if (!opId) return;
        scheduledOps.add(opId);
        const mins = parseHHMM(arrival);
        if (mins == null) return;
        const cur = earliestStart.get(opId);
        if (cur == null || mins < cur) earliestStart.set(opId, mins);
      };

      for (const j of (jobs || []) as Array<{ assigned_to: string | null; helper_assigned_to: string | null; arrival_time: string | null }>) {
        consider(j.assigned_to, j.arrival_time);
        consider(j.helper_assigned_to, j.arrival_time);
      }
      for (const a of (dailyAssignments || []) as Array<{ operator_id: string | null; helper_id: string | null; job_orders: { arrival_time: string | null } | { arrival_time: string | null }[] | null }>) {
        const jo = Array.isArray(a.job_orders) ? a.job_orders[0] : a.job_orders;
        const arrival = jo?.arrival_time ?? null;
        consider(a.operator_id, arrival);
        consider(a.helper_id, arrival);
      }

      // Operators scheduled today with no resolved start time → tenant default.
      for (const opId of scheduledOps) {
        if (!earliestStart.has(opId)) earliestStart.set(opId, defaultStartMin);
      }

      if (earliestStart.size === 0) continue;

      // PTO / time-off skip — drop any operator who has an operator_time_off row
      // for today (covers pto / sick / unpaid / worked_last_night night-shift
      // recovery / other). Tenant-scoped.
      const { data: timeOff } = await supabaseAdmin
        .from('operator_time_off')
        .select('operator_id')
        .eq('tenant_id', tenant.id)
        .eq('date', today)
        .in('operator_id', Array.from(earliestStart.keys()));
      const offToday = new Set(
        (timeOff || []).map((r: { operator_id: string }) => r.operator_id)
      );
      for (const opId of offToday) earliestStart.delete(opId);

      if (earliestStart.size === 0) continue;

      // Determine who is in a reminder window
      const candidates: { opId: string; phase: 'pre' | 'post'; startMin: number }[] = [];
      for (const [opId, startMin] of earliestStart) {
        const phase = clockInReminderPhase(nowMin, startMin);
        if (phase) candidates.push({ opId, phase, startMin });
      }
      if (candidates.length === 0) continue;

      const opIds = candidates.map((c) => c.opId);

      // Who already clocked in today?
      const { data: timecards } = await supabaseAdmin
        .from('timecards')
        .select('user_id, clock_in_time')
        .eq('date', today)
        .in('user_id', opIds);
      const clockedIn = new Set(
        (timecards || []).filter((t: { clock_in_time: string | null }) => !!t.clock_in_time).map((t: { user_id: string }) => t.user_id)
      );

      // Phone numbers for SMS fallback
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, phone, phone_number')
        .in('id', opIds);
      const phoneMap = new Map<string, string | null>(
        (profiles || []).map((p: { id: string; phone: string | null; phone_number: string | null }) => [p.id, p.phone || p.phone_number || null])
      );

      for (const c of candidates) {
        if (clockedIn.has(c.opId)) continue; // already clocked in — no reminder needed

        const startLabel = minutesToLabel(c.startMin);

        const title = c.phase === 'pre' ? 'Clock in soon' : 'Time to clock in';
        const message = c.phase === 'pre'
          ? `Your shift starts at ${startLabel}. Don't forget to clock in.`
          : `You're scheduled to have started at ${startLabel}. Please clock in now.`;

        const res = await sendReminderOnce(`clock_in_${c.phase}:${today}`, {
          userId: c.opId,
          tenantId: tenant.id,
          category: 'clock_in_reminder',
          inAppType: 'reminder',
          title,
          message,
          actionUrl: '/dashboard/timecard',
          smsPhone: phoneMap.get(c.opId) ?? null,
        });
        if (res) remindersSent++;
      }
    }

    return NextResponse.json({ success: true, remindersSent });
  } catch (error) {
    console.error('[clock-in-reminders] error:', error);
    errors.push(String(error));
    return NextResponse.json({ success: false, remindersSent, errors }, { status: 500 });
  }
}
