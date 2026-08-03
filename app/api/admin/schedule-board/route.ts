export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/schedule-board
 * Fetch schedule board data for a given date range.
 * Pending jobs are ALWAYS fetched regardless of date (global queue).
 * Access: admin, super_admin, salesman
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });

    // Resolve tenant timezone so fallback "today" uses local date, not UTC.
    let tenantTz = 'America/New_York';
    try {
      const { data: tenantRow } = await supabaseAdmin
        .from('tenants')
        .select('timezone')
        .eq('id', tenantId)
        .maybeSingle();
      if (tenantRow?.timezone) tenantTz = tenantRow.timezone;
    } catch { /* non-critical */ }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // YYYY-MM-DD
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // 1. Fetch scheduled jobs filtered by date
    let query = supabaseAdmin
      .from('schedule_board_view')
      .select('*')
      .neq('status', 'pending_approval')
      .order('arrival_time', { ascending: true, nullsFirst: false });

    query = query.eq('tenant_id', tenantId);

    if (date) {
      // Show a job on a given date if it starts on or before that date
      // AND has no end_date OR its end_date is on or after that date.
      // This makes multi-day jobs appear on every day in their span.
      query = query.lte('scheduled_date', date).or(`end_date.is.null,end_date.gte.${date}`);
    } else if (startDate && endDate) {
      // Overlap query: job spans the range if it starts on or before endDate
      // AND (has no end_date OR ends on or after startDate)
      query = query.lte('scheduled_date', endDate).or(`end_date.is.null,end_date.gte.${startDate}`);
    } else {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: tenantTz });
      query = query.lte('scheduled_date', today).or(`end_date.is.null,end_date.gte.${today}`);
    }

    const { data: jobs, error } = await query;

    if (error) {
      console.error('Error fetching schedule board:', error);
      return NextResponse.json({ error: 'Failed to fetch schedule data' }, { status: 500 });
    }

    // 1b. Overlay per-day assignments when viewing a single date
    // This ensures multi-day jobs show the operator assigned to THAT specific day,
    // not the job_orders.assigned_to which reflects the first-ever assignment.
    if (date && jobs && jobs.length > 0) {
      let dailyQuery = supabaseAdmin
        .from('job_daily_assignments')
        .select('job_order_id, operator_id, helper_id, operator_name, helper_name, day_sequence')
        .eq('assignment_date', date);
      if (tenantId) { dailyQuery = dailyQuery.eq('tenant_id', tenantId); }
      const { data: dailyAssignments } = await dailyQuery;

      if (dailyAssignments && dailyAssignments.length > 0) {
        const dailyMap = new Map(dailyAssignments.map(a => [a.job_order_id, a]));
        // How many jobs each operator holds THIS date (sequencing, Aug 2026)
        // — drives the "1st/2nd job" badge on board cards.
        const operatorDayCounts = new Map<string, number>();
        for (const a of dailyAssignments) {
          if (a.operator_id) {
            operatorDayCounts.set(a.operator_id, (operatorDayCounts.get(a.operator_id) || 0) + 1);
          }
        }
        for (const job of jobs) {
          const da = dailyMap.get(job.id);
          if (da) {
            // operator_id / helper_id may be null (explicit unassign for this day)
            job.assigned_to = da.operator_id !== undefined ? da.operator_id : job.assigned_to;
            job.helper_id = da.helper_id !== undefined ? da.helper_id : job.helper_id;
            if (da.operator_name !== undefined) job.operator_name = da.operator_name;
            if (da.helper_name !== undefined) job.helper_name = da.helper_name;
            job.day_sequence = da.day_sequence ?? 1;
            job.operator_day_job_count = da.operator_id ? (operatorDayCounts.get(da.operator_id) || 1) : 1;
          }
        }
      }
    }

    // 2. Fetch ALL pending_approval jobs (not date-filtered — global queue)
    let pendingQuery = supabaseAdmin
      .from('schedule_board_view')
      .select('*')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });
    pendingQuery = pendingQuery.eq('tenant_id', tenantId);
    const { data: pendingJobs, error: pendingError } = await pendingQuery;

    if (pendingError) {
      console.error('Error fetching pending jobs:', pendingError);
    }

    // 3. Fetch ALL will-call jobs (also global — not date-filtered)
    let wcQuery = supabaseAdmin
      .from('schedule_board_view')
      .select('*')
      .eq('is_will_call', true)
      .neq('status', 'pending_approval')
      .order('created_at', { ascending: false });
    wcQuery = wcQuery.eq('tenant_id', tenantId);
    const { data: willCallJobs, error: wcError } = await wcQuery;

    if (wcError) {
      console.error('Error fetching will-call jobs:', wcError);
    }

    // ── 4. Crew overlay (Aug 2026) ──────────────────────────────────────────
    // The board card only ever showed the lead (assigned_to) + the helper seat
    // (helper_assigned_to), so a 3rd/4th person added through job_crew was
    // INVISIBLE on the board even though the detail panel listed them. Attach
    // the crew here.
    //
    // TWO queries total for the whole board, never one per card:
    //   1. job_crew for every visible job id (tenant-scoped)
    //   2. profiles for the distinct user ids on those rows (tenant-scoped)
    const boardJobs = [...(jobs || []), ...(pendingJobs || []), ...(willCallJobs || [])];
    const boardJobIds = Array.from(new Set(boardJobs.map((j: any) => j.id).filter(Boolean)));

    if (boardJobIds.length > 0) {
      const { data: crewRows, error: crewError } = await supabaseAdmin
        .from('job_crew')
        .select('job_order_id, user_id, role')
        .eq('tenant_id', tenantId)
        .in('job_order_id', boardJobIds);

      if (crewError) {
        // Non-fatal: the board still renders with lead + helper only.
        console.error('Error fetching board crew:', crewError);
      }

      const nameById = new Map<string, string>();
      const userIds = Array.from(new Set((crewRows || []).map((r) => r.user_id).filter(Boolean)));
      if (userIds.length > 0) {
        const { data: profs } = await supabaseAdmin
          .from('profiles')
          .select('id, full_name')
          .eq('tenant_id', tenantId)
          .in('id', userIds);
        for (const p of profs || []) nameById.set(p.id, p.full_name || 'Crew member');
      }

      const crewByJob = new Map<string, { user_id: string; name: string; role: string }[]>();
      for (const row of crewRows || []) {
        const list = crewByJob.get(row.job_order_id) || [];
        list.push({
          user_id: row.user_id,
          name: nameById.get(row.user_id) || 'Crew member',
          role: row.role === 'operator' ? 'operator' : 'helper',
        });
        crewByJob.set(row.job_order_id, list);
      }

      for (const job of boardJobs as any[]) {
        const list = crewByJob.get(job.id) || [];
        // Don't print anyone twice: the card already renders the lead (after
        // the per-day overlay above) and the helper seat.
        const leadId = job.assigned_to ?? null;
        const helperId = job.helper_id != null ? job.helper_id : job.helper_assigned_to ?? null;
        job.crew = list
          .filter((m) => m.user_id !== leadId && m.user_id !== helperId)
          // Operators first (they run equipment), then helpers, each A→Z.
          .sort((a, b) =>
            a.role === b.role
              ? a.name.localeCompare(b.name)
              : a.role === 'operator'
                ? -1
                : 1
          );
      }
    }

    // Group date-filtered jobs
    const assigned: typeof jobs = [];
    const unassigned: typeof jobs = [];

    for (const job of jobs || []) {
      if (job.is_will_call) {
        continue; // will-call fetched separately
      } else if (job.assigned_to) {
        assigned.push(job);
      } else {
        unassigned.push(job);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        assigned,
        unassigned,
        pending: pendingJobs || [],
        willCall: willCallJobs || [],
        total: (jobs?.length || 0) + (pendingJobs?.length || 0) + (willCallJobs?.length || 0),
      },
      meta: {
        userRole: auth.role,
        canEdit: auth.role === 'super_admin',
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/schedule-board:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
