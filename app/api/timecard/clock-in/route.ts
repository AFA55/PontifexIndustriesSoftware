/**
 * API Route: POST /api/timecard/clock-in
 * Clock in with location verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
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
          error: `You must be at ${SHOP_LOCATION.name} to clock in.`,
          details: `You are ${locationCheck.distanceFormatted} away. Maximum allowed distance is ${ALLOWED_RADIUS_METERS}m.`,
          distance: locationCheck.distance,
          allowedRadius: ALLOWED_RADIUS_METERS,
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
    // Gracefully handle missing timecards table
    const { data: activeTimecard, error: checkError } = await supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('user_id', user.id)
      .is('clock_out_time', null)
      .single();

    // If table doesn't exist, we can't clock in
    if (checkError && (checkError.code === 'PGRST204' || checkError.code === 'PGRST205' || checkError.code === '42P01' || checkError.message?.includes('does not exist'))) {
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

    // Create new timecard entry
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

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
        },
      ])
      .select()
      .single();

    if (insertError) {
      // If table doesn't exist
      if (insertError.code === 'PGRST204' || insertError.code === 'PGRST205' || insertError.code === '42P01' || insertError.message?.includes('does not exist')) {
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

    console.log(`✅ User ${profile?.full_name || user.email} clocked in at ${now.toLocaleTimeString()}`);
    console.log(`📍 Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (${locationCheck.distanceFormatted} from shop)`);

    return NextResponse.json(
      {
        success: true,
        message: `Clocked in successfully at ${now.toLocaleTimeString()}`,
        data: {
          id: timecard.id,
          clockInTime: timecard.clock_in_time,
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
