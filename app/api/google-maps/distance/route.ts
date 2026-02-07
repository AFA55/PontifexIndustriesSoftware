/**
 * API Route: GET /api/google-maps/distance
 * Calculate drive time and distance between two addresses
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const origin = searchParams.get('origin');
    const destination = searchParams.get('destination');

    if (!origin || !destination) {
      return NextResponse.json(
        { error: 'Missing origin or destination parameter' },
        { status: 400 }
      );
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
      return NextResponse.json(
        { error: 'Google Maps API not configured' },
        { status: 500 }
      );
    }

    // Call Google Distance Matrix API
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${apiKey}&units=imperial`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Google Distance Matrix API error:', data);
      return NextResponse.json(
        { error: 'Failed to calculate distance' },
        { status: 500 }
      );
    }

    const element = data.rows[0]?.elements[0];

    if (!element || element.status !== 'OK') {
      return NextResponse.json(
        { error: 'Route not found' },
        { status: 404 }
      );
    }

    // Extract duration in seconds and distance in meters
    const durationSeconds = element.duration.value;
    const distanceMeters = element.distance.value;

    // Convert to hours and minutes
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.round((durationSeconds % 3600) / 60);

    // Convert distance to miles
    const miles = (distanceMeters * 0.000621371).toFixed(1);

    return NextResponse.json({
      hours,
      minutes,
      totalMinutes: Math.round(durationSeconds / 60),
      distance: `${miles} miles`,
      distanceText: element.distance.text,
      durationText: element.duration.text,
    });
  } catch (error: any) {
    console.error('Error in distance API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
