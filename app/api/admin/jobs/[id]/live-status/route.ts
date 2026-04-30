export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/jobs/[id]/live-status
 * Real-time operator transparency panel for admin job detail view.
 * Returns current job status, timestamps, active timecard, standby logs,
 * and work performed today so admins can monitor field progress live.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

function minutesSince(ts: string | null | undefined): number | null {
  if (!ts) return null;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    // ── 1. Fetch core job fields ─────────────────────────────────────────────
    // Use a minimal select of known-typed columns; cast to any to pick up
    // columns that may not be in generated types yet (in_route_at, etc.)
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, status, assigned_to, helper_assigned_to')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: jobRaw, error: jobError } = await jobQuery.maybeSingle();

    if (jobError || !jobRaw) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const job = jobRaw as {
      id: string;
      status: string;
      assigned_to: string | null;
      helper_assigned_to: string | null;
    };

    // Fetch extra timestamp columns separately to avoid GenericStringError
    // from unknown column names in the Supabase TS schema
    const { data: tsRaw } = await supabaseAdmin
      .from('job_orders')
      .select('in_route_at, arrived_at_jobsite_at, work_started_at')
      .eq('id', jobId)
      .maybeSingle();

    const ts = (tsRaw ?? {}) as Record<string, string | null>;
    const inRouteAt: string | null = ts['in_route_at'] ?? null;
    const arrivedAt: string | null = ts['arrived_at_jobsite_at'] ?? null;
    const workStartedAt: string | null = ts['work_started_at'] ?? null;

    // ── 1b. Fetch GPS coordinates for route start / work start ───────────────
    let routeStartCoords: { lat: number; lng: number } | null = null;
    let workStartCoords: { lat: number; lng: number } | null = null;
    try {
      const { data: gpsRaw } = await supabaseAdmin
        .from('job_orders')
        .select(
          'route_start_latitude, route_start_longitude, work_start_latitude, work_start_longitude'
        )
        .eq('id', jobId)
        .maybeSingle();

      const gps = (gpsRaw ?? {}) as Record<string, number | string | null>;
      const routeLat =
        gps['route_start_latitude'] != null ? Number(gps['route_start_latitude']) : null;
      const routeLng =
        gps['route_start_longitude'] != null ? Number(gps['route_start_longitude']) : null;
      const workLat =
        gps['work_start_latitude'] != null ? Number(gps['work_start_latitude']) : null;
      const workLng =
        gps['work_start_longitude'] != null ? Number(gps['work_start_longitude']) : null;

      if (
        routeLat != null &&
        routeLng != null &&
        Number.isFinite(routeLat) &&
        Number.isFinite(routeLng)
      ) {
        routeStartCoords = { lat: routeLat, lng: routeLng };
      }
      if (
        workLat != null &&
        workLng != null &&
        Number.isFinite(workLat) &&
        Number.isFinite(workLng)
      ) {
        workStartCoords = { lat: workLat, lng: workLng };
      }
    } catch (e) {
      console.error('live-status: GPS coord fetch failed', e);
    }

    // ── 2. Resolve operator and helper names ─────────────────────────────────
    let operatorName: string | null = null;
    let helperName: string | null = null;

    if (job.assigned_to) {
      const { data: opProf } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', job.assigned_to)
        .maybeSingle();
      operatorName = opProf?.full_name ?? null;
    }

    if (job.helper_assigned_to) {
      const { data: helperProf } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', job.helper_assigned_to)
        .maybeSingle();
      helperName = helperProf?.full_name ?? null;
    }

    // ── 3. Today's timecard for assigned operator ────────────────────────────
    const todayStr = new Date().toISOString().split('T')[0];
    let clockInTime: string | null = null;
    let clockOutTime: string | null = null;

    if (job.assigned_to) {
      const { data: timecardRows } = await supabaseAdmin
        .from('timecards')
        .select('clock_in_time, clock_out_time')
        .eq('user_id', job.assigned_to)
        .eq('date', todayStr)
        .order('clock_in_time', { ascending: true })
        .limit(1);

      if (timecardRows && timecardRows.length > 0) {
        const tc = timecardRows[0] as { clock_in_time?: string | null; clock_out_time?: string | null };
        clockInTime = tc.clock_in_time ?? null;
        clockOutTime = tc.clock_out_time ?? null;
      }
    }

    // ── 4. Active standby log (gracefully skip if table absent) ─────────────
    let standbyActive = false;
    let standbyStartedAt: string | null = null;
    let standbyDurationMinutes: number | null = null;

    const { data: standbyRows, error: standbyErr } = await supabaseAdmin
      .from('standby_logs')
      .select('started_at, ended_at')
      .eq('job_order_id', jobId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1);

    const standbyTableMissing =
      standbyErr &&
      (standbyErr.code === '42P01' ||
        (standbyErr.message ?? '').includes('does not exist'));

    if (!standbyTableMissing && standbyRows && standbyRows.length > 0) {
      const row = standbyRows[0] as { started_at: string; ended_at: string | null };
      if (!row.ended_at) {
        standbyActive = true;
        standbyStartedAt = row.started_at;
        standbyDurationMinutes = minutesSince(row.started_at);
      }
    }

    // ── 4b. All standby segments started today (gracefully skip if absent) ──
    type StandbySegment = {
      id: string;
      started_at: string;
      ended_at: string | null;
      duration_minutes: number;
      reason: string | null;
    };
    let standbySegmentsToday: StandbySegment[] = [];
    if (!standbyTableMissing) {
      try {
        const tomorrow = new Date(todayStr);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        let segQuery = supabaseAdmin
          .from('standby_logs')
          .select('id, started_at, ended_at, reason')
          .eq('job_order_id', jobId)
          .gte('started_at', todayStr)
          .lt('started_at', tomorrowStr)
          .order('started_at', { ascending: false });
        if (tenantId) segQuery = segQuery.eq('tenant_id', tenantId);

        const { data: segRows, error: segErr } = await segQuery;

        const segTableMissing =
          segErr &&
          (segErr.code === '42P01' ||
            (segErr.message ?? '').includes('does not exist'));

        if (!segTableMissing && segRows) {
          standbySegmentsToday = (segRows as Array<Record<string, unknown>>).map((r) => {
            const startedAt = String(r['started_at']);
            const endedAt = (r['ended_at'] as string | null) ?? null;
            const endMs = endedAt ? new Date(endedAt).getTime() : Date.now();
            const startMs = new Date(startedAt).getTime();
            const durationMinutes = Math.max(0, Math.floor((endMs - startMs) / 60000));
            return {
              id: String(r['id']),
              started_at: startedAt,
              ended_at: endedAt,
              duration_minutes: durationMinutes,
              reason: (r['reason'] as string | null) ?? null,
            };
          });
        }
      } catch (e) {
        console.error('live-status: standby_segments_today fetch failed', e);
        standbySegmentsToday = [];
      }
    }

    // ── 5. Work performed today ──────────────────────────────────────────────
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

    const workPerformedToday = (progressRows ?? []).map((r) => ({
      id: r.id,
      work_type: (r as any).work_type ?? null,
      quantity_completed: Number(r.quantity_completed),
      notes: (r as any).notes ?? null,
      scope_item_description:
        (r.job_scope_items as { description?: string } | null)?.description ?? null,
    }));

    // ── 5b. Work performed count + last entry timestamp (today) ─────────────
    let workPerformedCountToday = 0;
    let lastWorkPerformedAt: string | null = null;
    try {
      const { data: latestRows } = await supabaseAdmin
        .from('job_progress_entries')
        .select('created_at, date')
        .eq('job_order_id', jobId)
        .eq('date', todayStr)
        .order('created_at', { ascending: false })
        .limit(1);

      if (latestRows && latestRows.length > 0) {
        const r = latestRows[0] as Record<string, string | null>;
        lastWorkPerformedAt = r['created_at'] ?? r['date'] ?? null;
      }

      const { count: progressCount } = await supabaseAdmin
        .from('job_progress_entries')
        .select('id', { count: 'exact', head: true })
        .eq('job_order_id', jobId)
        .eq('date', todayStr);

      workPerformedCountToday = progressCount ?? 0;
    } catch (e) {
      console.error('live-status: work_performed count/last fetch failed', e);
      workPerformedCountToday = 0;
      lastWorkPerformedAt = null;
    }

    // ── 6. Status history (gracefully skip if table absent) ──────────────────
    const { data: historyRows, error: historyErr } = await supabaseAdmin
      .from('job_status_history')
      .select('status, changed_at, changed_by')
      .eq('job_order_id', jobId)
      .order('changed_at', { ascending: false })
      .limit(20);

    const historyTableMissing =
      historyErr &&
      (historyErr.code === '42P01' ||
        (historyErr.message ?? '').includes('does not exist'));

    const statusHistory = (!historyTableMissing && historyRows)
      ? (historyRows as Array<{ status: string; changed_at: string; changed_by?: string | null }>).map((h) => ({
          status: h.status,
          changed_at: h.changed_at,
          changed_by: h.changed_by ?? null,
        }))
      : [];

    // ── 6b. Live draft from operator's work-performed page (real-time) ───────
    type DraftWorkPerformed = {
      items: unknown[];
      notes: string | null;
      updated_at: string | null;
      source: 'operator' | 'helper';
    } | null;
    let draftWorkPerformed: DraftWorkPerformed = null;
    try {
      const candidateIds = [job.assigned_to, job.helper_assigned_to].filter(
        (x): x is string => typeof x === 'string' && x.length > 0
      );
      if (candidateIds.length > 0) {
        const { data: draftRows } = await supabaseAdmin
          .from('daily_job_logs')
          .select('operator_id, work_performed_draft, updated_at')
          .eq('job_order_id', jobId)
          .eq('log_date', todayStr)
          .in('operator_id', candidateIds)
          .order('updated_at', { ascending: false });

        const rows = (draftRows ?? []) as Array<{
          operator_id: string;
          work_performed_draft: Record<string, unknown> | null;
          updated_at: string | null;
        }>;
        const withItems = rows.find((r) => {
          const draft = r.work_performed_draft;
          if (!draft || typeof draft !== 'object') return false;
          const items = (draft as { selectedItems?: unknown[] }).selectedItems;
          return Array.isArray(items) && items.length > 0;
        });
        if (withItems) {
          const draft = withItems.work_performed_draft as {
            selectedItems?: unknown[];
            jobNotes?: string;
          };
          draftWorkPerformed = {
            items: Array.isArray(draft.selectedItems) ? draft.selectedItems : [],
            notes: typeof draft.jobNotes === 'string' ? draft.jobNotes : null,
            updated_at: withItems.updated_at,
            source:
              withItems.operator_id === job.assigned_to ? 'operator' : 'helper',
          };
        }
      }
    } catch (err) {
      console.error('[live-status] draft_work_performed error', err);
      draftWorkPerformed = null;
    }

    // ── 7. Computed durations ────────────────────────────────────────────────
    const onSiteAnchor = arrivedAt ?? workStartedAt;
    const timeOnSiteMinutes =
      onSiteAnchor && !clockOutTime ? minutesSince(onSiteAnchor) : null;

    return NextResponse.json({
      success: true,
      data: {
        status: job.status,
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
        // New fields
        standby_segments_today: standbySegmentsToday,
        last_work_performed_at: lastWorkPerformedAt,
        work_performed_count_today: workPerformedCountToday,
        route_start_coords: routeStartCoords,
        work_start_coords: workStartCoords,
        draft_work_performed: draftWorkPerformed,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /live-status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
