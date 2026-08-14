export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/clock-out-reminders
 *
 * Runs every 15 minutes via Vercel Cron. Nudges operators who are still on the
 * clock to clock out, at escalating thresholds measured from their clock-in:
 *
 *   - 10h → "Still on the clock"
 *   - 12h → "Clock out reminder"
 *   - 15h → "Final clock-out reminder" (last nudge before auto-clockout)
 *
 * Selects OPEN timecards (clocked in, not yet out) with NO date filter — a
 * night-shift card may belong to "yesterday" but still be open. For each card
 * we compute hours-since-clock-in and fire the HIGHEST threshold crossed, so a
 * late/skipped cron tick sends ONE correct message instead of a burst.
 *
 * FOURTH trigger (completion-aware smart reminder): an operator/apprentice who
 * finished ALL of their job tickets for the shift and is still clocked in gets
 * a nudge ~30 min after the last completion — delayed further (up to 2h) when
 * the completed jobsite is a long drive from the shop, so the reminder lands
 * about when they're back, not mid-drive. If they're STILL clocked in an hour
 * past that, management gets one escalation per worker per shift. Pure logic
 * lives in lib/clock-out-reminder.ts (unit-tested).
 *
 * Dedup via reminder_log (sendReminderOnce). Keys are keyed off the timecard's
 * clock-in DATE so the three reminders group per shift and survive midnight.
 *
 * Authorization: Bearer ${CRON_SECRET}  (fail-closed if env var unset)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendReminderOnce } from '@/lib/send-reminder';
import { getTenantShopLocationOrDefault } from '@/lib/geolocation-server';
import { PROFILE_PHONE_SELECT, readProfilePhone } from '@/lib/profile-phone';
import { CREW_SLOT_ROLES } from '@/lib/rbac';
import {
  ESCALATION_AFTER_MINUTES,
  driveMinutesForJob,
  formatMinutesAgo,
  isJobUnfinished,
  reminderDelayMinutes,
  resolveCompletionInstant,
  type CompletionCandidate,
  type ReminderJob,
} from '@/lib/clock-out-reminder';
import { parseHHMM, nowMinutesInTz, middayReminderDue } from '@/lib/reminder-timing';

// How long before the tenant's auto-clockout time to warn still-clocked-in workers.
const PRE_AUTOCLOCKOUT_WARN_MINUTES = 30;

