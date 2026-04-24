export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/timecards/operator/[id]?weekStart=YYYY-MM-DD
 * Returns full weekly timecard data for a specific operator, including:
 * - Operator profile info
 * - All timecard entries for the week
 * - Weekly summary (total hours, regular, OT, days worked)
 * - GPS logs for each entry
 * - Coworkers for each entry
 * - Admin notes
 *
 * PATCH /api/admin/timecards/operator/[id]
 * Update weekly admin notes, approve/reject the whole week, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, isTableNotFoundError } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: operatorId } = await params;
    const tenantId = auth.tenantId;
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const searchParams = request.nextUrl.searchParams;
    const weekStartParam = searchParams.get('weekStart');

    // Calculate week bounds
    let weekStart: Date;
    if (weekStartParam) {
      weekStart = new Date(weekStartParam + 'T00:00:00');
    } else {
      // Default to current week's Monday
      const now = new Date();
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - diff);
      weekStart.setHours(0, 0, 0, 0);
    }

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const startDateStr = weekStart.toISOString().split('T')[0];
    const endDateStr = weekEnd.toISOString().split('T')[0];

    // 1. Fetch operator profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role, phone, avatar_url')
      .eq('id', operatorId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
    }

    // 2. Fetch all timecard entries for the week (using the view for richer data)
    let tcQuery = supabaseAdmin
      .from('timecards_with_users')
      .select('*')
      .eq('user_id', operatorId)
      .gte('date', startDateStr)
      .lte('date', endDateStr)
      .order('date', { ascending: true })
      .order('clock_in_time', { ascending: true });

    tcQuery = tcQuery.eq('tenant_id', tenantId);

    const { data: timecards, error: tcError } = await tcQuery;

    if (tcError && !isTableNotFoundError(tcError)) {
      console.error('Error fetching timecards:', tcError);
      return NextResponse.json({ error: 'Failed to fetch timecards' }, { status: 500 });
    }

    const entries = timecards || [];

    // Also fetch from the base timecards table for extra columns (segments, admin_notes, entry_type, etc.)
    let baseQuery = supabaseAdmin
      .from('timecards')
      .select('id, segments, admin_notes, employee_notes, entry_type, break_minutes, coworkers, clock_in_gps_lat, clock_in_gps_lng, clock_out_gps_lat, clock_out_gps_lng, nfc_clock_in, nfc_clock_out, edited_by, rejected_by, rejected_at')
      .eq('user_id', operatorId)
      .gte('date', startDateStr)
      .lte('date', endDateStr);

    baseQuery = baseQuery.eq('tenant_id', tenantId);

    const { data: baseTimecards } = await baseQuery;
    const baseMap = new Map((baseTimecards || []).map((b: any) => [b.id, b]));

    // Merge base data into entries
    const enrichedEntries = entries.map((entry: any) => {
      const base = baseMap.get(entry.id) || {};
      return {
        ...entry,
        segments: (base as any).segments || [],
        admin_notes: (base as any).admin_notes || null,
        employee_notes: (base as any).employee_notes || null,
        entry_type: (base as any).entry_type || 'regular',
        break_minutes: (base as any).break_minutes || 0,
        coworkers: (base as any).coworkers || [],
        clock_in_gps_lat: (base as any).clock_in_gps_lat || entry.clock_in_latitude,
        clock_in_gps_lng: (base as any).clock_in_gps_lng || entry.clock_in_longitude,
        clock_out_gps_lat: (base as any).clock_out_gps_lat || entry.clock_out_latitude,
        clock_out_gps_lng: (base as any).clock_out_gps_lng || entry.clock_out_longitude,
        nfc_clock_in: (base as any).nfc_clock_in || false,
        nfc_clock_out: (base as any).nfc_clock_out || false,
      };
    });

    // 3. Fetch GPS logs for all entries
    const timecardIds = entries.map((e: any) => e.id);
    let gpsLogs: any[] = [];
    if (timecardIds.length > 0) {
      try {
        const { data: logs } = await supabaseAdmin
          .from('timecard_gps_logs')
          .select('*')
          .in('legacy_timecard_id', timecardIds)
          .order('timestamp', { ascending: true });
        gpsLogs = logs || [];
      } catch {
        // Table may not exist yet
      }
    }

    // Group GPS logs by timecard ID
    const gpsLogsByTimecard: Record<string, any[]> = {};
    gpsLogs.forEach((log: any) => {
      const key = log.legacy_timecard_id || log.timecard_entry_id;
      if (!gpsLogsByTimecard[key]) gpsLogsByTimecard[key] = [];
      gpsLogsByTimecard[key].push(log);
    });

    // 4. Find coworkers — get job_order_ids from these entries, then find other users assigned
    const jobOrderIds = [...new Set(entries.filter((e: any) => e.job_order_id).map((e: any) => e.job_order_id))];
    let coworkersByJob: Record<string, any[]> = {};

    if (jobOrderIds.length > 0) {
      // Find other timecards on same job orders in the same date range
      const { data: coworkerTimecards } = await supabaseAdmin
        .from('timecards_with_users')
        .select('user_id, full_name, job_order_id, date')
        .in('job_order_id', jobOrderIds)
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .neq('user_id', operatorId);

      if (coworkerTimecards) {
        coworkerTimecards.forEach((ct: any) => {
          const key = `${ct.job_order_id}_${ct.date}`;
          if (!coworkersByJob[key]) coworkersByJob[key] = [];
          // Deduplicate
          if (!coworkersByJob[key].find((c: any) => c.user_id === ct.user_id)) {
            coworkersByJob[key].push({ user_id: ct.user_id, full_name: ct.full_name });
          }
        });
      }
    }

    // 5. Get weekly timecard summary (timecard_weeks table)
    let weekSummary: any = null;
    try {
      const { data: weekData } = await supabaseAdmin
        .from('timecard_weeks')
        .select('*')
        .eq('user_id', operatorId)
        .eq('week_start', startDateStr)
        .maybeSingle();
      weekSummary = weekData;
    } catch {
      // Table may not exist
    }

    // 6. Calculate weekly stats
    const mandatoryOTHours = enrichedEntries
      .filter((e: any) => e.hour_type === 'mandatory_overtime')
      .reduce((sum: number, e: any) => sum + (e.total_hours || 0), 0);

    const weekdayHours = enrichedEntries
      .filter((e: any) => e.hour_type !== 'mandatory_overtime')
      .reduce((sum: number, e: any) => sum + (e.total_hours || 0), 0);

    const totalHours = enrichedEntries.reduce((sum: number, e: any) => sum + (e.total_hours || 0), 0);
    const weeklyOTHours = Math.max(0, weekdayHours - 40);
    const regularHours = Math.min(weekdayHours, 40);
    const daysWorked = new Set(enrichedEntries.map((e: any) => e.date)).size;
    const breakMinutes = enrichedEntries.reduce((sum: number, e: any) => sum + (e.break_minutes || 0), 0);
    const nightShiftHours = enrichedEntries.filter((e: any) => e.is_night_shift).reduce((sum: number, e: any) => sum + (e.total_hours || 0), 0);
    const shopHours = enrichedEntries.filter((e: any) => e.is_shop_hours).reduce((sum: number, e: any) => sum + (e.total_hours || 0), 0);
    const approvedCount = enrichedEntries.filter((e: any) => e.is_approved).length;
    const pendingCount = enrichedEntries.filter((e: any) => !e.is_approved).length;

    // 7. Attach GPS logs and coworkers to each entry
    const finalEntries = enrichedEntries.map((entry: any) => {
      const jobKey = `${entry.job_order_id}_${entry.date}`;
      return {
        ...entry,
        gps_logs: gpsLogsByTimecard[entry.id] || [],
        found_coworkers: coworkersByJob[jobKey] || [],
      };
    });

    // Determine overall week status
    const hasActive = enrichedEntries.some((e: any) => !e.clock_out_time);
    const weekStatus = weekSummary?.status ||
      (hasActive ? 'active' : pendingCount > 0 ? 'pending' : approvedCount > 0 ? 'approved' : 'draft');

    return NextResponse.json({
      success: true,
      data: {
        operator: {
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
          role: profile.role,
          phone: profile.phone,
          avatar_url: profile.avatar_url,
        },
        weekStart: startDateStr,
        weekEnd: endDateStr,
        weekStatus,
        weekSummary,
        entries: finalEntries,
        stats: {
          totalHours: parseFloat(totalHours.toFixed(2)),
          regularHours: parseFloat(regularHours.toFixed(2)),
          weeklyOTHours: parseFloat(weeklyOTHours.toFixed(2)),
          mandatoryOTHours: parseFloat(mandatoryOTHours.toFixed(2)),
          nightShiftHours: parseFloat(nightShiftHours.toFixed(2)),
          shopHours: parseFloat(shopHours.toFixed(2)),
          daysWorked,
          breakMinutes,
          approvedCount,
          pendingCount,
          totalEntries: enrichedEntries.length,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /api/admin/timecards/operator/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH — Update admin notes for the whole week or change week status
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: operatorId } = await params;
    const body = await request.json();
    const { weekStart, admin_notes, action, reason } = body;

    if (!weekStart) {
      return NextResponse.json({ error: 'weekStart is required' }, { status: 400 });
    }

    // Upsert into timecard_weeks
    if (action === 'approve_week') {
      const { error } = await supabaseAdmin
        .from('timecard_weeks')
        .upsert({
          user_id: operatorId,
          week_start: weekStart,
          status: 'approved',
          approved_by: auth.userId,
          approved_at: new Date().toISOString(),
          notes: admin_notes || undefined,
          tenant_id: auth.tenantId || undefined,
        }, { onConflict: 'user_id,week_start' });

      if (error) {
        console.error('Error approving week:', error);
        return NextResponse.json({ error: 'Failed to approve week' }, { status: 500 });
      }

      // Also approve all pending entries for this week
      await supabaseAdmin
        .from('timecards')
        .update({ is_approved: true, approved_by: auth.userId, approved_at: new Date().toISOString() })
        .eq('user_id', operatorId)
        .gte('date', weekStart)
        .lte('date', new Date(new Date(weekStart + 'T00:00:00').getTime() + 6 * 86400000).toISOString().split('T')[0])
        .eq('is_approved', false);

      return NextResponse.json({ success: true, message: 'Week approved' });
    }

    if (action === 'reject_week') {
      const { error } = await supabaseAdmin
        .from('timecard_weeks')
        .upsert({
          user_id: operatorId,
          week_start: weekStart,
          status: 'rejected',
          rejected_by: auth.userId,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason || undefined,
          notes: admin_notes || undefined,
          tenant_id: auth.tenantId || undefined,
        }, { onConflict: 'user_id,week_start' });

      if (error) {
        console.error('Error rejecting week:', error);
        return NextResponse.json({ error: 'Failed to reject week' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Week rejected' });
    }

    // Default: just update notes
    if (admin_notes !== undefined) {
      const { error } = await supabaseAdmin
        .from('timecard_weeks')
        .upsert({
          user_id: operatorId,
          week_start: weekStart,
          notes: admin_notes,
          tenant_id: auth.tenantId || undefined,
        }, { onConflict: 'user_id,week_start' });

      if (error) {
        console.error('Error saving notes:', error);
        return NextResponse.json({ error: 'Failed to save notes' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: 'Notes updated' });
  } catch (error: unknown) {
    console.error('Unexpected error in PATCH /api/admin/timecards/operator/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
