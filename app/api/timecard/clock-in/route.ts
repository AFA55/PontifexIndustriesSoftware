export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/timecard/clock-in
 * Clock in with NFC verification, GPS fallback, or remote mode
 *
 * Clock-in methods:
 * - NFC:         Scan registered NFC tag (shop, truck, or jobsite) via Web NFC API or URL tap
 * - GPS:         Legacy geolocation check within shop radius
 * - REMOTE:      Out-of-town with selfie photo + GPS (requires admin approval)
 * - GPS_REMOTE:  Out-of-town GPS-only mode; no photo required; requires admin approval
 * - PIN:         Daily shop PIN entered on device without NFC support
 *
 * Hour categorization rules:
 * - REGULAR:          Mon-Fri, clock-in before 3 PM, non-shop
 * - NIGHT SHIFT:      Mon-Fri, clock-in at or after 3 PM, JOB only (NOT shop hours)
 * - MANDATORY OT:     Saturday or Sunday - always overtime regardless of weekly total
 * - WEEKLY OT:        Calculated at display time when Mon-Fri hours exceed 40
 * - SHOP HOURS:       Flagged separately; never classified as night shift
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isTableNotFoundError } from '@/lib/api-auth';
import { isWithinShopRadius, SHOP_LOCATION, ALLOWED_RADIUS_METERS } from '@/lib/geolocation';