/** Tenant-local minutes-since-midnight (0-1439). */
function tenantLocalMinutes(tz: string): number {
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** '18:00:00' | '18:00' → minutes-since-midnight, or null if unparseable. */
function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function fmt12h(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}

// thresholds in hours → reminder key suffix + copy (plan §4)
const OUT_THRESHOLDS = [
  {
    hours: 10,
    key: '10h',
    title: 'Still on the clock',
    body: "You've been clocked in 10 hours. Don't forget to clock out when you're done.",
  },
  {
    hours: 12,
    key: '12h',
    title: 'Clock out reminder',
    body: '12 hours on the clock — please clock out if your shift has ended.',
  },
  {
    hours: 15,
    key: '15h',
    title: 'Final clock-out reminder',
    body: '15 hours clocked in. Clock out now — your timecard will be auto-closed soon.',
  },
];

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

  try {
    const { data: tenants } = await supabaseAdmin.from('tenants').select('id, timezone');
    if (!tenants) return NextResponse.json({ success: true, remindersSent: 0 });

    const nowMs = Date.now();

    for (const tenant of tenants as { id: string; timezone: string | null }[]) {
      // Open timecards: clocked in, NOT clocked out. No date filter — a
      // night-shift card may belong to yesterday but still be open.
      const { data: open } = await supabaseAdmin
        .from('timecards')
        .select('user_id, clock_in_time, date, is_night_shift')
        .eq('tenant_id', tenant.id)
        .not('clock_in_time', 'is', null)
        .is('clock_out_time', null);

      if (!open || open.length === 0) continue;

      const openCards = open as Array<{ user_id: string; clock_in_time: string; date: string; is_night_shift: boolean | null }>;

      // Pre-auto-clockout warning window: if this tenant auto-closes day/shop cards
      // at a configured local time, warn ~30 min before so people can clock out
      // themselves instead of being auto-closed. Ties into timecard_settings_v2.
      const tz = tenant.timezone || 'America/New_York';
      const { data: tcSettings } = await supabaseAdmin
        .from('timecard_settings_v2')
        .select('auto_clockout_time, auto_clockout_enabled')
        .eq('tenant_id', tenant.id)
        .limit(1)
        .maybeSingle();
      const autoEnabled = tcSettings?.auto_clockout_enabled ?? true;
      const autoMinutes = timeToMinutes(tcSettings?.auto_clockout_time ?? '18:00');
      const localMinutes = tenantLocalMinutes(tz);
      const inWarnWindow =
        autoEnabled && autoMinutes != null &&
        localMinutes >= autoMinutes - PRE_AUTOCLOCKOUT_WARN_MINUTES &&
        localMinutes < autoMinutes;

      // Phone numbers for SMS fallback (mirrors clock-in-reminders) + role/name
      // for the completion-aware pass below.
      const userIds = Array.from(new Set(openCards.map((t) => t.user_id)));
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select(`id, ${PROFILE_PHONE_SELECT}, role, full_name, clock_out_reminder_time`)
        .in('id', userIds);
      type ProfileRow = {
        id: string; phone: string | null; phone_number: string | null;
        role: string | null; full_name: string | null;
        clock_out_reminder_time: string | null;
      };
      const phoneMap = new Map<string, string | null>(
        (profiles || []).map((p: ProfileRow) => [p.id, readProfilePhone(p)])
      );
      const roleMap = new Map<string, string | null>(
        (profiles || []).map((p: ProfileRow) => [p.id, p.role])
      );
      const nameMap = new Map<string, string | null>(
        (profiles || []).map((p: ProfileRow) => [p.id, p.full_name])
      );
      // PERSONAL WALL-CLOCK REMINDER (founder, Aug 14 — for David at 6:30pm).
      // The three thresholds above are measured from clock-in, which suits a
      // crew whose day length varies. This one is a fixed hour, because the
      // failure it prevents is forgetting at the end of the day rather than
      // working a long one. Stored per profile, so it is given to a person, not
      // baked into a role or a name.
      const personalOutMap = new Map<string, number | null>(
        (profiles || []).map((p: ProfileRow) => [
          p.id,
          p.clock_out_reminder_time ? parseHHMM(p.clock_out_reminder_time.slice(0, 5)) : null,
        ])
      );
      const nowMinTz = nowMinutesInTz(tz);

      for (const tc of openCards) {
        const personalMin = personalOutMap.get(tc.user_id);
        if (personalMin != null && middayReminderDue(nowMinTz, personalMin)) {
          const res = await sendReminderOnce(`clock_out_personal:${tc.date}`, {
            userId: tc.user_id,
            tenantId: tenant.id,
            category: 'clock_in_reminder',
            inAppType: 'reminder',
            title: 'Time to clock out',
            message: `It's ${fmt12h(personalMin)} and you're still on the clock. Clock out if your day is done.`,
            actionUrl: '/dashboard/timecard',
            smsPhone: phoneMap.get(tc.user_id) ?? null,
          });
          if (res) remindersSent++;
        }

        // Pre-auto-clockout warning (day/shop cards only — night shifts keep the
        // noon close). Fires once per shift via reminder_log dedup.
        if (inWarnWindow && !tc.is_night_shift && autoMinutes != null) {
          const res = await sendReminderOnce(`clock_out_autowarn:${tc.date}`, {
            userId: tc.user_id,
            tenantId: tenant.id,
            category: 'clock_in_reminder',
            inAppType: 'reminder',
            title: 'Clock out soon',
            message: `You'll be auto-clocked out at ${fmt12h(autoMinutes)}. Clock out now if your day is done.`,
            actionUrl: '/dashboard/timecard',
            smsPhone: phoneMap.get(tc.user_id) ?? null,
          });
          if (res) remindersSent++;
        }

        const hoursIn = (nowMs - new Date(tc.clock_in_time).getTime()) / 3_600_000;

        // Pick the HIGHEST threshold crossed so a late cron tick doesn't fire
        // 10h after 15h. reverse-find = highest first.
        const hit = [...OUT_THRESHOLDS].reverse().find((t) => hoursIn >= t.hours);
        if (!hit) continue;

        // Key off the clock-in DATE so the three reminders group per shift and
        // survive the midnight boundary on long night shifts.
        const res = await sendReminderOnce(`clock_out_${hit.key}:${tc.date}`, {
          userId: tc.user_id,
          tenantId: tenant.id,
          category: 'clock_in_reminder',
          inAppType: 'reminder',
          title: hit.title,
          message: hit.body,
          actionUrl: '/dashboard/timecard',
          smsPhone: phoneMap.get(tc.user_id) ?? null,
        });
        if (res) remindersSent++;
      }

      // ── Fourth trigger: completion-aware smart reminder + admin escalation.
      // Wrapped per-tenant so one tenant's failure never aborts the others.
      try {
        remindersSent += await processCompletionAwareReminders({
          tenantId: tenant.id,
          tz,
          nowMs,
          openCards,
          phoneMap,
          roleMap,
          nameMap,
        });
      } catch (e) {
        console.error(`[clock-out-reminders] completion-aware pass failed (tenant ${tenant.id}):`, e);
      }
    }

    return NextResponse.json({ success: true, remindersSent });
  } catch (error) {
    console.error('[clock-out-reminders] error:', error);
    return NextResponse.json({ success: false, remindersSent, error: String(error) }, { status: 500 });
  }
}

