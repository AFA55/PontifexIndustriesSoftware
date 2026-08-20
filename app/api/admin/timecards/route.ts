export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/timecards
 * Get all timecards for admin viewing (requires admin role)
 *
 * Query params:
 *   userId    — filter to a specific operator
 *   startDate — YYYY-MM-DD lower bound
 *   endDate   — YYYY-MM-DD upper bound
 *   pending   — 'true' to show only un-approved entries
 *   status    — 'active' for currently clocked-in, 'completed' for clocked-out
 *   limit     — max results (default 100)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireTimecardViewer, isTableNotFoundError } from '@/lib/api-auth';
import {
  loadTimecardDayJobs,
  formatJobContextLabel,
  formatJobConflictNote,
  jobSourceNote,
  personDayKey,
} from '@/lib/timecard-job-context';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireTimecardViewer(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const pending = searchParams.get('pending');
    const status = searchParams.get('status'); // 'active' | 'completed'
    const limit = Math.min(parseInt(searchParams.get('limit') || '100') || 100, 500);

    // Use the view that joins with profiles for user details
    let query = supabaseAdmin
      .from('timecards_with_users')
      .select('*')
      .order('clock_in_time', { ascending: false });

    // Scope to tenant
    query = query.eq('tenant_id', tenantId);

    // Apply filters
    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (startDate) {
      query = query.gte('date', startDate);
    }

    if (endDate) {
      query = query.lte('date', endDate);
    }

    if (pending === 'true') {
      query = query.eq('approval_status', 'pending');
    }

    // THE REVIEW QUEUE IS `flagged`, NOT `pending`.
    //
    // `approval_status = 'pending'` is a card that is still OPEN — the crew is
    // clocked in right now. In production every pending row has a null
    // `total_hours`. A badge counting those reads ~8 every weekday morning and
    // drops to 0 at knock-off, signalling nothing an admin can act on.
    //
    // What actually wants a human is `flagged`: the auto-approver refused it.
    // Production holds 19, the oldest from May 18, including Aiden's 88.61-hour
    // card — none of them ever surfaced, because the sidebar badge read a
    // response shape this route does not return and sat at 0.
    //
    // Filtered server-side so `summary.pendingApproval` is counted over the
    // whole queue rather than over a 100-row page.
    if (searchParams.get('needsReview') === 'true') {
      query = query.eq('approval_status', 'flagged').eq('is_approved', false);
    }

    if (status === 'active') {
      query = query.is('clock_out_time', null);
    } else if (status === 'completed') {
      query = query.not('clock_out_time', 'is', null);
    }

    // Apply limit
    query = query.limit(limit);

    const { data: timecards, error: fetchError } = await query;

    if (fetchError) {
      if (isTableNotFoundError(fetchError)) {
        return NextResponse.json(
          { success: true, data: { timecards: [], summary: { totalEntries: 0, totalHours: 0, pendingApproval: 0, activeEntries: 0 }, userSummary: [] } },
          { status: 200 }
        );
      }
      console.error('Error fetching timecards:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch timecards' },
        { status: 500 }
      );
    }

    // ── WHERE WAS EACH PERSON? ──────────────────────────────────────────────
    // The founder and Amanda want the CONTRACTOR, JOB NUMBER and PROJECT on a
    // timecard. Named, never costed. `timecards.job_order_id`
    // is the LAST source consulted, not the first: it is stamped at clock-in,
    // before the office finishes the schedule board, and is never revisited.
    // The board decides, the filed logs speak when it is silent, and a rung that
    // was outranked is REPORTED. READ-time only — nothing is written back into
    // the payroll record. See lib/timecard-job-context.ts.
    const { byPersonDay: dayJobs, error: jobsError } = await loadTimecardDayJobs(
      (timecards ?? []).map((tc: any) => ({
        id: tc.id,
        user_id: tc.user_id,
        date: tc.date,
        job_order_id: tc.job_order_id ?? null,
      })),
      tenantId
    );
    if (jobsError) console.error('[admin timecards] job lookup failed —', jobsError);

    // THREE FIELDS PER CARD, AND ALL THREE ARE RENDERED — the operator profile's
    // Timecards tab (app/dashboard/admin/operator-profiles) prints the label in
    // its Job column, the conflict note beneath it, and the lookup-failure state
    // instead of a blank. Nothing else is attached: a field no screen reads is
    // the defect this file already shipped once (see the deletion note below).
    for (const tc of timecards ?? []) {
      const day = dayJobs.get(personDayKey(tc.user_id, tc.date));
      tc.job_context_labels = (day?.jobs ?? []).map((j) => ({
        label: formatJobContextLabel(j),
        qualifier: jobSourceNote(j.source),
      }));
      tc.job_conflict_note = formatJobConflictNote(day);
      tc.job_lookup_failed = !!jobsError;
    }

    // ── DELETED (Aug 20): hoursByContractor / hoursByProject / unattributed /
    //    multiJob / conflicts ────────────────────────────────────────────────
    //
    // They were computed on every request and read by NOBODY. The three callers
    // of this route take the `timecards` array and nothing else: the grid page
    // bulk-approves by id (and draws itself from `team-summary`), the operator
    // profile lists the rows, and the sidebar reads a count.
    //
    // They are not wired up instead of deleted, for a reason beyond "unused".
    // "Hours by contractor" is a BILLING question, and the only honest answer
    // divides a day between the jobs worked — which is the work ticket's
    // arithmetic and is deliberately kept off the payroll path (founder +
    // Amanda, Aug 20; docs/plans/AUG19_FOUNDER_BRIEF.md §10). The deleted
    // rollup filed each WHOLE day under one primary job, so a 9.7-hour day
    // split between two contractors billed all 9.7 to the first. Rendered on a
    // payroll screen that reads as a billing total and is wrong by design.
    // Whoever needs hours-per-contractor should build it on the ticket side,
    // from the split, not resurrect this.

    // Calculate summary statistics
    const totalHours = timecards?.reduce((sum: number, tc: any) => sum + (tc.total_hours || 0), 0) || 0;
    const totalEntries = timecards?.length || 0;
    const pendingApproval = timecards?.filter((tc: any) => !tc.is_approved).length || 0;
    const activeEntries = timecards?.filter((tc: any) => tc.clock_out_time === null).length || 0;

    // Group by user
    const userSummary = timecards?.reduce((acc: any, tc: any) => {
      if (!acc[tc.user_id]) {
        acc[tc.user_id] = {
          userId: tc.user_id,
          fullName: tc.full_name,
          email: tc.email,
          role: tc.role,
          totalHours: 0,
          entries: 0,
        };
      }
      acc[tc.user_id].totalHours += tc.total_hours || 0;
      acc[tc.user_id].entries += 1;
      return acc;
    }, {}) || {};

    return NextResponse.json(
      {
        success: true,
        data: {
          timecards: timecards || [],
          summary: {
            totalEntries,
            totalHours: parseFloat(totalHours.toFixed(2)),
            pendingApproval,
            activeEntries,
          },
          userSummary: Object.values(userSummary),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in admin timecards route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
