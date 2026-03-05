/**
 * API Route: POST /api/timecard/clock-in
 * Clock in with location verification
 *
 * Supports:
 * - Multiple clock-ins per day (clock out then clock back in)
 * - Shop hours flag (checkbox on re-clock-in)
 * - Night shift detection (after 3 PM)
 * - Mandatory overtime detection (Saturday/Sunday)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';
import { isWithinShopRadius, SHOP_LOCATION, ALLOWED_RADIUS_METERS } from '@/lib/geolocation';

// Night shift starts at 3:00 PM (15:00)
const NIGHT_SHIFT_START_HOUR = 15;

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
    const { latitude, longitude, accuracy, is_shop_hours } = body;

    // Validation
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'Invalid location data. Latitude and longitude are required.' },
        { status: 400 }
      );
    }

    // Verify location is within shop radius
    const locationCheck = isWithinShopRadius({ latitude, longitude, accuracy });

    if (!locationCheck.isWithinRange) {
      return NextResponse.json(
        {
          error: `You must be at ${SHOP_LOCATION.name} to clock in.`,
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

    // Get user's profile for name/email
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    // Check if user already has an active clock-in (no clock-out yet)
    const { data: activeTimecard, error: checkError } = await supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('user_id', user.id)
      .is('clock_out_time', null)
      .maybeSingle();

    // If table doesn't exist, we can't clock in
    if (checkError && (isTableNotFoundError(checkError))) {
      return NextResponse.json(
        { error: 'Timecard system is not available yet. Please contact your administrator.' },
        { status: 503 }
      );
    }

    if (activeTimecard) {
      return NextResponse.json(
        {
          error: 'You are already clocked in',
          details: `You clocked in at ${new Date(activeTimecard.clock_in_time).toLocaleTimeString()}. Please clock out first.`,
          activeTimecard: {
            id: activeTimecard.id,
            clockInTime: activeTimecard.clock_in_time,
          },
        },
        { status: 400 }
      );
    }

    // Determine hour categorization
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentHour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Night shift: clocking in at or after 3 PM
    const isNightShift = currentHour >= NIGHT_SHIFT_START_HOUR;

    // Mandatory overtime: Saturday (6) or Sunday (0)
    const isMandatoryOvertime = dayOfWeek === 0 || dayOfWeek === 6;

    // Determine hour_type
    let hourType = 'regular';
    if (isMandatoryOvertime) {
      hourType = 'mandatory_overtime';
    } else if (isNightShift) {
      hourType = 'night_shift';
    }
    // Note: weekly overtime (>40 hrs) is calculated at display time, not at clock-in

    // Create new timecard entry
    const { data: timecard, error: insertError } = await supabaseAdmin
      .from('timecards')
      .insert([
        {
          user_id: user.id,
          clock_in_time: now.toISOString(),
          clock_in_latitude: latitude,
          clock_in_longitude: longitude,
          clock_in_accuracy: accuracy || null,
          date: todayDate,
          is_approved: false,
          is_shop_hours: is_shop_hours === true,
          is_night_shift: isNightShift,
          hour_type: hourType,
        },
      ])
      .select()
      .single();

    if (insertError) {
      if (isTableNotFoundError(insertError)) {
        return NextResponse.json(
          { error: 'Timecard system is not available yet. Please contact your administrator.' },
          { status: 503 }
        );
      }
      console.error('Error creating timecard:', insertError);
      return NextResponse.json(
        { error: 'Failed to clock in', details: insertError.message },
        { status: 500 }
      );
    }

    const flags = [];
    if (is_shop_hours) flags.push('🏭 Shop Hours');
    if (isNightShift) flags.push('🌙 Night Shift');
    if (isMandatoryOvertime) flags.push('⚠️ Mandatory OT (Weekend)');

    console.log(`✅ User ${profile?.full_name || user.email} clocked in at ${now.toLocaleTimeString()}`);
    console.log(`📍 Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (${locationCheck.distanceFormatted} from shop)`);
    if (flags.length > 0) console.log(`🏷️ Flags: ${flags.join(', ')}`);

    return NextResponse.json(
      {
        success: true,
        message: `Clocked in successfully at ${now.toLocaleTimeString()}`,
        data: {
          id: timecard.id,
          clockInTime: timecard.clock_in_time,
          isShopHours: timecard.is_shop_hours,
          isNightShift: timecard.is_night_shift,
          hourType: timecard.hour_type,
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
  } catch (error: any) {
    console.error('Unexpected error in clock-in route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
