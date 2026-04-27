export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/jobs/[id]/live-status
 * Real-time operator transparency panel for admin job detail view.
 *
 * Returns current job status, timestamps, active timecard, standby logs,
 * and work performed today so admins can monitor field progress live.
 *
 * GET — requireAdmin
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

function minutesSince(ts: string | null): number | null {
  if (!ts) return null;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
}

type JobRow = {
  id: string;
  status: string;
  assigned_to: string | null;
  helper_assigned_to: string | null;
  in_route_at: string | null;
  arrived_at_jobsite_at: string | null;
  work_started_at: string | null;
  route_started_at: string | null;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    // ── 1. Fetch job with live columns ───────────────────────────────────────
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select(
        'id, status, assigned_to, helper_assigned_to, ' +
        'in_route_at, arrived_at_jobsite_at, work_started_at, route_started_at'
      )
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: jobRaw, error: jobError } = await jobQuery.single();

    if (jobError || !jobRaw) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Cast to known shape (columns may not be in generated Supabase types yet)
    const jobRow = jobRaw as unknown as JobRow;

    // ── 2. Resolve operator and helper names ─────────────────────────────────
    let operatorName: string | null = null;
    let helperName: string | null = null;

    if (jobRow.assigned_to) {
      const { data: opProf } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', jobRow.assigned_to)
        .maybeSingle();
      operatorName = opProf?.full_name ?? null;
    }

    if (jobRow.helper_assigned_to) {
      const { data: helperProf } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', jobRow.helper_assigned_to)
        .maybeSingle();
      helperName = helperProf?.full_name ?? null;
    }

    // ── 3. Today's timecard for assigned operator ────────────────────────────
    const todayStr = new Date().toISOString().split('T')[0];
    let clockInTime: string | null = null;
    let clockOutTime: string | null = null;

    if (jobRow.assigned_to) {
      const { data: timecardRows } = await supabaseAdmin
        .from('timecards')
        .select('clock_in_time, clock_out_time, date')
        .eq('user_id', jobRow.assigned_to)
        .eq('date', todayStr)
        .order('clock_in_time', { ascending: true })
        .limit(1);

      if (timecardRows && timecardRows.length > 0) {
        clockInTime = (timecardRows[0] as { clock_in_time?: string | null }).clock_in_time ?? null;
        clockOutTime = (timecardRows[0] as { clock_out_time?: string | null }).clock_out_time ?? null;
      }
    }

    // ── 4. Active standby log ────────────────────────────────────────────────
    let standbyActive = false;
    let standbyStartedAt: string | null = null;
    let standbyDurationMinutes: number | null = null;

    const { data: standbyRows, error: standbyErr } = await supabaseAdmin
      .from('standby_logs')
      .select('id, started_at, ended_at, status, reason')
      .eq('job_order_id', jobId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1);

    // standby_logs table might not exist — gracefully skip
    const standbyTableMissing =
      standbyErr &&
      (standbyErr.code === '42P01' ||
        (standbyErr.message || '').includes('does not exist'));

    if (!standbyTableMissing && standbyRows && standbyRows.length > 0) {
      const activeLog = standbyRows[0] as { started_at: string; ended_at: string | null };
      if (!activeLog.ended_at) {
        standbyActive = true;
        standbyStartedAt = activeLog.started_at;
        standbyDurationMinutes = minutesSince(activeLog.started_at);
      }
    }

    // ── 5. Work performed today ──────────────────────────────────────────────
    let workPerformedToday: Array<{
      id: string;
      work_type: string | null;
      quantity_completed: number;
      notes: string | null;
      scope_item_description: string | null;
    }> = [];

    const { data: progressRows } = await supabaseAdmin
      .from('job_progress_entries')
      .select(`
        id,
        work_type,
        quantity_completed,
        notes,
        job_scope_items!job_progress_entries_scope_item_id_fkey(description)
      `)
      .eq('job_order_id', jobId)
      .eq('date', todayStr)
      .order('created_at', { ascending: true });

    if (progressRows) {
      workPerformedToday = progressRows.map((r) => ({
        id: r.id,
        work_type: r.work_type ?? null,
        quantity_completed: Number(r.quantity_completed),
        notes: r.notes ?? null,
        scope_item_description: (r.job_scope_items as { description?: string } | null)?.description ?? null,
      }));
    }

    // ── 6. Status history (optional table) ──────────────────────────────────
    let statusHistory: Array<{
      status: string;
      changed_at: string;
      changed_by: string | null;
    }> = [];

    const { data: historyRows, error: historyErr } = await supabaseAdmin
      .from('job_status_history')
      .select('status, changed_at, changed_by')
      .eq('job_order_id', jobId)
      .order('changed_at', { ascending: false })
      .limit(20);

    const historyTableMissing =
      historyErr &&
      (historyErr.code === '42P01' ||
        (historyErr.message || '').includes('does not exist'));

    if (!historyTableMissing && historyRows) {
      statusHistory = (historyRows as Array<{ status: string; changed_at: string; changed_by?: string | null }>).map((h) => ({
        status: h.status,
        changed_at: h.changed_at,
        changed_by: h.changed_by ?? null,
      }));
    }

    // ── 7. Computed values ───────────────────────────────────────────────────
    const arrivedAt = jobRow.arrived_at_jobsite_at;
    const inRouteAt = jobRow.in_route_at;
    const workStartedAt = jobRow.work_started_at;

    // Time on site = minutes since arrived, or since work started if no arrived timestamp
    const onSiteAnchor = arrivedAt ?? workStartedAt;
    const timeOnSiteMinutes =
      onSiteAnchor && !clockOutTime ? minutesSince(onSiteAnchor) : null;

    return NextResponse.json({
      success: true,
      data: {
        status: jobRow.status,
        operator_name: operatorName,
        helper_name: helperName,
        in_route_at: inRouteAt,
        arrived_at: arrivedAt,
        work_started_at: workStartedAt,
        standby_active: standbyActive,
        standby_started_at: standbyStartedAt,
        standby_duration_minutes: standbyDurationMinutes,
        time_on_site_minutes: timeOnSiteMinutes,
        clock_in_time: clockInTime,
        clock_out_time: clockOutTime,
        work_performed_today: workPerformedToday,
        status_history: statusHistory,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /live-status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