// ─── Fourth trigger: completion-aware smart reminder ─────────────────────────

interface OpenCardRow {
  user_id: string;
  clock_in_time: string;
  date: string;
  is_night_shift: boolean | null;
}

type JobRow = ReminderJob & {
  assigned_to: string | null;
  helper_assigned_to: string | null;
  customer_name: string | null;
};

interface DailyLogRow {
  job_order_id: string;
  operator_id: string;
  day_completed_at: string | null;
}

/** Field roles that get the ticket-completion nudge (never admins). */
// Anyone who can be put on a crew — a supervisor or ops manager who worked a
// job owes the same ticket as the crew, and used to be dropped before the
// slot-aware logic below ever ran.
const REMINDED_ROLES = CREW_SLOT_ROLES as readonly string[];

const JOB_SELECT =
  'id, job_number, customer_name, status, work_completed_at, drive_time, jobsite_latitude, jobsite_longitude, assigned_to, helper_assigned_to';

/**
 * For each still-clocked-in operator/apprentice whose tickets for the shift
 * are ALL complete: nudge them `reminderDelayMinutes` after the last
 * completion (drive-time-aware), and escalate to management an hour after
 * that. Returns the number of notifications sent. Pure decision logic lives
 * in lib/clock-out-reminder.ts.
 */
