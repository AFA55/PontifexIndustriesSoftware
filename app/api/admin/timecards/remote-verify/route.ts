export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/timecards/remote-verify
 * Approve or reject a remote clock-in (method = 'remote' or 'gps_remote').
 *
 * GET /api/admin/timecards/remote-verify
 * Fetch pending remote/out-of-town clock-ins for admin review queue.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { timecard_id, approved, note } = body;

    if (!timecard_id || typeof approved !== 'boolean') {
      return NextResponse.json(
        { error: 'timecard_id and approved (boolean) are required' },
        { status: 400 }
      );
    }

    let updateQuery = supabaseAdmin
      .from('timecards')
      .update({
        remote_verified: approved,
        remote_verified_by: auth.userId,
        remote_verified_at: new Date().toISOString(),
        // Store admin note if provided (new column from migration)
        ...(note ? { approval_note: note } : {}),
      })
      .eq('id', timecard_id)
      .in('clock_in_method', ['remote', 'gps_remote']);

    if (auth.tenantId) updateQuery = updateQuery.eq('tenant_id', auth.tenantId);

    const { data, error } = await updateQuery
      .select()
      .single();

    if (error) {
      console.error('Error verifying remote clock-in:', error);
      return NextResponse.json({ error: 'Failed to verify remote clock-in' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data,
      message: approved ? 'Remote clock-in approved' : 'Remote clock-in rejected',
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET — fetch pending remote and gps_remote clock-ins for admin review
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    let fetchQuery = supabaseAdmin
      .from('timecards')
      .select(`
        id, user_id, clock_in_time, date,
        remote_photo_url, remote_verified, clock_in_method,
        is_shop_hours, hour_type,
        clock_in_latitude, clock_in_longitude, clock_in_accuracy,
        requires_approval, approval_note
      `)
      .in('clock_in_method', ['remote', 'gps_remote'])
      .is('remote_verified', null)
      .order('clock_in_time', { ascending: false });

    if (auth.tenantId) fetchQuery = fetchQuery.eq('tenant_id', auth.tenantId);

    const { data, error } = await fetchQuery;

    if (error) {
      console.error('Error fetching pending remote clock-ins:', error);
      return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }

    // Get user names
    const userIds = [...new Set((data || []).map(t => t.user_id))];
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);

    const nameMap: Record<string, string> = {};
    (profiles || []).forEach(p => { nameMap[p.id] = p.full_name; });

    const enriched = (data || []).map(t => ({
      ...t,
      employee_name: nameMap[t.user_id] || 'Unknown',
      is_gps_remote: t.clock_in_method === 'gps_remote',
      maps_url: (t.clock_in_latitude && t.clock_in_longitude)
        ? `https://maps.google.com/maps?q=${t.clock_in_latitude},${t.clock_in_longitude}`
        : null,
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
