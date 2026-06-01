export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/timecard/clock-out
 * Clock out and calculate total hours
 *
 * Supports multiple clock-out/clock-in cycles per day.
 * Total hours are calculated per entry, not per day.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isTableNotFoundError } from '@/lib/api-auth';
import {
  isWithinShopRadiusForClockout,
  SHOP_LOCATION,
  ALLOWED_RADIUS_CLOCKOUT_METERS,
  ShopOverride,
} from '@/lib/geolocation';

export async function POST(request: NextRequest) {
  try {
    // Authenticate via the shared requireAuth helper (validates token, loads
    // profile role + tenantId, enforces tenant presence for non-super_admin).
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { latitude, longitude, accuracy, clock_out_method, nfc_tag_uid, nfc_tag_id, clock_out_photo_url } = body;
    const isRemoteOut = clock_out_method === 'remote';

    // Validation — GPS coords are required for a normal clock-out; a REMOTE (photo)
    // clock-out is verified by the submitted photo, so coordinates are optional there.
    if (!isRemoteOut && (typeof latitude !== 'number' || typeof longitude !== 'number')) {
      return NextResponse.json(
        { error: 'Invalid location data. Latitude and longitude are required.' },
        { status: 400 }
      );
    }

    // Rate limit: reject if last clock-out was < 60 seconds ago
    const { data: recentOut } = await supabaseAdmin
      .from('timecards')
      .select('id, clock_out_time')
      .eq('user_id', auth.userId)
      .not('clock_out_time', 'is', null)
      .order('clock_out_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentOut?.clock_out_time) {
      const secondsAgo = (Date.now() - new Date(recentOut.clock_out_time).getTime()) / 1000;
      if (secondsAgo < 60) {
        return NextResponse.json(
          { error: 'Please wait before clocking out again.', block_type: 'rate_limited' },
          { status: 429 }
        );
      }
    }

    const hasLocation = typeof latitude === 'number' && typeof longitude === 'number';

    // role and tenantId are already resolved by requireAuth — no extra profile fetch needed.
    const userRole = auth.role || '';

    // Timezone-aware "today" + per-tenant shop GPS pin for clock-out radius check.
    let tenantTz = 'America/New_York';
    let shopOverride: ShopOverride | undefined;
    try {
      if (auth.tenantId) {
        const { data: tenantRow } = await supabaseAdmin
          .from('tenants')
          .select('timezone, shop_latitude, shop_longitude, shop_name, clock_in_radius_meters, clock_out_radius_meters')
          .eq('id', auth.tenantId)
          .maybeSingle();
        if (tenantRow?.timezone) tenantTz = tenantRow.timezone;
        if (tenantRow?.shop_latitude != null && tenantRow?.shop_longitude != null) {
          shopOverride = {
            latitude: tenantRow.shop_latitude,
            longitude: tenantRow.shop_longitude,
            name: tenantRow.shop_name ?? SHOP_LOCATION.name,
            radius: tenantRow.clock_in_radius_meters ?? undefined,
            clockOutRadius: tenantRow.clock_out_radius_meters ?? undefined,
          };
        }
      }
    } catch {
      // Non-critical — fall back to hardcoded Patriot pin
    }
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tenantTz }); // YYYY-MM-DD

    // Compute location check now that shopOverride is available.
    const locationCheck = hasLocation
      ? isWithinShopRadiusForClockout({ latitude, longitude, accuracy }, shopOverride)
      : { isWithinRange: false, distance: 0, distanceFormatted: 'unknown' };

    if (['operator', 'apprentice'].includes(userRole)) {
      // For operators: check if any dispatched jobs are not completed
      if (userRole === 'operator') {
        const { data: incompleteJobs } = await supabaseAdmin
          .from('job_orders')
          .select('id, job_number, customer_name')
          .eq('assigned_to', auth.userId)
          .eq('scheduled_date', today)
          .not('dispatched_at', 'is', null)
          .is('work_completed_at', null)
          .neq('status', 'cancelled');

        if (incompleteJobs && incompleteJobs.length > 0) {
          return NextResponse.json(
            {
              error: 'You must complete work performed for all dispatched jobs before clocking out.',
              block_type: 'work_performed_required',
              incomplete_jobs: incompleteJobs.map((j: any) => ({
                id: j.id,
                job_number: j.job_number,
                customer_name: j.customer_name,
              })),
            },
            { status: 403 }
          );
        }
      }

      // Helpers/apprentices complete a simple work log (what they did) per dispatched
      // job — they do NOT fill the operator's work-performed ticket. Require that log
      // before clock-out so the helper's contribution is captured.
      if (userRole === 'apprentice') {
        const { data: helperJobs } = await supabaseAdmin
          .from('job_orders')
          .select('id, job_number, customer_name')
          .eq('helper_assigned_to', auth.userId)
          .eq('scheduled_date', today)
          .not('dispatched_at', 'is', null)
          .neq('status', 'cancelled');

        if (helperJobs && helperJobs.length > 0) {
          // Check which jobs have work logs
          const jobIds = helperJobs.map((j: any) => j.id);
          const { data: workLogs } = await supabaseAdmin
            .from('helper_work_logs')
            .select('job_order_id')
            .eq('helper_id', auth.userId)
            .eq('log_date', today)
            .in('job_order_id', jobIds);

          const loggedJobIds = new Set((workLogs || []).map((l: any) => l.job_order_id));
          const missingLogs = helperJobs.filter((j: any) => !loggedJobIds.has(j.id));

          if (missingLogs.length > 0) {
            return NextResponse.json(
              {
                error: 'You must submit a work log for all dispatched jobs before clocking out.',
                block_type: 'helper_work_log_required',
                incomplete_jobs: missingLogs.map((j: any) => ({
                  id: j.id,
                  job_number: j.job_number,
                  customer_name: j.customer_name,
                })),
              },
              { status: 403 }
            );
          }
        }
      }
    }

    // Find active timecard (clocked in but not clocked out)
    const { data: activeTimecard, error: fetchError } = await supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('user_id', auth.userId)
      .is('clock_out_time', null)
      .maybeSingle();

    if (fetchError) {
      if (isTableNotFoundError(fetchError)) {
        return NextResponse.json(
          { error: 'Timecard system is not available yet. Please contact your administrator.' },
          { status: 503 }
        );
      }
    }

    if (!activeTimecard) {
      return NextResponse.json(
        {
          error: 'No active clock-in found',
          details: 'You must clock in before you can clock out.',
        },
        { status: 400 }
      );
    }

    // Out-of-radius GPS clock-outs are NO LONGER blocked. We allow the clock-out,
    // flag it as out-of-radius, and notify admins to review/approve afterward.
    // Remote (photo) clock-outs are likewise flagged for review. Nobody is ever
    // prohibited from clocking out.
    const clockInMethod = activeTimecard.clock_in_method || 'gps';
    const shopName = shopOverride?.name ?? SHOP_LOCATION.name;
    const clockedOutOutsideRadius = clockInMethod === 'gps' && hasLocation && !locationCheck.isWithinRange;
    const needsClockOutReview = isRemoteOut || clockedOutOutsideRadius;

    // Calculate total hours
    const now = new Date();
    const clockInTime = new Date(activeTimecard.clock_in_time);
    const milliseconds = now.getTime() - clockInTime.getTime();
    let totalHours = milliseconds / (1000 * 60 * 60); // Convert to hours

    // Fetch lunch settings: per-user override first, fall back to tenant default.
    // profiles.default_lunch_minutes (per-user) wins when non-null.
    // Otherwise read timecard_settings_v2 (current) → timecard_settings (legacy) for tenant default.
    let breakMinutesDeducted = 0;
    try {
      // Fetch only default_lunch_minutes — role and tenantId come from requireAuth above.
      const { data: profileRow } = await supabaseAdmin
        .from('profiles')
        .select('default_lunch_minutes')
        .eq('id', auth.userId)
        .single();
      const tenantId = auth.tenantId;
      const userRoleForLunch: string = auth.role || '';
      const userLunchOverride: number | null = profileRow?.default_lunch_minutes ?? null;

      // Query timecard_settings_v2 first (current table), fall back to legacy timecard_settings.
      let tcSettings: Record<string, any> | null = null;
      if (tenantId) {
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
      }

      const autoDeduct = tcSettings?.auto_deduct_break ?? true;
      const tenantBreakDuration = tcSettings?.break_duration_minutes ?? 30;
      const breakThreshold = tcSettings?.break_threshold_hours ?? 6;
      const breakIsPaid = tcSettings?.break_is_paid ?? false;

      // Per-role lunch baselines. Shop roles get 60 min; all field roles get 30 min.
      // Profile-level default_lunch_minutes still wins over these when set.
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
      const roleDefault = ROLE_DEFAULT_LUNCH[userRoleForLunch];

      // Resolution order:
      //   1. profile.default_lunch_minutes (explicit per-user, wins)
      //   2. role default (shop_manager/shop_help → 60min)
      //   3. tenant default (timecard_settings.break_duration_minutes)
      // 0 is a valid value at any layer ("no lunch by default").
      const effectiveBreakDuration =
        userLunchOverride !== null && userLunchOverride !== undefined
          ? userLunchOverride
          : (roleDefault !== undefined ? roleDefault : tenantBreakDuration);

      if (autoDeduct && totalHours > breakThreshold && effectiveBreakDuration > 0) {
        breakMinutesDeducted = effectiveBreakDuration;
        if (!breakIsPaid) {
          totalHours -= effectiveBreakDuration / 60;
          if (totalHours < 0) totalHours = 0;
        }
      }
    } catch {
      console.warn('Could not fetch lunch settings; defaulting to no deduction');
    }

    // Auto-close any open helper work logs (started but not completed)
    // This handles the case where a helper clocks out without pressing "Complete Day"
    if (['apprentice', 'operator'].includes(userRole)) {
      const { data: openLogs } = await supabaseAdmin
        .from('helper_work_logs')
        .select('id, started_at')
        .eq('helper_id', auth.userId)
        .eq('log_date', today)
        .is('completed_at', null)
        .not('started_at', 'is', null);

      if (openLogs && openLogs.length > 0) {
        for (const log of openLogs) {
          const startMs = new Date(log.started_at).getTime();
          const endMs = now.getTime();
          const hoursWorked = Number(((endMs - startMs) / (1000 * 60 * 60)).toFixed(2));

          await supabaseAdmin
            .from('helper_work_logs')
            .update({
              completed_at: now.toISOString(),
              hours_worked: hoursWorked,
            })
            .eq('id', log.id);
        }
      }
    }

    // Update timecard with clock out data.
    // Both `break_minutes` (legacy column) and `lunch_duration_minutes` /
    // `auto_lunch_applied` (newer semantic columns) are populated. Admins can
    // later override `lunch_duration_minutes` via the admin entries PATCH route
    // — that path stamps lunch_override_by/at/reason for audit.
    const { data: updatedTimecard, error: updateError } = await supabaseAdmin
      .from('timecards')
      .update({
        clock_out_time: now.toISOString(),
        clock_out_latitude: typeof latitude === 'number' ? latitude : null,
        clock_out_longitude: typeof longitude === 'number' ? longitude : null,
        clock_out_accuracy: accuracy || null,
        clock_out_method: clock_out_method || 'gps',
        clock_out_photo_url: clock_out_photo_url || null,
        clock_out_outside_radius: clockedOutOutsideRadius,
        nfc_tag_uid: nfc_tag_uid || null,
        nfc_tag_id: nfc_tag_id || null,
        total_hours: parseFloat(totalHours.toFixed(2)),
        break_minutes: breakMinutesDeducted,
        lunch_duration_minutes: breakMinutesDeducted,
        auto_lunch_applied: breakMinutesDeducted > 0,
      })
      .eq('id', activeTimecard.id)
      .eq('user_id', auth.userId)
      .eq('tenant_id', auth.tenantId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating timecard:', updateError);
      return NextResponse.json(
        { error: 'Failed to clock out' },
        { status: 500 }
      );
    }

    // Get user's profile for name
    const { data: profileForName } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.userId)
      .single();

    console.log(`Clock out: ${profileForName?.full_name || auth.userEmail} at ${now.toLocaleTimeString()}, ${totalHours.toFixed(2)} hrs`);

    // Out-of-radius or remote clock-out → notify admins/ops to review & approve (fire-and-forget).
    if (needsClockOutReview && auth.tenantId) {
      Promise.resolve((async () => {
        const who = profileForName?.full_name || auth.userEmail || 'An employee';
        const reason = clockedOutOutsideRadius
          ? `clocked out ${locationCheck.distanceFormatted} from ${shopName} — outside the allowed radius`
          : 'submitted a remote clock-out (photo)';
        const { data: admins } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('tenant_id', auth.tenantId)
          .in('role', ['super_admin', 'operations_manager', 'admin']);
        if (admins && admins.length > 0) {
          await supabaseAdmin.from('notifications').insert(
            admins.map((a: { id: string }) => ({
              user_id: a.id,
              type: 'timecard_review',
              title: 'Clock-out needs review',
              message: `${who} ${reason}. Tap to review & approve.`,
              tenant_id: auth.tenantId,
              related_entity_type: 'timecard',
              related_entity_id: updatedTimecard.id,
              action_url: `/dashboard/admin/timecards/operator/${auth.userId}`,
              read: false,
              is_read: false,
            }))
          );
        }
      })()).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        message: `Clocked out successfully at ${now.toLocaleTimeString()}`,
        data: {
          id: updatedTimecard.id,
          clockInTime: updatedTimecard.clock_in_time,
          clockOutTime: updatedTimecard.clock_out_time,
          totalHours: updatedTimecard.total_hours,
          isShopHours: updatedTimecard.is_shop_hours,
          isNightShift: updatedTimecard.is_night_shift,
          hourType: updatedTimecard.hour_type,
          location: {
            latitude: updatedTimecard.clock_out_latitude,
            longitude: updatedTimecard.clock_out_longitude,
            accuracy: updatedTimecard.clock_out_accuracy,
          },
          breakMinutesDeducted,
          distanceFromShop: locationCheck.distanceFormatted,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in clock-out route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
