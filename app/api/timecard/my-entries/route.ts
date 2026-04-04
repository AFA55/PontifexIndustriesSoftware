export const dynamic = 'force-dynamic';

/**
 * GET /api/timecard/my-entries?weekStart=YYYY-MM-DD
 * Get the authenticated operator's timecard entries for a given week.
 * Returns 7-day array plus summary totals.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isTableNotFoundError } from '@/lib/api-auth';
import { calculateWeekSummary, getWeekDates, getMondayOfWeek } from '@/lib/timecard-utils';
import type { TimecardEntry } from '@/lib/timecard-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const weekStart = searchParams.get('weekStart') || getMondayOfWeek();

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json(
        { error: 'weekStart must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    // Calculate week end (Sunday)
    const startDate = new Date(weekStart + 'T00:00:00');
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    const weekEnd = endDate.toISOString().split('T')[0];

    // Fetch timecards for the week
    const { data: timecards, error: fetchError } = await supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('user_id', auth.userId)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .order('date')
      .order('clock_in_time');

    if (fetchError) {
      if (isTableNotFoundError(fetchError)) {
        return NextResponse.json(
          { success: true, data: { entries: [], summary: { regularHours: 0, weeklyOvertimeHours: 0, mandatoryOvertimeHours: 0, nightShiftHours: 0, shopHours: 0, totalHours: 0, daysWorked: 0 }, weekStart, weekEnd } },
          { status: 200 }
        );
      }
      console.error('Error fetching my entries:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch timecard entries' }, { status: 500 });
    }

    const tcArray = (timecards || []) as TimecardEntry[];

    // Build per-day entries
    const weekDates = getWeekDates(weekStart);
    const dailyEntries = weekDates.map((date) => {
      const dayEntries = tcArray.filter((tc) => tc.date === date);
      const totalHours = dayEntries.reduce((sum, e) => sum + (e.total_hours || 0), 0);

      return {
        date,
        entries: dayEntries,
        totalHours: Number(totalHours.toFixed(2)),
        count: dayEntries.length,
      };
    });

    // Calculate weekly summary
    const summary = calculateWeekSummary(tcArray);

    return NextResponse.json({
      success: true,
      data: {
        dailyEntries,
        entries: tcArray,
        summary,
        weekStart,
        weekEnd,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in my-entries route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
