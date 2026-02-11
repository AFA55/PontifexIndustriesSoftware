/**
 * API Route: GET /api/timecard/history
 * Get user's timecard history with optional date range filtering
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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Build query
    let query = supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('user_id', user.id)
      .order('clock_in_time', { ascending: false });

    // Apply date filters if provided
    if (startDate) {
      query = query.gte('date', startDate);
    }

    if (endDate) {
      query = query.lte('date', endDate);
    }

    // Apply limit
    query = query.limit(limit);

    const { data: timecards, error: fetchError } = await query;

    if (fetchError) {
      // If table doesn't exist yet, return empty history
      if (fetchError.code === 'PGRST204' || fetchError.code === 'PGRST205' || fetchError.code === '42P01' || fetchError.message?.includes('does not exist')) {
        return NextResponse.json(
          { success: true, data: { timecards: [], summary: { totalEntries: 0, completedEntries: 0, activeEntry: null, totalHours: 0 } } },
          { status: 200 }
        );
      }
      console.error('Error fetching timecard history:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch timecard history', details: fetchError.message },
        { status: 500 }
      );
    }

    // Calculate totals
    const totalHours = timecards?.reduce((sum, tc) => sum + (tc.total_hours || 0), 0) || 0;
    const completedEntries = timecards?.filter(tc => tc.clock_out_time !== null).length || 0;
    const activeEntry = timecards?.find(tc => tc.clock_out_time === null);

    return NextResponse.json(
      {
        success: true,
        data: {
          timecards: timecards || [],
          summary: {
            totalEntries: timecards?.length || 0,
            completedEntries,
            activeEntry: activeEntry ? {
              id: activeEntry.id,
              clockInTime: activeEntry.clock_in_time,
            } : null,
            totalHours: parseFloat(totalHours.toFixed(2)),
          },
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in timecard history route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
