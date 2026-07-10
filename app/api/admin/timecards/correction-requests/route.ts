export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/timecards/correction-requests
 * List timecard correction requests for admin review.
 *
 * Query params:
 *   status — 'pending' | 'approved' | 'rejected' | 'all' (default: 'pending')
 *   page   — page index (default: 0, page size: 50)
 *
 * Each request now also carries clock-in/out times, location coords, and a
 * server-computed clock-out distance from the tenant shop (Part A).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { calculateDistance, formatDistanceUS, formatDriveTimeUS, SHOP_LOCATION } from '@/lib/geolocation';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant scope required. super_admin must pass ?tenantId=' },
        { status: 400 }
      );
    }

    const params = request.nextUrl.searchParams;
    const status = params.get('status') || 'pending';
    const page = Math.max(0, parseInt(params.get('page') || '0'));
    const pageSize = 50;

    // Fetch tenant shop coords once for distance computation
    const { data: tenantRow } = await supabaseAdmin
      .from('tenants')
      .select('shop_latitude, shop_longitude, clock_out_radius_meters')
      .eq('id', tenantId)
      .maybeSingle();

    // Fall back to the hardcoded shop pin when the tenant hasn't set coords.
    // This MATTERS: Patriot's tenants.shop_latitude/longitude are NULL, but
    // clock-out enforcement uses SHOP_LOCATION as the same fallback — so without
    // this the distance/drive-time would never compute for the geofence review,
    // even though the clock-out itself was correctly flagged against this pin.
    const shopLat = tenantRow?.shop_latitude ?? SHOP_LOCATION.latitude;
    const shopLon = tenantRow?.shop_longitude ?? SHOP_LOCATION.longitude;

    let query = supabaseAdmin
      .from('timecard_correction_requests')
      .select(`
        id,
        timecard_id,
        requested_by,
        requested_clock_in,
        requested_clock_out,
        reason,
        status,
        reviewed_by,
        reviewed_at,
        reviewer_notes,
        created_at,
        metadata,
        timecards!timecard_id (
          date,
          clock_in_time,
          clock_out_time,
          total_hours,
          clock_in_latitude,
          clock_in_longitude,
          clock_in_method,
          clock_out_latitude,
          clock_out_longitude,
          clock_out_outside_radius,
          clock_out_drive_minutes,
          clock_out_drive_source,
          remote_photo_url
        ),
        profiles!requested_by (
          full_name,
          role
        )
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching correction requests:', error);
      return NextResponse.json({ error: 'Failed to fetch correction requests' }, { status: 500 });
    }

    // Shape the response for easier consumption
    const requests = (data || []).map((row: any) => {
      const tc = row.timecards;
      const coLat: number | null = tc?.clock_out_latitude ?? null;
      const coLon: number | null = tc?.clock_out_longitude ?? null;

      // Compute clock-out distance from shop only when we have both sets of coords
      let clockOutDistanceMeters: number | null = null;
      let clockOutDistanceFormatted: string | null = null;
      let clockOutDriveFormatted: string | null = null;
      if (shopLat != null && shopLon != null && coLat != null && coLon != null) {
        clockOutDistanceMeters = calculateDistance(coLat, coLon, shopLat, shopLon);
        clockOutDistanceFormatted = formatDistanceUS(clockOutDistanceMeters);
        // Prefer the REAL drive time stored at clock-out (Google Routes,
        // lib/drive-time.ts); '~' marks the road-estimate fallback. Old rows
        // without a stored value fall back to the free straight-line estimate.
        const storedMin = tc?.clock_out_drive_minutes != null ? Number(tc.clock_out_drive_minutes) : null;
        if (storedMin != null && Number.isFinite(storedMin)) {
          clockOutDriveFormatted = `${tc?.clock_out_drive_source === 'google' ? '' : '~'}${Math.round(storedMin)} min`;
        } else {
          clockOutDriveFormatted = formatDriveTimeUS(clockOutDistanceMeters);
        }
      }

      return {
        id: row.id,
        timecard_id: row.timecard_id,
        requested_by: row.requested_by,
        worker_name: row.profiles?.full_name || 'Unknown',
        worker_role: row.profiles?.role || '',
        timecard_date: tc?.date || null,
        current_clock_in: tc?.clock_in_time || null,
        current_clock_out: tc?.clock_out_time || null,
        current_total_hours: tc?.total_hours || null,
        // Location & method fields
        clock_in_latitude: tc?.clock_in_latitude ?? null,
        clock_in_longitude: tc?.clock_in_longitude ?? null,
        clock_in_method: tc?.clock_in_method ?? null,
        clock_out_latitude: coLat,
        clock_out_longitude: coLon,
        clock_out_outside_radius: tc?.clock_out_outside_radius ?? false,
        remote_photo_url: tc?.remote_photo_url ?? null,
        // Computed distance + rough drive-time estimate
        clock_out_distance_meters: clockOutDistanceMeters,
        clock_out_distance_formatted: clockOutDistanceFormatted,
        clock_out_drive_formatted: clockOutDriveFormatted,
        // Requested times
        requested_clock_in: row.requested_clock_in,
        requested_clock_out: row.requested_clock_out,
        reason: row.reason,
        status: row.status,
        reviewed_by: row.reviewed_by,
        reviewed_at: row.reviewed_at,
        reviewer_notes: row.reviewer_notes,
        created_at: row.created_at,
        metadata: row.metadata ?? null,
        // Convenience flag for the UI: auto-flagged (out-of-radius) vs. worker-submitted.
        is_auto: row.metadata?.source === 'auto_out_of_radius',
      };
    });

    return NextResponse.json({ success: true, data: { requests, page, pageSize } });
  } catch (error) {
    console.error('Unexpected error in correction-requests GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
