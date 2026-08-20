export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/schedule-board
 * Fetch schedule board data for a given date range.
 * Pending jobs are ALWAYS fetched regardless of date (global queue).
 * Access: admin, super_admin, salesman
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { jobRunsOn } from '@/lib/job-workdays';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { OFF_PLATFORM_LEAD_COLUMN, isMissingColumnError, placesSomeone } from '@/lib/off-platform-lead';

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

    const { data: jobsRaw, error } = await query;

    if (error) {
      console.error('Error fetching schedule board:', error);
      return NextResponse.json({ error: 'Failed to fetch schedule data' }, { status: 500 });
    }

    // A SPAN DOES NOT SKIP WEEKENDS. The date filter above is pure arithmetic —
    // start <= day <= end — so a Monday-to-Friday job sat on the board on
    // Saturday and Sunday, was counted in Jobs Today, and ate a capacity slot on
    // days nobody works. On Saturday Aug 15 that read "FULL 11/10" with three
    // crews out, and the office uses that number to decide whether it can take
    // another call.
    //
    // Every one of those jobs already carried
    // `scheduling_flexibility.can_work_weekends = false`, set on the schedule
    // form. Nothing had ever read it. See lib/job-workdays.ts.
    const jobs = date
      ? ((jobsRaw as any[]) ?? []).filter((j) => jobRunsOn(j, date))
      : ((jobsRaw as any[]) ?? []);

    // 1b. Overlay per-day assignments when viewing a single date
    // This ensures multi-day jobs show the operator assigned to THAT specific day,
    // not the job_orders.assigned_to which reflects the first-ever assignment.
    if (date && jobs && jobs.length > 0) {
      const OVERLAY_COLUMNS = 'job_order_id, operator_id, helper_id, operator_name, helper_name, day_sequence';
      const dailyFor = (columns: string) => {
        let q = supabaseAdmin
          .from('job_daily_assignments')
          .select(columns)
          .eq('assignment_date', date);
        if (tenantId) { q = q.eq('tenant_id', tenantId); }
        return q;
      };
      // THE MIGRATION IS APPLIED BY HAND, SO THIS READ HAS TO SURVIVE ITS
      // ABSENCE. PostgREST rejects the WHOLE select on one unknown column, and
      // this select is the per-day ledger overlay — the thing that makes the
      // board show TODAY's operator rather than the job's first-ever one. An
      // unguarded new column here would not degrade the lead name, it would
      // silently take the entire overlay down. Ask for the column, fall back to
      // the exact previous select when it is not there yet.
      let dailyRes: { data: any[] | null; error: any } = await dailyFor(
        `${OVERLAY_COLUMNS}, ${OFF_PLATFORM_LEAD_COLUMN}`
      ) as any;
      if (dailyRes.error && isMissingColumnError(dailyRes.error)) {
        dailyRes = await dailyFor(OVERLAY_COLUMNS) as any;
      }
      if (dailyRes.error) {
        console.error('Error fetching per-day assignments:', dailyRes.error);
      }
      const dailyAssignments = dailyRes.data as any[] | null;

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
            // Who is running this crew when nobody on Pontifex is. Absent
            // entirely until the migration lands (see the fallback above), which
            // is why this is `?? null` rather than a bare read.
            job.off_platform_lead_name = (da as any)[OFF_PLATFORM_LEAD_COLUMN] ?? null;
            // THE LEDGER HAS SPOKEN FOR THIS DATE, so the job's own seats are no
            // longer the fallback for it. 11 production rows place NOBODY on a
            // date for a job whose `helper_assigned_to` is still set — a date held
            // open on the board, for a job that has a helper on other days. Those
            // must keep landing in the unassigned pile exactly as they do today;
            // without this flag the helper-only classification below would read
            // the job's stale seat and file them as crewed.
            job.day_crew_stated = true;
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

    // A CREW OF ONE HELPER IS STILL A CREW (founder, Aug 20).
    //
    // This read `job.assigned_to` alone, which is where the office's request
    // actually died. Every other layer already allowed a helper-only placement —
    // `job_daily_assignments` has had both id columns nullable since April,
    // `shouldPromoteToAssigned` counts a helper as somebody since Aug 13, and
    // `lib/dispatch.ts` has texted helper-only jobs since Aug 15 — but the board
    // then filed the job under UNASSIGNED, so the office pressed assign, watched
    // the ticket drop back into the unassigned pile, and concluded it had not
    // worked. Zero of 111 production rows are helper-only; this line is the
    // reason.
    //
    // `helper_id` is the per-day ledger's helper, set by the overlay above and
    // ONLY there — `schedule_board_view` has no such column. The ledger is the
    // only thing that can put a helper on a crew for a DATE.
    //
    // ⚠️ `job_orders.helper_assigned_to` is deliberately NOT a fallback here.
    // It is a job-level seat, not a statement about this date, and it has never
    // once affected this classification — before today only `assigned_to` did. On
    // a date the ledger did not speak for, reading it would take a job OUT of the
    // Unassigned pile on a seat nobody stated: extend a job's `end_date` past its
    // ledger rows and the new days would draw as crewed. A job nobody sees in the
    // pile is a job nobody dispatches. Nothing is lost by declining it — a
    // helper-only placement always writes the ledger rows for the dates it
    // states, so the crew still lands on exactly the days the office named.
    //
    // `day_crew_stated` (set by the overlay) is what tells "the ledger said
    // nobody" apart from "the ledger said nothing": 11 production rows place
    // NOBODY for a job whose `helper_assigned_to` is still set — a date held open
    // on the board — and those must keep landing in Unassigned exactly as today.
    for (const job of jobs || []) {
      const helperOnDay = job.day_crew_stated ? (job.helper_id ?? null) : null;
      if (job.is_will_call) {
        continue; // will-call fetched separately
      } else if (placesSomeone({ operator_id: job.assigned_to ?? null, helper_id: helperOnDay })) {
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
