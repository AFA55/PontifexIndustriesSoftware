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
import { isTableNotFoundError } from '@/lib/api-auth';
import { isWithinShopRadius, SHOP_LOCATION, ALLOWED_RADIUS_METERS } from '@/lib/geolocation';

export async function POST(request: NextRequest) {
  try {
    // Get user from Supabase session (server-side)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { latitude, longitude, accuracy } = body;

    // Validation
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'Invalid location data. Latitude and longitude are required.' },
        { status: 400 }
      );
    }

    // Verify location is within shop radius — but only enforce for GPS-clocked-in users.
    // NFC and remote clock-ins may be at jobsites, so we record location but don't block.
    const hasLocation = typeof latitude === 'number' && typeof longitude === 'number';
    const locationCheck = hasLocation
      ? isWithinShopRadius({ latitude, longitude, accuracy })
      : { isWithinRange: false, distance: 0, distanceFormatted: 'unknown' };

    // Look up how this user clocked in to decide whether to enforce GPS radius
    // (We fetch the active timecard below, so we'll do the enforcement check after that)

    // Check for incomplete dispatched jobs (work-performed hard block)
    const { data: userProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const userRole = userProfile?.role || '';
    const today = new Date().toISOString().split('T')[0];

    if (['operator', 'apprentice'].includes(userRole)) {
      // For operators: check if any dispatched jobs are not completed
      if (userRole === 'operator') {
        const { data: incompleteJobs } = await supabaseAdmin
          .from('job_orders')
          .select('id, job_number, customer_name')
          .eq('assigned_to', user.id)
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

      // For helpers/apprentices: check if work log is submitted for dispatched jobs
      if (userRole === 'apprentice') {
        const { data: helperJobs } = await supabaseAdmin
          .from('job_orders')
          .select('id, job_number, customer_name')
          .eq('helper_assigned_to', user.id)
          .eq('scheduled_date', today)
          .not('dispatched_at', 'is', null)
          .neq('status', 'cancelled');

        if (helperJobs && helperJobs.length > 0) {
          // Check which jobs have work logs
          const jobIds = helperJobs.map((j: any) => j.id);
          const { data: workLogs } = await supabaseAdmin
            .from('helper_work_logs')
            .select('job_order_id')
            .eq('helper_id', user.id)
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
      .eq('user_id', user.id)
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

    // Enforce GPS radius check for GPS-based clock-ins only.
    // NFC and remote users are at jobsites, so we just record their location.
    const clockInMethod = activeTimecard.clock_in_method || 'gps';
    if (clockInMethod === 'gps' && hasLocation && !locationCheck.isWithinRange) {
      return NextResponse.json(
        {
          error: `You must be at ${SHOP_LOCATION.name} to clock out.`,
          details: `You are ${locationCheck.distanceFormatted} away. Maximum allowed distance is ${(ALLOWED_RADIUS_METERS * 3.28084).toFixed(0)} feet (${ALLOWED_RADIUS_METERS}m).`,
          distance: locationCheck.distance,
          distanceFormatted: locationCheck.distanceFormatted,
          allowedRadius: ALLOWED_RADIUS_METERS,
          shopLocation: {
            latitude: SHOP_LOCATION.latitude,
            longitude: SHOP_LOCATION.longitude,
            name: SHOP_LOCATION.name,
          },
          userLocation: { latitude, longitude, accuracy },
        },
        { status: 403 }
      );
    }

    // Calculate total hours
    const now = new Date();
    const clockInTime = new Date(activeTimecard.clock_in_time);
    const milliseconds = now.getTime() - clockInTime.getTime();
    let totalHours = milliseconds / (1000 * 60 * 60); // Convert to hours

    // Fetch tenant timecard settings for break auto-deduction
    let breakMinutesDeducted = 0;
    try {
      // Get tenant_id from user's profile
      const { data: tenantProfile } = await supabaseAdmin
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();
      const tenantId = tenantProfile?.tenant_id;
      let settingsQuery = supabaseAdmin
        .from('timecard_settings')
        .select('auto_deduct_break, break_duration_minutes, break_threshold_hours, break_is_paid');
      if (tenantId) {
        settingsQuery = settingsQuery.eq('tenant_id', tenantId);
      }
      const { data: tcSettings } = await settingsQuery.limit(1).maybeSingle();

      const autoDeduct = tcSettings?.auto_deduct_break ?? true;
      const breakDuration = tcSettings?.break_duration_minutes ?? 30;
      const breakThreshold = tcSettings?.break_threshold_hours ?? 6;
      const breakIsPaid = tcSettings?.break_is_paid ?? false;

      if (autoDeduct && totalHours > breakThreshold) {
        breakMinutesDeducted = breakDuration;
        if (!breakIsPaid) {
          // Subtract break time from total hours
          totalHours -= breakDuration / 60;
          if (totalHours < 0) totalHours = 0;
        }
      }
    } catch {
      // If settings table doesn't exist or query fails, skip break deduction
      console.warn('Could not fetch timecard settings for break deduction');
    }

    // Auto-close any open helper work logs (started but not completed)
    // This handles the case where a helper clocks out without pressing "Complete Day"
    if (['apprentice', 'operator'].includes(userRole)) {
      const { data: openLogs } = await supabaseAdmin
        .from('helper_work_logs')
        .select('id, started_at')
        .eq('helper_id', user.id)
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

    // Update timecard with clock out data
    const { data: updatedTimecard, error: updateError } = await supabaseAdmin
      .from('timecards')
      .update({
        clock_out_time: now.toISOString(),
        clock_out_latitude: latitude,
        clock_out_longitude: longitude,
        clock_out_accuracy: accuracy || null,
        total_hours: parseFloat(totalHours.toFixed(2)),
        break_minutes: breakMinutesDeducted,
      })
      .eq('id', activeTimecard.id)
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
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    console.log(`Clock out: ${profile?.full_name || user.email} at ${now.toLocaleTimeString()}, ${totalHours.toFixed(2)} hrs`);

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
