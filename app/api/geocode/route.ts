/**
 * API Route: GET /api/geocode
 * Server-side proxy for Nominatim geocoding to avoid CORS issues
 * Nominatim blocks direct browser requests but allows server-side calls
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { error: 'Address query parameter is required' },
        { status: 400 }
      );
    }

    const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;

    const response = await fetch(geocodeUrl, {
      headers: {
        'User-Agent': 'PontifexIndustries/1.0 (operator-platform)',
      },
    });

    if (!response.ok) {
      console.error('Nominatim response error:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Geocoding service unavailable', results: [] },
        { status: 200 }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      results: data,
    });
  } catch (error: any) {
    console.error('Geocode proxy error:', error.message);
    return NextResponse.json(
      { success: true, results: [], error: 'Geocoding failed' },
      { status: 200 }
    );
  }
}
