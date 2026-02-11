/**
 * API Route: GET /api/timecard/current
 * Get user's current active timecard (if clocked in)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
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

    // Find active timecard (clocked in but not clocked out)
    const { data: activeTimecard, error: fetchError } = await supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('user_id', user.id)
      .is('clock_out_time', null)
      .order('clock_in_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      // If table doesn't exist yet, treat as not clocked in
      if (fetchError.code === 'PGRST204' || fetchError.code === 'PGRST205' || fetchError.code === '42P01' || fetchError.message?.includes('does not exist')) {
        return NextResponse.json(
          { success: true, isClockedIn: false, data: null },
          { status: 200 }
        );
      }
      console.error('Error fetching active timecard:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch timecard', details: fetchError.message },
        { status: 500 }
      );
    }

    if (!activeTimecard) {
      return NextResponse.json(
        {
          success: true,
          isClockedIn: false,
          data: null,
        },
        { status: 200 }
      );
    }

    // Calculate current working hours
    const now = new Date();
    const clockInTime = new Date(activeTimecard.clock_in_time);
    const milliseconds = now.getTime() - clockInTime.getTime();
    const currentHours = milliseconds / (1000 * 60 * 60);

    return NextResponse.json(
      {
        success: true,
        isClockedIn: true,
        data: {
          id: activeTimecard.id,
          clockInTime: activeTimecard.clock_in_time,
          clockInLocation: {
            latitude: activeTimecard.clock_in_latitude,
            longitude: activeTimecard.clock_in_longitude,
            accuracy: activeTimecard.clock_in_accuracy,
          },
          currentHours: parseFloat(currentHours.toFixed(2)),
          date: activeTimecard.date,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in current timecard route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