const NIGHT_SHIFT_START_HOUR = 15;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const user = { id: auth.userId, email: auth.userEmail };

    const body = await request.json();
    const {
      latitude,
      longitude,
      accuracy,
      is_shop_hours,
      // NFC fields
      clock_in_method = 'gps',   // 'nfc' | 'gps' | 'remote' | 'gps_remote' | 'pin'
      nfc_tag_id,                 // UUID of the verified NFC tag
      nfc_tag_uid,                // raw NFC tag UID (NDEF text or serial)
      nfc_tag_serial,             // hardware serial number from Web NFC API NDEFReader
      // Remote / approval fields
      remote_photo_url,           // selfie URL for remote clock-in
      requires_approval,          // boolean — true for gps_remote clock-ins
    } = body;

    // Validate clock_in_method to prevent injection of unexpected values
    const VALID_CLOCK_METHODS = ['nfc', 'gps', 'remote', 'gps_remote', 'pin'] as const;
    if (!VALID_CLOCK_METHODS.includes(clock_in_method as any)) {
      return NextResponse.json(
        { error: 'Invalid clock_in_method. Must be nfc, gps, remote, gps_remote, or pin.' },
        { status: 400 }
      );
    }

    // Validation - location required for GPS and remote; optional for NFC and pin
    const hasLocation = typeof latitude === 'number' && typeof longitude === 'number';

    if (!hasLocation && clock_in_method !== 'nfc' && clock_in_method !== 'pin') {
      return NextResponse.json(
        { error: 'Invalid location data. Latitude and longitude are required.' },
        { status: 400 }
      );
    }

    // --- Server-side bypass_nfc verification ---
    // If NFC is required by settings but user is using GPS method, verify they have
    // an admin-issued bypass notification (prevents manual URL param bypass)
    // gps_remote and pin bypass the NFC requirement by design (they use separate approval flows)
    if (clock_in_method === 'gps') {
      try {
        let settingsQuery = supabaseAdmin
          .from('timecard_settings')
          .select('require_nfc');
        if (auth.tenantId) {
          settingsQuery = settingsQuery.eq('tenant_id', auth.tenantId);
        }
        const { data: tcSettings } = await settingsQuery.limit(1).maybeSingle();

        if (tcSettings?.require_nfc) {
          // NFC is required — check for a valid bypass notification from an admin
          const { data: bypassNotification } = await supabaseAdmin
            .from('notifications')
            .select('id')
            .eq('user_id', auth.userId)
            .eq('bypass_nfc', true)
            .eq('is_read', false)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1)
            .maybeSingle();

          if (!bypassNotification) {
            return NextResponse.json(
              { error: 'NFC scan is required to clock in. If you cannot use NFC, ask your supervisor for a bypass.' },
              { status: 403 }
            );
          }

          // Mark the bypass notification as read (single-use)
          Promise.resolve(
            supabaseAdmin
              .from('notifications')
              .update({ is_read: true, read: true, updated_at: new Date().toISOString() })
              .eq('id', bypassNotification.id)
          ).catch(() => {});
        }
      } catch {
        // If settings table doesn't exist, NFC is not required
      }
    }

    // -- Method-specific validation --

    if (clock_in_method === 'nfc') {
      if (!nfc_tag_id && !nfc_tag_uid && !nfc_tag_serial) {
        return NextResponse.json(
          { error: 'NFC tag verification required. Please scan your NFC tag.' },
          { status: 400 }
        );
      }

      // Double-check the tag is valid and active
      const tagQuery = nfc_tag_id
        ? supabaseAdmin.from('nfc_tags').select('id, tag_uid, is_active, label, tag_type').eq('id', nfc_tag_id).maybeSingle()
        : supabaseAdmin.from('nfc_tags').select('id, tag_uid, is_active, label, tag_type').eq('tag_uid', nfc_tag_uid || nfc_tag_serial).maybeSingle();

      const { data: tag } = await tagQuery;

      if (!tag || !tag.is_active) {
        return NextResponse.json(
          { error: 'NFC tag not recognized or deactivated. Contact your supervisor.' },
          { status: 403 }
        );
      }
    } else if (clock_in_method === 'remote') {
      if (!remote_photo_url) {
        return NextResponse.json(
          { error: 'A selfie photo is required for remote clock-in.' },
          { status: 400 }
        );
      }
    } else if (clock_in_method === 'gps_remote') {
      // GPS-only out-of-town mode — just needs valid coordinates; requires admin approval
      if (!hasLocation || (latitude === 0 && longitude === 0)) {
        return NextResponse.json(
          { error: 'GPS coordinates are required for out-of-town clock-in. Enable location access and try again.' },
          { status: 400 }
        );
      }
    } else if (clock_in_method === 'pin') {
      // PIN already verified by /api/timecard/verify-pin before this call; no extra check needed here
    } else {
      // GPS clock-in: verify location within shop radius
      const locationCheck = isWithinShopRadius({ latitude, longitude, accuracy });

      if (!locationCheck.isWithinRange) {
        return NextResponse.json(
          {
            error: `You must be at ${SHOP_LOCATION.name} to clock in with GPS.`,
            details: `You are ${locationCheck.distanceFormatted} away. Maximum allowed distance is ${(ALLOWED_RADIUS_METERS * 3.28084).toFixed(0)} feet.`,
            distance: locationCheck.distance,
            distanceFormatted: locationCheck.distanceFormatted,
            allowedRadius: ALLOWED_RADIUS_METERS,
            hint: 'Try scanning an NFC tag or use Remote Clock-In if you are at a jobsite.',
          },
          { status: 403 }
        );
      }
    }

    // -- Check for active clock-in --
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    const { data: activeTimecard, error: checkError } = await supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('user_id', user.id)
      .is('clock_out_time', null)
      .maybeSingle();

    if (checkError && isTableNotFoundError(checkError)) {
      return NextResponse.json(
        { error: 'Timecard system is not available yet.' },
        { status: 503 }
      );
    }

    if (activeTimecard) {
      return NextResponse.json(
        {
          error: 'You are already clocked in',
          details: `You clocked in at ${new Date(activeTimecard.clock_in_time).toLocaleTimeString()}. Please clock out first.`,
          activeTimecard: { id: activeTimecard.id, clockInTime: activeTimecard.clock_in_time },
        },
        { status: 400 }
      );
    }

    // -- Hour categorization --
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    const dayOfWeek = now.getDay();

    const isMandatoryOvertime = dayOfWeek === 0 || dayOfWeek === 6;
    const isNightShift = !isMandatoryOvertime && !is_shop_hours && currentHour >= NIGHT_SHIFT_START_HOUR;

    let hourType = 'regular';
    if (isMandatoryOvertime) hourType = 'mandatory_overtime';
    else if (isNightShift) hourType = 'night_shift';

    // -- Build insert data --
    const needsApproval = clock_in_method === 'gps_remote' || requires_approval === true;

    const insertData: Record<string, unknown> = {
      user_id: user.id,
      tenant_id: auth.tenantId || null,
      clock_in_time: now.toISOString(),
      clock_in_latitude: latitude,
      clock_in_longitude: longitude,
      clock_in_accuracy: accuracy || null,
      date: todayDate,
      is_approved: false,
      is_shop_hours: is_shop_hours === true,
      is_night_shift: isNightShift,
      hour_type: hourType,
      clock_in_method,
      nfc_tag_id: nfc_tag_id || null,
      nfc_tag_uid: nfc_tag_uid || null,
      nfc_tag_serial: nfc_tag_serial || null,
      remote_photo_url: remote_photo_url || null,
      requires_approval: needsApproval,
    };

    if (clock_in_method === 'remote' || clock_in_method === 'gps_remote') {
      insertData.remote_verified = null; // null = pending review
    }

    const { data: timecard, error: insertError } = await supabaseAdmin
      .from('timecards')
      .insert([insertData])
      .select()
      .single();

    if (insertError) {
      if (isTableNotFoundError(insertError)) {
        return NextResponse.json(
          { error: 'Timecard system is not available yet.' },
          { status: 503 }
        );
      }
      console.error('Error creating timecard:', insertError);
      return NextResponse.json(
        { error: 'Failed to clock in' },
        { status: 500 }
      );
    }

    // -- Late detection --
    // Look up the operator's job for today and check if they arrived late (≥15 min)
    try {
      const { data: todayJobs } = await supabaseAdmin
        .from('job_orders')
        .select('id, arrival_time, shop_arrival_time, customer_name')
        .eq('assigned_to', user.id)
        .eq('scheduled_date', todayDate)
        .in('status', ['assigned', 'dispatched', 'in_route', 'on_site', 'in_progress', 'scheduled'])
        .limit(1);

      if (todayJobs && todayJobs.length > 0) {
        const job = todayJobs[0];
        // Use shop_arrival_time for shop clock-ins, arrival_time for jobsite clock-ins
        const expectedTimeStr: string | null = is_shop_hours ? job.shop_arrival_time : job.arrival_time;

        if (expectedTimeStr) {
          const [hours, minutes] = expectedTimeStr.split(':').map(Number);
          const expectedTime = new Date();
          expectedTime.setHours(hours, minutes, 0, 0);

          const lateMs = now.getTime() - expectedTime.getTime();
          const lateMinutes = Math.floor(lateMs / 60000);

          if (lateMinutes >= 15) {
            // Mark the timecard as late
            await supabaseAdmin
              .from('timecards')
              .update({
                is_late: true,
                late_minutes: lateMinutes,
                scheduled_start_time: expectedTimeStr,
                late_notified_at: now.toISOString(),
              })
              .eq('id', timecard.id);

            // Notify all admins / ops managers in this tenant
            const { data: adminProfiles } = await supabaseAdmin
              .from('profiles')
              .select('id')
              .in('role', ['super_admin', 'operations_manager', 'admin'])
              .eq('tenant_id', auth.tenantId || '');

            const operatorName = profile?.full_name || user.email;
            const actualTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            const notifications = (adminProfiles || []).map((p: { id: string }) => ({
              operator_id: p.id,
              type: 'late_arrival',
              message: `⚠️ ${operatorName} clocked in ${lateMinutes} min late (scheduled: ${expectedTimeStr}, actual: ${actualTimeStr}) — Job: ${job.customer_name}`,
              tenant_id: auth.tenantId || null,
              job_order_id: job.id,
            }));

            if (notifications.length > 0) {
              Promise.resolve(
                supabaseAdmin.from('schedule_notifications').insert(notifications)
              ).catch(() => {});
            }
          }
        }
      }
    } catch {
      // Late detection is non-critical; never block a successful clock-in
    }

    const flags = [];
    if (is_shop_hours) flags.push('Shop Hours');
    if (isNightShift) flags.push('Night Shift');
    if (isMandatoryOvertime) flags.push('Mandatory OT (Weekend)');
    if (needsApproval) flags.push('Needs Approval');
    flags.push(`Method: ${clock_in_method.toUpperCase()}`);

    const locationCheck = hasLocation
      ? isWithinShopRadius({ latitude, longitude, accuracy })
      : { isWithinRange: false, distance: 0, distanceFormatted: 'N/A' };

    console.log(`Clock in: ${profile?.full_name || user.email} at ${now.toLocaleTimeString()} [${flags.join(', ')}]`);

    return NextResponse.json(
      {
        success: true,
        message: clock_in_method === 'remote' || clock_in_method === 'gps_remote'
          ? 'Remote clock-in recorded. Pending admin approval.'
          : `Clocked in successfully at ${now.toLocaleTimeString()}`,
        data: {
          id: timecard.id,
          clockInTime: timecard.clock_in_time,
          isShopHours: timecard.is_shop_hours,
          isNightShift: timecard.is_night_shift,
          hourType: timecard.hour_type,
          clockInMethod: timecard.clock_in_method,
          needsVerification: clock_in_method === 'remote',
          requiresApproval: needsApproval,
          location: {
            latitude: timecard.clock_in_latitude,
            longitude: timecard.clock_in_longitude,
            accuracy: timecard.clock_in_accuracy,
          },
          distanceFromShop: locationCheck.distanceFormatted,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Unexpected error in clock-in route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
