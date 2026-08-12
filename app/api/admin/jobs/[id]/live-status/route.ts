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
import { loadJobProgress, explodeProgressEntries } from '@/lib/job-progress-server';
import { tenantToday, tenantDayStartUTC } from '@/lib/tenant-timezone';

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
    // `new Date().toISOString().split('T')[0]` was UTC — the exact pattern
    // CLAUDE.md forbids. After 8pm Eastern it asked for TOMORROW's date, found
    // no timecard, and fell through to the job-level arrival stamp below. That
    // is half of the "213 hours on site" reading.
    const todayStr = await tenantToday(tenantId ?? null);
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
        // `started_at` is a timestamptz and the database runs in UTC, so
        // comparing it against a bare local date string shifted the window to
        // 8pm–8pm Eastern: a standby started after 8pm fell out of "today".
        // Use the tenant's real day boundary instead.
        const dayStartIso = await tenantDayStartUTC(tenantId ?? null);
        const dayEndIso = new Date(new Date(dayStartIso).getTime() + 24 * 60 * 60 * 1000).toISOString();

        let segQuery = supabaseAdmin
          .from('standby_logs')
          .select('id, started_at, ended_at, reason')
          .eq('job_order_id', jobId)
          .gte('started_at', dayStartIso)
          .lt('started_at', dayEndIso)
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
    // Derived from work_items (what the operator actually recorded). This used
    // to read `job_progress_entries`, which nothing writes — so the live board
    // reported "no work performed" on every job all day. See lib/job-progress.ts.
    let workPerformedToday: Array<{
      id: string;
      work_type: string | null;
      quantity_completed: number;
      notes: string | null;
      scope_item_description: string | null;
    }> = [];
    let workPerformedCountToday = 0;
    let lastWorkPerformedAt: string | null = null;

    try {
      const loaded = await loadJobProgress(jobId, tenantId);
      const todaysEntries = explodeProgressEntries(loaded).filter((e) => e.date === todayStr);
      const createdById = new Map(loaded.work_items.map((w) => [w.id, w.created_at]));

      workPerformedToday = todaysEntries.map((e) => ({
        id: e.id,
        work_type: e.work_type ?? null,
        quantity_completed: Number(e.quantity_completed ?? 0),
        notes: e.notes,
        scope_item_description: e.description,
      }));
      workPerformedCountToday = todaysEntries.length;
      lastWorkPerformedAt =
        todaysEntries
          .map((e) => createdById.get(e.id) ?? null)
          .filter((v): v is string => !!v)
          .sort()
          .reverse()[0] ?? null;
    } catch (e) {
      console.error('live-status: work performed today fetch failed', e);
    }

    // ── 6. Status history (gracefully skip if table absent) ──────────────────
    // job_status_history columns: id, job_id, old_status, new_status, changed_by, changed_at, notes
    const { data: historyRows, error: historyErr } = await supabaseAdmin
      .from('job_status_history')
      .select('new_status, changed_at, changed_by')
      .eq('job_id', jobId)
      .order('changed_at', { ascending: false })
      .limit(20);

    const historyTableMissing =
      historyErr &&
      (historyErr.code === '42P01' ||
        (historyErr.message ?? '').includes('does not exist'));

    const statusHistory = (!historyTableMissing && historyRows)
      ? (historyRows as Array<{ new_status: string; changed_at: string; changed_by?: string | null }>).map((h) => ({
          status: h.new_status,
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
          .select('operator_id, work_performed_draft, work_performed_draft_updated_at, created_at')
          .eq('job_order_id', jobId)
          .eq('log_date', todayStr)
          .in('operator_id', candidateIds)
          .order('work_performed_draft_updated_at', { ascending: false, nullsFirst: false });

        const rows = (draftRows ?? []) as Array<{
          operator_id: string;
          work_performed_draft: Record<string, unknown> | null;
          work_performed_draft_updated_at: string | null;
          created_at: string | null;
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
            updated_at:
              withItems.work_performed_draft_updated_at ?? withItems.created_at,
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
    //
    // TIME ON SITE COMES FROM THE CREW CLOCK, NOT THE JOB TIMESTAMPS
    // (founder, Aug 11: "212 hours is not real, and that's on multiple active
    //  jobs — let's pull that from crew clock-ins").
    //
    // It used to anchor on `arrived_at_jobsite_at`, which is stamped ONCE per
    // job and never reset. JOB-2026-424813 (Parkk Concrete) was stamped on
    // Aug 3, ran multi-day, and by Aug 11 the panel read 213 hours on site —
    // it was measuring calendar time since the job began, not a shift.
    //
    // The clock card is the honest source: it is per-day, it is what payroll
    // uses, and it is the number the founder already trusts on the "Crew Clock
    // Ins" panel right beside this one. Clocked out now shows the day's total
    // instead of blanking.
    //
    // The job stamps remain the fallback for a crew that has not clocked in,
    // but CLAMPED to today — a stale anchor can now overstate by at most one
    // day instead of by a week.
    let timeOnSiteMinutes: number | null = null;
    if (clockInTime) {
      const start = new Date(clockInTime).getTime();
      const end = clockOutTime ? new Date(clockOutTime).getTime() : Date.now();
      // Clamped to 24h. A forgotten clock-out is closed by the hourly
      // auto-clockout cron, but one card in production ran 89 hours before it
      // was auto-closed four days late. Without a ceiling this panel could
      // print another 213 through a different door.
      timeOnSiteMinutes = Math.min(24 * 60, Math.max(0, Math.floor((end - start) / 60000)));
    } else {
      const onSiteAnchor = arrivedAt ?? workStartedAt;
      const dayStart = await tenantDayStartUTC(tenantId ?? null);
      const anchoredToday =
        onSiteAnchor && new Date(onSiteAnchor).getTime() >= new Date(dayStart).getTime()
          ? onSiteAnchor
          : null;
      timeOnSiteMinutes = anchoredToday && !clockOutTime ? minutesSince(anchoredToday) : null;
    }

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
