export const dynamic = 'force-dynamic';

/**
 * POST /api/timecard/log-segment
 * Log a work segment (in_route, on_site, working, complete) to the
 * active timecard entry. Appends to the segments JSONB array and optionally
 * writes a GPS breadcrumb to timecard_gps_logs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isTableNotFoundError } from '@/lib/api-auth';

const VALID_SEGMENT_TYPES = ['in_route', 'on_site', 'working', 'complete'] as const;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { entry_id, segment_type, gps_lat, gps_lng, job_order_id, notes } = body;

    // Validate segment_type
    if (!segment_type || !VALID_SEGMENT_TYPES.includes(segment_type)) {
      return NextResponse.json(
        { error: `segment_type must be one of: ${VALID_SEGMENT_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Find the active timecard - either by entry_id or the current open entry
    let timecardQuery = supabaseAdmin
      .from('timecards')
      .select('id, user_id, segments')
      .eq('user_id', auth.userId)
      .is('clock_out_time', null);

    if (entry_id) {
      timecardQuery = timecardQuery.eq('id', entry_id);
    }

    const { data: timecard, error: fetchError } = await timecardQuery
      .order('clock_in_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      if (isTableNotFoundError(fetchError)) {
        return NextResponse.json(
          { error: 'Timecard system is not available yet.' },
          { status: 503 }
        );
      }
      console.error('Error fetching timecard:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch timecard' }, { status: 500 });
    }

    if (!timecard) {
      return NextResponse.json(
        { error: 'No active clock-in found. You must be clocked in to log a segment.' },
        { status: 400 }
      );
    }

    // Build new segment
    const now = new Date().toISOString();
    const newSegment = {
      type: segment_type,
      timestamp: now,
      gps_lat: gps_lat || null,
      gps_lng: gps_lng || null,
      job_order_id: job_order_id || null,
      notes: notes || null,
    };

    // Append to existing segments array
    const existingSegments = Array.isArray(timecard.segments) ? timecard.segments : [];
    const updatedSegments = [...existingSegments, newSegment];

    const { error: updateError } = await supabaseAdmin
      .from('timecards')
      .update({ segments: updatedSegments })
      .eq('id', timecard.id);

    if (updateError) {
      // If segments column doesn't exist, log it but don't fail
      if (updateError.message?.includes('segments')) {
        console.warn('Segments column not found on timecards table. Skipping segment update.');
      } else {
        console.error('Error updating segments:', updateError);
        return NextResponse.json({ error: 'Failed to log segment' }, { status: 500 });
      }
    }

    // Fire-and-forget: Log GPS breadcrumb to timecard_gps_logs
    if (gps_lat && gps_lng) {
      Promise.resolve(
        supabaseAdmin.from('timecard_gps_logs').insert({
          timecard_id: timecard.id,
          user_id: auth.userId,
          latitude: gps_lat,
          longitude: gps_lng,
          segment_type,
          job_order_id: job_order_id || null,
          recorded_at: now,
          tenant_id: auth.tenantId || null,
        })
      ).catch(() => {
        // GPS log table may not exist; silently ignore
      });
    }

    return NextResponse.json({
      success: true,
      message: `Segment "${segment_type}" logged successfully`,
      data: {
        timecard_id: timecard.id,
        segment: newSegment,
        total_segments: updatedSegments.length,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in log-segment route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
