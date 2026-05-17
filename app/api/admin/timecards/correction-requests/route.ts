export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/timecards/correction-requests
 * List timecard correction requests for admin review.
 *
 * Query params:
 *   status — 'pending' | 'approved' | 'rejected' | 'all' (default: 'pending')
 *   page   — page index (default: 0, page size: 50)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

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
        timecards!timecard_id (
          date,
          clock_in_time,
          clock_out_time,
          total_hours
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
    const requests = (data || []).map((row: any) => ({
      id: row.id,
      timecard_id: row.timecard_id,
      requested_by: row.requested_by,
      worker_name: row.profiles?.full_name || 'Unknown',
      worker_role: row.profiles?.role || '',
      timecard_date: row.timecards?.date || null,
      current_clock_in: row.timecards?.clock_in_time || null,
      current_clock_out: row.timecards?.clock_out_time || null,
      current_total_hours: row.timecards?.total_hours || null,
      requested_clock_in: row.requested_clock_in,
      requested_clock_out: row.requested_clock_out,
      reason: row.reason,
      status: row.status,
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at,
      reviewer_notes: row.reviewer_notes,
      created_at: row.created_at,
    }));

    return NextResponse.json({ success: true, data: { requests, page, pageSize } });
  } catch (error) {
    console.error('Unexpected error in correction-requests GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
