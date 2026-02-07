import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/maps/distance - Calculate drive time using Google Maps Distance Matrix API
 * Query params: origin (lat,lng), destination (address or lat,lng)
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Authorization required' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const origin = searchParams.get('origin');
    const destination = searchParams.get('destination');

    if (!origin || !destination) {
      return NextResponse.json(
        { success: false, error: 'Origin and destination are required' },
        { status: 400 }
      );
    }

    // Check if Google Maps API key is configured
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn('Google Maps API key not configured, returning estimate');
      // Return a default estimate if API key is not configured
      return NextResponse.json({
        success: true,
        durationMinutes: 30,
        durationText: '30 mins (estimated)',
        distanceMeters: 24000,
        distanceText: '15 miles (estimated)',
        note: 'Using default estimate - Google Maps API key not configured'
      });
    }

    // Call Google Maps Distance Matrix API
    const mapsUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${apiKey}&mode=driving`;

    const mapsResponse = await fetch(mapsUrl);
    const mapsData = await mapsResponse.json();

    if (mapsData.status !== 'OK') {
      console.error('Google Maps API error:', mapsData.status, mapsData.error_message);
      // Return default estimate on error
      return NextResponse.json({
        success: true,
        durationMinutes: 30,
        durationText: '30 mins (estimated)',
        distanceMeters: 24000,
        distanceText: '15 miles (estimated)',
        note: 'Using default estimate due to API error'
      });
    }

    const element = mapsData.rows[0]?.elements[0];
    if (!element || element.status !== 'OK') {
      console.error('Distance calculation failed:', element?.status);
      return NextResponse.json({
        success: true,
        durationMinutes: 30,
        durationText: '30 mins (estimated)',
        distanceMeters: 24000,
        distanceText: '15 miles (estimated)',
        note: 'Using default estimate - route not found'
      });
    }

    const durationMinutes = Math.ceil(element.duration.value / 60);
    const distanceMeters = element.distance.value;

    return NextResponse.json({
      success: true,
      durationMinutes,
      durationText: element.duration.text,
      distanceMeters,
      distanceText: element.distance.text
    });

  } catch (error: any) {
    console.error('Distance API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
