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

    // Verify location is within shop radius
    const locationCheck = isWithinShopRadius({ latitude, longitude, accuracy });

    if (!locationCheck.isWithinRange) {
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

    // Calculate total hours
    const now = new Date();
    const clockInTime = new Date(activeTimecard.clock_in_time);
    const milliseconds = now.getTime() - clockInTime.getTime();
    const totalHours = milliseconds / (1000 * 60 * 60); // Convert to hours

    // Update timecard with clock out data
    const { data: updatedTimecard, error: updateError } = await supabaseAdmin
      .from('timecards')
      .update({
        clock_out_time: now.toISOString(),
        clock_out_latitude: latitude,
        clock_out_longitude: longitude,
        clock_out_accuracy: accuracy || null,
        total_hours: parseFloat(totalHours.toFixed(2)),
      })
      .eq('id', activeTimecard.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating timecard:', updateError);
      return NextResponse.json(
        { error: 'Failed to clock out', details: updateError.message },
        { status: 500 }
      );
    }

    // Get user's profile for name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    console.log(`✅ User ${profile?.full_name || user.email} clocked out at ${now.toLocaleTimeString()}`);
    console.log(`⏰ Total hours this entry: ${totalHours.toFixed(2)}`);
    console.log(`📍 Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (${locationCheck.distanceFormatted} from shop)`);

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
          distanceFromShop: locationCheck.distanceFormatted,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in clock-out route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
