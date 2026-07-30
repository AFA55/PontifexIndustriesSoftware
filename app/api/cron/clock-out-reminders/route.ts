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
 * Dedup via reminder_log (sendReminderOnce). Keys are keyed off the timecard's
 * clock-in DATE so the three reminders group per shift and survive midnight.
 *
 * Authorization: Bearer ${CRON_SECRET}  (fail-closed if env var unset)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendReminderOnce } from '@/lib/send-reminder';

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

      // Phone numbers for SMS fallback (mirrors clock-in-reminders)
      const userIds = Array.from(new Set(openCards.map((t) => t.user_id)));
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, phone, phone_number')
        .in('id', userIds);
      const phoneMap = new Map<string, string | null>(
        (profiles || []).map((p: { id: string; phone: string | null; phone_number: string | null }) => [p.id, p.phone || p.phone_number || null])
      );

      for (const tc of openCards) {
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
    }

    return NextResponse.json({ success: true, remindersSent });
  } catch (error) {
    console.error('[clock-out-reminders] error:', error);
    return NextResponse.json({ success: false, remindersSent, error: String(error) }, { status: 500 });
  }
}
