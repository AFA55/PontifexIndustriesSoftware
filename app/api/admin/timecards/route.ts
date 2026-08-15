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
import { resolveTimecardJobContext, formatJobContextLabel } from '@/lib/timecard-job-context';

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

    // ── WHERE WAS EACH PERSON? (M9a) ────────────────────────────────────────
    // The founder wants the CONTRACTOR and PROJECT on a timecard, and hours
    // totalled per contractor/project. `timecards.job_order_id` alone answers
    // that for only ~60% of recent field entries, so this resolver also derives
    // it from the day's ledger and work logs. READ-time only — nothing is
    // written back into the payroll record. See lib/timecard-job-context.ts.
    const jobContext = await resolveTimecardJobContext(
      (timecards ?? []).map((tc: any) => ({
        id: tc.id,
        user_id: tc.user_id,
        date: tc.date,
        job_order_id: tc.job_order_id ?? null,
      })),
      tenantId
    );

    for (const tc of timecards ?? []) {
      const ctx = jobContext.get(tc.id);
      tc.job_context = ctx ?? null;
      tc.job_context_label = formatJobContextLabel(ctx);
    }

    // Hours by contractor and by project — the actual question ("how many hours
    // are we working on this customer / this project"). Anything we could not
    // attribute is counted SEPARATELY and reported, never folded into a total
    // that would then read as complete.
    const byContractor = new Map<string, { name: string; hours: number; entries: number }>();
    const byProject = new Map<string, { name: string; contractor: string | null; hours: number; entries: number }>();
    let unattributedHours = 0;
    let unattributedEntries = 0;

    for (const tc of timecards ?? []) {
      const hours = Number(tc.total_hours) || 0;
      const ctx = tc.job_context as { customerName?: string | null; projectName?: string | null } | null;
      if (!ctx?.customerName && !ctx?.projectName) {
        unattributedHours += hours;
        unattributedEntries += 1;
        continue;
      }
      if (ctx.customerName) {
        const k = ctx.customerName;
        const row = byContractor.get(k) ?? { name: k, hours: 0, entries: 0 };
        row.hours += hours; row.entries += 1;
        byContractor.set(k, row);
      }
      if (ctx.projectName) {
        const k = `${ctx.customerName ?? ''}|${ctx.projectName}`;
        const row = byProject.get(k) ?? { name: ctx.projectName, contractor: ctx.customerName ?? null, hours: 0, entries: 0 };
        row.hours += hours; row.entries += 1;
        byProject.set(k, row);
      }
    }

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const hoursByContractor = [...byContractor.values()]
      .map((r) => ({ ...r, hours: round1(r.hours) }))
      .sort((a, b) => b.hours - a.hours);
    const hoursByProject = [...byProject.values()]
      .map((r) => ({ ...r, hours: round1(r.hours) }))
      .sort((a, b) => b.hours - a.hours);

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
          // M9b — hours by contractor and by project. `unattributed` is reported
          // rather than hidden: a total that silently omits hours we could not
          // place is worse than no total, because it would be trusted.
          hoursByContractor,
          hoursByProject,
          unattributed: {
            hours: round1(unattributedHours),
            entries: unattributedEntries,
          },
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
