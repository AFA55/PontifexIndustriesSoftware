export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/auto-clockout
 *
 * Runs twice a day (UTC 00:00 and UTC 12:00) via Vercel Cron.
 * Finds workers who forgot to clock out and auto-closes their timecards.
 *
 * Business rules:
 *   - Morning/shop shift (is_night_shift = false OR is_shop_hours = true):
 *       processed at UTC midnight → clock-out set to midnight in tenant's timezone
 *   - Night shift (is_night_shift = true):
 *       processed at UTC noon → clock-out set to noon in tenant's timezone
 *   - Never auto-close a timecard opened in the last 4 hours (just clocked in)
 *   - Records auto_closed = true and a note on the timecard
 *   - Sends in-app notifications to the worker and to all admins/ops_managers in the tenant
 *
 * Authorization: Bearer ${CRON_SECRET}
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return the current UTC hour (0-23). */
function utcHour(): number {
  return new Date().getUTCHours();
}

/**
 * Given a tenant timezone (IANA string) and a wall-clock time (HH:MM),
 * return the UTC ISO string for that wall-clock time on today's date in that tz.
 *
 * e.g. tenantTz='America/New_York', wallTime='00:00' →
 *   returns the UTC instant that corresponds to midnight ET today.
 */
function wallTimeToUTC(tenantTz: string, wallTime: '00:00' | '12:00'): Date {
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

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Verify CRON_SECRET — fail-closed if env var not configured
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Determine which shift subset to process based on current UTC hour.
  // Vercel fires at 00:00 UTC and 12:00 UTC.
  const hour = utcHour();
  const isMidnightRun = hour < 6; // midnight UTC fires ≈ 00:xx
  const isNoonRun = hour >= 6 && hour < 18; // noon UTC fires ≈ 12:xx

  if (!isMidnightRun && !isNoonRun) {
    // Shouldn't happen given the cron schedule, but guard anyway
    return NextResponse.json({ success: true, closed_count: 0, message: 'No-op: outside expected run windows' });
  }

  const cutoff4h = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  // Fetch all tenants so we can process each timezone correctly
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

    // Compute the natural clock-out time for this run in this tenant's timezone
    const wallTime: '00:00' | '12:00' = isMidnightRun ? '00:00' : '12:00';
    const clockOutTarget = wallTimeToUTC(tenantTz, wallTime);

    // For midnight run → close morning/shop shift timecards (is_night_shift = false OR is_shop_hours = true)
    // For noon run    → close night shift timecards (is_night_shift = true)
    let query = supabaseAdmin
      .from('timecards')
      .select(`
        id,
        user_id,
        clock_in_time,
        is_night_shift,
        is_shop_hours,
        tenant_id
      `)
      .eq('tenant_id', tenantId)
      .is('clock_out_time', null)
      .eq('auto_closed', false)
      .lt('clock_in_time', cutoff4h); // must have been open for more than 4 hours

    if (isMidnightRun) {
      // Morning or shop shift: is_night_shift is false (or null)
      query = query.or('is_night_shift.is.null,is_night_shift.eq.false');
    } else {
      // Night shift only
      query = query.eq('is_night_shift', true);
    }

    const { data: staleTimecards, error: tcError } = await query;

    if (tcError) {
      console.error(`[auto-clockout] Tenant ${tenantId} fetch error:`, tcError);
      continue;
    }
    if (!staleTimecards || staleTimecards.length === 0) continue;

    // Fetch admin/ops profiles for this tenant (for admin notifications)
    const { data: adminProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('role', ['super_admin', 'admin', 'operations_manager']);

    const adminIds: string[] = (adminProfiles || []).map((p: { id: string }) => p.id);

    for (const tc of staleTimecards) {
      try {
        const clockInMs = new Date(tc.clock_in_time).getTime();
        const clockOutMs = clockOutTarget.getTime();

        // Safety: if the natural clock-out time is before clock-in (e.g. we're
        // running ahead of midnight in a western timezone) skip — not stale yet.
        if (clockOutMs <= clockInMs) continue;

        // Fetch the worker's profile for lunch override and role
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('full_name, role, default_lunch_minutes')
          .eq('id', tc.user_id)
          .maybeSingle();

        const userRole: string = profile?.role || 'operator';
        const userLunchOverride: number | null = profile?.default_lunch_minutes ?? null;
        const operatorName: string = profile?.full_name || 'Unknown worker';

        // Calculate total hours with lunch deduction
        const { breakMinutesDeducted, autoLunchApplied } = await computeLunchDeduction(
          tenantId,
          userRole,
          userLunchOverride,
          clockInMs,
          clockOutMs
        );

        const rawHours = (clockOutMs - clockInMs) / (1000 * 60 * 60);
        const netHours = Math.max(0, rawHours - breakMinutesDeducted / 60);
        const totalHours = parseFloat(netHours.toFixed(2));

        // Auto-close the timecard
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
          .eq('id', tc.id);

        if (updateError) {
          console.error(`[auto-clockout] Failed to close timecard ${tc.id}:`, updateError);
          continue;
        }

        closedCount++;
        const timeStr = formatTime(clockOutTarget, tenantTz);

        // ─── Notifications (fire-and-forget) ─────────────────────────────────

        const workerNotif = {
          recipient_id: tc.user_id,
          type: 'auto_clock_out',
          title: 'Clocked Out Automatically',
          message: `You were automatically clocked out at ${timeStr} because no clock-out was recorded. Please review your timecard and submit a correction if needed.`,
          tenant_id: tenantId,
          job_order_id: null as string | null,
          read: false,
          metadata: {
            timecard_id: tc.id,
            clock_out_time: clockOutTarget.toISOString(),
            total_hours: totalHours,
          },
        };

        const adminNotifs = adminIds
          .filter((id) => id !== tc.user_id) // don't double-notify if admin is also the worker
          .map((adminId) => ({
            recipient_id: adminId,
            type: 'auto_clock_out_admin',
            title: 'Auto Clock-Out',
            message: `${operatorName} was automatically clocked out at ${timeStr} — they may need to submit a time correction.`,
            tenant_id: tenantId,
            job_order_id: null as string | null,
            read: false,
            metadata: {
              operator_id: tc.user_id,
              operator_name: operatorName,
              timecard_id: tc.id,
              clock_out_time: clockOutTarget.toISOString(),
              total_hours: totalHours,
            },
          }));

        const allNotifs = [workerNotif, ...adminNotifs];
        if (allNotifs.length > 0) {
          Promise.resolve(
            supabaseAdmin.from('schedule_notifications').insert(allNotifs)
          ).catch(() => {});
        }
      } catch (perTcErr) {
        console.error(`[auto-clockout] Error processing timecard ${tc.id}:`, perTcErr);
      }
    }
  }

  console.log(`[auto-clockout] Run complete. Closed ${closedCount} timecard(s) across ${(tenants ?? []).length} tenant(s).`);

  return NextResponse.json({
    success: true,
    run_type: isMidnightRun ? 'midnight' : 'noon',
    closed_count: closedCount,
    tenant_count: (tenants ?? []).length,
    // Note: per-timecard details omitted from response to avoid leaking PII (user_id, timecard_id).
    // Closed timecards are visible in the admin timecard review page.
  });
}
