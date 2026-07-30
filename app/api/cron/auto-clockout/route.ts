export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/auto-clockout
 *
 * Runs HOURLY via Vercel Cron. Finds workers who forgot to clock out and
 * auto-closes their timecards, honoring each tenant's configured clock-out time.
 *
 * Business rules:
 *   - Day/shop shift (is_night_shift = false OR null): closed at the tenant's
 *       configured `timecard_settings_v2.auto_clockout_time` (default 18:00 = 6pm
 *       local), once the tenant-local wall-clock has reached that time. Skipped
 *       entirely when `auto_clockout_enabled = false`.
 *   - Night shift (is_night_shift = true): closed at local noon (unchanged).
 *   - Never auto-close a timecard opened in the last 4 hours (just clocked in).
 *   - Records auto_closed = true and a note on the timecard.
 *   - Sends in-app notifications to the worker and to all admins/ops_managers.
 *   - Idempotent: only OPEN (clock_out_time IS NULL, auto_closed = false) cards
 *     are touched, so hourly re-runs never double-close.
 *
 * Authorization: Bearer ${CRON_SECRET}
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Current tenant-local wall-clock time as 'HH:MM' (24h). */
function tenantLocalHHMM(tenantTz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tenantTz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

/**
 * Given a tenant timezone (IANA string) and a wall-clock time (HH:MM),
 * return the UTC instant for that wall-clock time on today's date in that tz.
 *
 * e.g. tenantTz='America/New_York', wallTime='18:00' →
 *   returns the UTC instant that corresponds to 6pm ET today.
 */
function wallTimeToUTC(tenantTz: string, wallTime: string): Date {
  // Get today's date string in the tenant's timezone
  const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tenantTz }).format(new Date());
  // Build a datetime string interpreted as tenant-local time
  const localDateTimeStr = `${todayLocal}T${wallTime}:00`;
  // Parse it: JavaScript Date will interpret this as local browser time if we
  // don't specify a zone. To avoid that, we compute the UTC offset manually.
  const zoned = new Date(
    new Date(localDateTimeStr + '+00:00').toLocaleString('en-US', { timeZone: tenantTz })
  );
  // Better approach: use Intl to find the offset
  const referenceEpoch = Date.now();
  const utcStr = new Date(referenceEpoch).toLocaleString('en-US', {
    timeZone: 'UTC',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const localStr = new Date(referenceEpoch).toLocaleString('en-US', {
    timeZone: tenantTz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const offsetMs = Date.parse(utcStr.replace(',', '')) - Date.parse(localStr.replace(',', ''));

  // Parse the local wall-clock time and add the UTC offset to get UTC instant
  const localMs = Date.parse(localDateTimeStr);
  return new Date(localMs + offsetMs);
}

/** Format a Date as HH:MM in a given timezone for display. */
function formatTime(date: Date, tz: string): string {
  return date.toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── Lunch settings helper (mirrors clock-out route logic) ────────────────────

const ROLE_DEFAULT_LUNCH: Record<string, number> = {
  shop_manager: 60,
  shop_help: 60,
  operator: 30,
  apprentice: 30,
  supervisor: 30,
  salesman: 30,
  operations_manager: 30,
  admin: 30,
  super_admin: 30,
};

interface LunchResult {
  breakMinutesDeducted: number;
  autoLunchApplied: boolean;
}

async function computeLunchDeduction(
  tenantId: string,
  userRole: string,
  userLunchOverride: number | null,
  clockInMs: number,
  clockOutMs: number
): Promise<LunchResult> {
  const totalHoursRaw = (clockOutMs - clockInMs) / (1000 * 60 * 60);

  let tcSettings: Record<string, any> | null = null;
  try {
    const { data: v2 } = await supabaseAdmin
      .from('timecard_settings_v2')
      .select('auto_deduct_break, break_duration_minutes, break_threshold_hours, break_is_paid')
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();
    if (v2) {
      tcSettings = v2;
    } else {
      const { data: v1 } = await supabaseAdmin
        .from('timecard_settings')
        .select('auto_deduct_break, break_duration_minutes, break_threshold_hours, break_is_paid')
        .eq('tenant_id', tenantId)
        .limit(1)
        .maybeSingle();
      tcSettings = v1 ?? null;
    }
  } catch {
    // non-critical
  }

  const autoDeduct = tcSettings?.auto_deduct_break ?? true;
  const tenantBreakDuration = tcSettings?.break_duration_minutes ?? 30;
  const breakThreshold = tcSettings?.break_threshold_hours ?? 6;

  const roleDefault = ROLE_DEFAULT_LUNCH[userRole];
  const effectiveBreakDuration =
    userLunchOverride !== null && userLunchOverride !== undefined
      ? userLunchOverride
      : roleDefault !== undefined
        ? roleDefault
        : tenantBreakDuration;

  if (autoDeduct && totalHoursRaw > breakThreshold && effectiveBreakDuration > 0) {
    return { breakMinutesDeducted: effectiveBreakDuration, autoLunchApplied: true };
  }
  return { breakMinutesDeducted: 0, autoLunchApplied: false };
}

// ─── Per-card close (shared by the day-shift + night-shift passes) ────────────

interface StaleCard {
  id: string;
  user_id: string;
  clock_in_time: string;
  is_night_shift: boolean | null;
  is_shop_hours: boolean | null;
  tenant_id: string;
}

/** Close one stale card to `clockOutTarget`. Returns true if it actually closed. */
async function closeCard(
  tc: StaleCard,
  clockOutTarget: Date,
  tenantId: string,
  tenantTz: string,
  adminIds: string[],
): Promise<boolean> {
  const clockInMs = new Date(tc.clock_in_time).getTime();
  const clockOutMs = clockOutTarget.getTime();
  // Never set a clock-out before clock-in (e.g. target time is earlier today).
  if (clockOutMs <= clockInMs) return false;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, role, default_lunch_minutes')
    .eq('id', tc.user_id)
    .maybeSingle();

  const userRole: string = profile?.role || 'operator';
  const userLunchOverride: number | null = profile?.default_lunch_minutes ?? null;
  const operatorName: string = profile?.full_name || 'Unknown worker';

  const { breakMinutesDeducted, autoLunchApplied } = await computeLunchDeduction(
    tenantId, userRole, userLunchOverride, clockInMs, clockOutMs,
  );

  const rawHours = (clockOutMs - clockInMs) / (1000 * 60 * 60);
  const netHours = Math.max(0, rawHours - breakMinutesDeducted / 60);
  const totalHours = parseFloat(netHours.toFixed(2));

  const { error: updateError } = await supabaseAdmin
    .from('timecards')
    .update({
      clock_out_time: clockOutTarget.toISOString(),
      total_hours: totalHours,
      break_minutes: breakMinutesDeducted,
      lunch_duration_minutes: breakMinutesDeducted,
      auto_lunch_applied: autoLunchApplied,
      auto_closed: true,
      notes: 'Auto-closed: forgot to clock out',
    })
    .eq('id', tc.id)
    .is('clock_out_time', null); // race-guard: don't clobber a real clock-out

  if (updateError) {
    console.error(`[auto-clockout] Failed to close timecard ${tc.id}:`, updateError);
    return false;
  }

  const timeStr = formatTime(clockOutTarget, tenantTz);
  const workerNotif = {
    recipient_id: tc.user_id,
    type: 'auto_clock_out',
    title: 'Clocked Out Automatically',
    message: `You were automatically clocked out at ${timeStr} because no clock-out was recorded. Please review your timecard and submit a correction if needed.`,
    tenant_id: tenantId,
    job_order_id: null as string | null,
    read: false,
    metadata: { timecard_id: tc.id, clock_out_time: clockOutTarget.toISOString(), total_hours: totalHours },
  };
  const adminNotifs = adminIds
    .filter((id) => id !== tc.user_id)
    .map((adminId) => ({
      recipient_id: adminId,
      type: 'auto_clock_out_admin',
      title: 'Auto Clock-Out',
      message: `${operatorName} was automatically clocked out at ${timeStr} — they may need to submit a time correction.`,
      tenant_id: tenantId,
      job_order_id: null as string | null,
      read: false,
      metadata: {
        operator_id: tc.user_id, operator_name: operatorName, timecard_id: tc.id,
        clock_out_time: clockOutTarget.toISOString(), total_hours: totalHours,
      },
    }));
  Promise.resolve(supabaseAdmin.from('schedule_notifications').insert([workerNotif, ...adminNotifs])).catch(() => {});
  return true;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Verify CRON_SECRET — fail-closed if env var not configured
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff4h = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  const { data: tenants, error: tenantsError } = await supabaseAdmin
    .from('tenants')
    .select('id, timezone')
    .not('id', 'is', null);

  if (tenantsError) {
    console.error('[auto-clockout] Failed to fetch tenants:', tenantsError);
    return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 });
  }

  let closedCount = 0;

  for (const tenant of tenants ?? []) {
    const tenantId: string = tenant.id;
    const tenantTz: string = tenant.timezone || 'America/New_York';
    const localNow = tenantLocalHHMM(tenantTz);

    // Per-tenant configured day/shop auto-clockout time (default 18:00 = 6pm).
    const { data: settings } = await supabaseAdmin
      .from('timecard_settings_v2')
      .select('auto_clockout_time, auto_clockout_enabled')
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();
    const dayEnabled = settings?.auto_clockout_enabled ?? true;
    const dayTime = (settings?.auto_clockout_time ?? '18:00').slice(0, 5); // 'HH:MM'

    // Admin recipients for notifications (once per tenant).
    const { data: adminProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('role', ['super_admin', 'admin', 'operations_manager']);
    const adminIds: string[] = (adminProfiles || []).map((p: { id: string }) => p.id);

    // Pass 1 — DAY / SHOP shifts: close at the configured time, once local wall-clock reaches it.
    if (dayEnabled && localNow >= dayTime) {
      const target = wallTimeToUTC(tenantTz, dayTime);
      const { data: dayCards } = await supabaseAdmin
        .from('timecards')
        .select('id, user_id, clock_in_time, is_night_shift, is_shop_hours, tenant_id')
        .eq('tenant_id', tenantId)
        .is('clock_out_time', null)
        .eq('auto_closed', false)
        .lt('clock_in_time', cutoff4h)
        .or('is_night_shift.is.null,is_night_shift.eq.false');
      for (const tc of (dayCards || []) as StaleCard[]) {
        try { if (await closeCard(tc, target, tenantId, tenantTz, adminIds)) closedCount++; }
        catch (e) { console.error(`[auto-clockout] day card ${tc.id}:`, e); }
      }
    }

    // Pass 2 — NIGHT shifts: close at local noon (unchanged behavior).
    if (localNow >= '12:00') {
      const target = wallTimeToUTC(tenantTz, '12:00');
      const { data: nightCards } = await supabaseAdmin
        .from('timecards')
        .select('id, user_id, clock_in_time, is_night_shift, is_shop_hours, tenant_id')
        .eq('tenant_id', tenantId)
        .is('clock_out_time', null)
        .eq('auto_closed', false)
        .lt('clock_in_time', cutoff4h)
        .eq('is_night_shift', true);
      for (const tc of (nightCards || []) as StaleCard[]) {
        try { if (await closeCard(tc, target, tenantId, tenantTz, adminIds)) closedCount++; }
        catch (e) { console.error(`[auto-clockout] night card ${tc.id}:`, e); }
      }
    }
  }

  console.log(`[auto-clockout] Run complete. Closed ${closedCount} timecard(s) across ${(tenants ?? []).length} tenant(s).`);
  return NextResponse.json({
    success: true,
    closed_count: closedCount,
    tenant_count: (tenants ?? []).length,
  });
}
