export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/timecard/clock-in
 * Clock in with NFC verification, GPS fallback, or remote mode
 *
 * Clock-in methods:
 * - NFC:     Scan registered NFC tag (shop, truck, or jobsite)
 * - GPS:     Legacy geolocation check within shop radius
 * - REMOTE:  Out-of-town with selfie photo + GPS (requires admin approval)
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
      clock_in_method = 'gps',   // 'nfc' | 'gps' | 'remote'
      nfc_tag_id,                 // UUID of the verified NFC tag
      nfc_tag_uid,                // raw NFC tag UID
      // Remote fields
      remote_photo_url,           // selfie URL for remote clock-in
    } = body;

    // Validate clock_in_method to prevent injection of unexpected values
    const VALID_CLOCK_METHODS = ['nfc', 'gps', 'remote'] as const;
    if (!VALID_CLOCK_METHODS.includes(clock_in_method as any)) {
      return NextResponse.json(
        { error: 'Invalid clock_in_method. Must be nfc, gps, or remote.' },
        { status: 400 }
      );
    }

    // Validation - location required for GPS and remote; optional for NFC
    const hasLocation = typeof latitude === 'number' && typeof longitude === 'number';

    if (!hasLocation && clock_in_method !== 'nfc') {
      return NextResponse.json(
        { error: 'Invalid location data. Latitude and longitude are required.' },
        { status: 400 }
      );
    }

    // --- Server-side bypass_nfc verification ---
    // If NFC is required by settings but user is using GPS method, verify they have
    // an admin-issued bypass notification (prevents manual URL param bypass)
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
      if (!nfc_tag_id && !nfc_tag_uid) {
        return NextResponse.json(
          { error: 'NFC tag verification required. Please scan your NFC tag.' },
          { status: 400 }
        );
      }

      // Double-check the tag is valid and active
      const tagQuery = nfc_tag_id
        ? supabaseAdmin.from('nfc_tags').select('id, tag_uid, is_active, label, tag_type').eq('id', nfc_tag_id).maybeSingle()
        : supabaseAdmin.from('nfc_tags').select('id, tag_uid, is_active, label, tag_type').eq('tag_uid', nfc_tag_uid).maybeSingle();

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

    // -- Create timecard entry --
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
      remote_photo_url: remote_photo_url || null,
    };

    if (clock_in_method === 'remote') {
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

    const flags = [];
    if (is_shop_hours) flags.push('Shop Hours');
    if (isNightShift) flags.push('Night Shift');
    if (isMandatoryOvertime) flags.push('Mandatory OT (Weekend)');
    flags.push(`Method: ${clock_in_method.toUpperCase()}`);

    const locationCheck = hasLocation
      ? isWithinShopRadius({ latitude, longitude, accuracy })
      : { isWithinRange: false, distance: 0, distanceFormatted: 'N/A' };

    console.log(`Clock in: ${profile?.full_name || user.email} at ${now.toLocaleTimeString()} [${flags.join(', ')}]`);

    return NextResponse.json(
      {
        success: true,
        message: clock_in_method === 'remote'
          ? 'Remote clock-in recorded. Pending admin verification.'
          : `Clocked in successfully at ${now.toLocaleTimeString()}`,
        data: {
          id: timecard.id,
          clockInTime: timecard.clock_in_time,
          isShopHours: timecard.is_shop_hours,
          isNightShift: timecard.is_night_shift,
          hourType: timecard.hour_type,
          clockInMethod: timecard.clock_in_method,
          needsVerification: clock_in_method === 'remote',
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