async function processCompletionAwareReminders(args: {
  tenantId: string;
  tz: string;
  nowMs: number;
  openCards: OpenCardRow[];
  phoneMap: Map<string, string | null>;
  roleMap: Map<string, string | null>;
  nameMap: Map<string, string | null>;
}): Promise<number> {
  const { tenantId, tz, nowMs, openCards, phoneMap, roleMap, nameMap } = args;
  let sent = 0;

  // Only field workers; one card per user (deterministic if dupes ever exist).
  const cardByUser = new Map<string, OpenCardRow>();
  for (const tc of openCards) {
    if (!REMINDED_ROLES.includes(roleMap.get(tc.user_id) || '')) continue;
    if (!cardByUser.has(tc.user_id)) cardByUser.set(tc.user_id, tc);
  }
  if (cardByUser.size === 0) return 0;

  // Shop pin for the drive-time fallback. The accessor's hardcoded default
  // (Patriot's tenant row has NULL coords) is load-bearing — keep using it.
  const shop = await getTenantShopLocationOrDefault(supabaseAdmin, tenantId);

  // Multi-operator crews: jobs beyond the assigned_to/helper_assigned_to slots.
  const eligibleIds = Array.from(cardByUser.keys());
  const { data: crewRows } = await supabaseAdmin
    .from('job_crew')
    .select('job_order_id, user_id')
    .eq('tenant_id', tenantId)
    .in('user_id', eligibleIds);
  const crewJobIdsByUser = new Map<string, string[]>();
  for (const r of (crewRows || []) as { job_order_id: string; user_id: string }[]) {
    const list = crewJobIdsByUser.get(r.user_id) || [];
    list.push(r.job_order_id);
    crewJobIdsByUser.set(r.user_id, list);
  }

  // Lazy — only fetched if an escalation actually fires this tick.
  let adminIds: string[] | null = null;

  // Group by the card's shift date (tenant-local, stamped at clock-in). It
  // keys the job window, the daily-log date, and both dedup keys, so night
  // shifts stay consistent across midnight.
  const dates = Array.from(new Set(Array.from(cardByUser.values()).map((c) => c.date)));

  for (const refDate of dates) {
    const usersForDate = eligibleIds.filter((u) => cardByUser.get(u)!.date === refDate);
    if (usersForDate.length === 0) continue;

    // Job window + dispatched filter mirror the operator clock-out gate
    // (app/api/timecard/clock-out/route.ts) exactly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const windowed = (q: any) =>
      q
        .eq('tenant_id', tenantId)
        .lte('scheduled_date', refDate)
        .or(`scheduled_date.eq.${refDate},end_date.gte.${refDate}`)
        .not('dispatched_at', 'is', null);

    const { data: opJobs } = await windowed(
      supabaseAdmin.from('job_orders').select(JOB_SELECT).in('assigned_to', usersForDate)
    );
    const { data: helperSlotJobs } = await windowed(
      supabaseAdmin.from('job_orders').select(JOB_SELECT).in('helper_assigned_to', usersForDate)
    );
    const crewJobIds = Array.from(
      new Set(usersForDate.flatMap((u) => crewJobIdsByUser.get(u) || []))
    );
    const { data: crewJobs } = crewJobIds.length
      ? await windowed(supabaseAdmin.from('job_orders').select(JOB_SELECT).in('id', crewJobIds))
      : { data: [] as JobRow[] };

    const jobsById = new Map<string, JobRow>();
    for (const j of [...(opJobs || []), ...(helperSlotJobs || []), ...(crewJobs || [])] as JobRow[]) {
      jobsById.set(j.id, j);
    }
    if (jobsById.size === 0) continue;

    // "Done for Today" logs for these jobs on the shift date. Scoped through
    // the tenant-scoped job ids (same shape as the clock-out route — old
    // daily_job_logs rows can predate the tenant_id backfill).
    const { data: logRows } = await supabaseAdmin
      .from('daily_job_logs')
      .select('job_order_id, operator_id, day_completed_at')
      .eq('log_date', refDate)
      .in('job_order_id', Array.from(jobsById.keys()));
    const logsByJob = new Map<string, DailyLogRow[]>();
    for (const l of (logRows || []) as DailyLogRow[]) {
      const list = logsByJob.get(l.job_order_id) || [];
      list.push(l);
      logsByJob.set(l.job_order_id, list);
    }

    for (const userId of usersForDate) {
      const card = cardByUser.get(userId)!;

      // This worker's jobs, deduped. assigned_to ⇒ operator semantics (their
      // OWN daily log satisfies the day — exact mirror of the clock-out
      // gate); helper slot / job_crew ⇒ the job completing or ANY crew daily
      // log satisfies it (helpers don't write operator daily logs).
      const myJobs = new Map<string, JobRow>();
      for (const j of jobsById.values()) {
        if (j.assigned_to === userId || j.helper_assigned_to === userId) myJobs.set(j.id, j);
      }
      for (const jid of crewJobIdsByUser.get(userId) || []) {
        const j = jobsById.get(jid);
        if (j) myJobs.set(jid, j);
      }
      if (myJobs.size === 0) continue; // shop day, no tickets → nothing to key off

      const hasLogFor = (j: JobRow): boolean => {
        const logs = logsByJob.get(j.id) || [];
        return j.assigned_to === userId
          ? logs.some((l) => l.operator_id === userId)
          : logs.length > 0;
      };

      // 1) Any unfinished ticket left → don't nag between jobs. The slot is
      // per-job: lead (assigned_to) uses the operator status list; helper
      // slot / crew uses the helper list (which also excludes 'on_hold' —
      // a parked job must not silence a helper's reminder).
      let blocked = false;
      for (const j of myJobs.values()) {
        const slot = j.assigned_to === userId ? 'operator' : 'helper';
        if (isJobUnfinished(j, hasLogFor(j), slot)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      // 2) Latest completion instant this shift (job completion or Done-for-Today).
      const candidates: CompletionCandidate[] = [];
      for (const j of myJobs.values()) {
        if (j.work_completed_at) candidates.push({ at: j.work_completed_at, job: j });
        for (const l of logsByJob.get(j.id) || []) {
          if (j.assigned_to === userId && l.operator_id !== userId) continue;
          candidates.push({ at: l.day_completed_at, job: j });
        }
      }
      const completion = resolveCompletionInstant(candidates, card.clock_in_time);
      if (!completion) continue; // never-completed → the 10/12/15h reminders cover it

      // 3) Adaptive delay: drive_time column → haversine estimate → base 30 min.
      const delay = reminderDelayMinutes(driveMinutesForJob(completion.job, shop));
      const minutesSince = (nowMs - completion.atMs) / 60_000;
      if (minutesSince < delay) continue;

      // 4) Worker nudge — once per worker per shift date (reminder_log dedup).
      const jobLabel = completion.job?.job_number
        ? `job ${completion.job.job_number}`
        : 'your last job';
      const res = await sendReminderOnce(`clock_out_after_job:${userId}:${card.date}`, {
        userId,
        tenantId,
        category: 'clock_in_reminder',
        inAppType: 'reminder',
        title: 'Job complete — remember to clock out',
        message: `You finished ${jobLabel} ${formatMinutesAgo(minutesSince)} and you're still on the clock. Clock out if your day is done.`,
        actionUrl: '/dashboard/timecard',
        smsPhone: phoneMap.get(userId) ?? null,
      });
      if (res) sent++;

      // 5) Admin escalation an hour past the nudge threshold. reminder_log is
      // UNIQUE(user_id, reminder_key), so keying on the WORKER + shift date
      // while sending to each manager means each manager gets it at most once
      // per worker per shift — idempotent across cron ticks.
      if (minutesSince >= delay + ESCALATION_AFTER_MINUTES) {
        if (adminIds === null) {
          const { data: adminProfiles } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('tenant_id', tenantId)
            .in('role', ['super_admin', 'admin', 'operations_manager']);
          adminIds = ((adminProfiles || []) as { id: string }[]).map((p) => p.id);
        }
        const name = nameMap.get(userId) || 'A worker';
        const finishedAt = new Date(completion.atMs).toLocaleTimeString('en-US', {
          timeZone: tz,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        for (const adminId of adminIds) {
          if (adminId === userId) continue;
          const esc = await sendReminderOnce(`clock_out_escalation:${userId}:${card.date}`, {
            userId: adminId,
            tenantId,
            category: 'clock_in_reminder',
            inAppType: 'warning',
            title: '⏰ Still clocked in after finishing',
            message: `${name} finished their last job at ${finishedAt} and hasn't clocked out.`,
            actionUrl: '/dashboard/admin/timecards',
          });
          if (esc) sent++;
        }
      }
    }
  }

  return sent;
}
