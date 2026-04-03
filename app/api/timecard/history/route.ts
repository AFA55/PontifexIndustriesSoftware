export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/timecard/history
 * Get user's timecard history with optional date range filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isTableNotFoundError } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Build query
    let query = supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('user_id', auth.userId)
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
      if (isTableNotFoundError(fetchError)) {
        return NextResponse.json(
          { success: true, data: { timecards: [], summary: { totalEntries: 0, completedEntries: 0, activeEntry: null, totalHours: 0 } } },
          { status: 200 }
        );
      }
      console.error('Error fetching timecard history:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch timecard history' },
        { status: 500 }
      );
    }

    // Enrich timecards with job info
    const jobOrderIds = [...new Set((timecards || []).filter(tc => tc.job_order_id).map(tc => tc.job_order_id))];
    let jobMap: Record<string, { job_number: string; customer_name: string }> = {};
    if (jobOrderIds.length > 0) {
      const { data: jobs } = await supabaseAdmin
        .from('job_orders')
        .select('id, job_number, customer_name')
        .in('id', jobOrderIds);
      if (jobs) {
        jobs.forEach(j => { jobMap[j.id] = { job_number: j.job_number, customer_name: j.customer_name }; });
      }
    }

    const enrichedTimecards = (timecards || []).map(tc => ({
      ...tc,
      job_number: tc.job_order_id ? (jobMap[tc.job_order_id]?.job_number || null) : null,
      job_customer_name: tc.job_order_id ? (jobMap[tc.job_order_id]?.customer_name || null) : null,
    }));

    // Calculate totals
    const totalHours = enrichedTimecards.reduce((sum, tc) => sum + (tc.total_hours || 0), 0);
    const completedEntries = enrichedTimecards.filter(tc => tc.clock_out_time !== null).length;
    const activeEntry = enrichedTimecards.find(tc => tc.clock_out_time === null);

    return NextResponse.json(
      {
        success: true,
        data: {
          timecards: enrichedTimecards,
          summary: {
            totalEntries: enrichedTimecards.length,
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
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
