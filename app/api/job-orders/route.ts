export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/job-orders
 * Get job orders assigned to the current operator
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';

// OFFICE-ONLY money/estimate fields — operators & helpers must NEVER receive
// these (founder: cost/quote/hours are office-only). Nulled on every non-admin
// response so the numbers don't reach the device at all, not just hidden in UI.
const OFFICE_ONLY_FIELDS = [
  'estimated_hours', 'estimated_cost', 'job_quote',
  'equipment_cost', 'material_cost', 'other_cost', 'subcontractor_cost',
  'mileage_rate', 'drive_distance_miles', 'track_financials',
  'labor_cost', 'total_cost', 'gross_profit', 'billable_hours',
];
function stripOfficeOnly<T extends Record<string, any>>(row: T): T {
  const c: Record<string, any> = { ...row };
  for (const f of OFFICE_ONLY_FIELDS) if (f in c) c[f] = null;
  return c as T;
}

export async function GET(request: NextRequest) {
  try {
    // Get user from Supabase session (server-side)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const includeCompleted = searchParams.get('includeCompleted') === 'true';
    const scheduledDate = searchParams.get('scheduled_date');
    const includeHelperJobs = searchParams.get('include_helper_jobs') === 'true';
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const userRole = profile?.role || 'operator';
    const isAdmin = ['super_admin', 'operations_manager', 'admin', 'salesman', 'shop_manager', 'inventory_manager'].includes(userRole);
    const tenantId = await getTenantId(user.id);

    // Non-super-admins must have a resolved tenant; null means the profile lookup
    // failed silently and proceeding would expose all tenants' data.
    if (!tenantId && userRole !== 'super_admin') {
      return NextResponse.json(
        { error: 'Tenant context required' },
        { status: 403 }
      );
    }

    // Multi-operator crew: a non-admin can be crewed on jobs beyond the single
    // assigned_to / helper_assigned_to slots (job_crew). Resolve their crew jobs
    // once so access + list inclusion + helper/co-operator detection all agree.
    // role 'helper' → light helper view; role 'operator' → full work-performed
    // flow WITHOUT day-complete/status controls (the lead completes the ticket).
    let crewJobIds: string[] = [];
    const crewHelperJobIds = new Set<string>();
    const crewOperatorJobIds = new Set<string>();
    if (!isAdmin) {
      const { data: crewRows } = await supabaseAdmin
        .from('job_crew')
        .select('job_order_id, role')
        .eq('user_id', user.id);
      for (const r of crewRows || []) {
        crewJobIds.push(r.job_order_id);
        if (r.role === 'helper') crewHelperJobIds.add(r.job_order_id);
        else crewOperatorJobIds.add(r.job_order_id);
      }
    }

    // Tenant-local "today" for per-day assignment (JDA) visibility windows.
    let tenantToday = '';
    if (!isAdmin) {
      let tz = 'America/New_York';
      try {
        if (tenantId) {
          const { data: tzRow } = await supabaseAdmin
            .from('tenants')
            .select('timezone')
            .eq('id', tenantId)
            .maybeSingle();
          if (tzRow?.timezone) tz = tzRow.timezone;
        }
      } catch { /* fall back */ }
      tenantToday = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    }

    // Per-day assignment (job_daily_assignments) visibility: a non-admin also
    // sees jobs where the per-day ledger maps them (operator OR helper) to the
    // requested date or ANY date from today forward — e.g. the "day-2 operator"
    // of a multi-day job, before the morning sync promotes them to assigned_to.
    // Scoped by the user's own id (a uid belongs to exactly one tenant; legacy
    // ledger rows can carry tenant_id NULL, so an .eq tenant filter would drop
    // them). day_sequence rides along for the operator-side sequencing UI.
    const jdaUserJobIds: string[] = [];
    const jdaUserJobIdSet = new Set<string>();
    if (!isAdmin) {
      try {
        let jdaQuery = supabaseAdmin
          .from('job_daily_assignments')
          .select('job_order_id, assignment_date, operator_id, helper_id')
          .or(`operator_id.eq.${user.id},helper_id.eq.${user.id}`);
        // Window: today forward, plus the explicitly requested date (which may
        // be in the past — the operator reviewing an earlier day they ran).
        jdaQuery =
          scheduledDate && scheduledDate < tenantToday
            ? jdaQuery.or(`assignment_date.gte.${tenantToday},assignment_date.eq.${scheduledDate}`)
            : jdaQuery.gte('assignment_date', tenantToday);
        const { data: jdaRows } = await jdaQuery;
        for (const r of jdaRows || []) {
          if (!jdaUserJobIdSet.has(r.job_order_id)) {
            jdaUserJobIdSet.add(r.job_order_id);
            jdaUserJobIds.push(r.job_order_id);
          }
        }
      } catch { /* best-effort — falls back to assigned_to visibility */ }
    }

    // Helper detection for a job the current non-admin user is viewing.
    const viewerIsHelper = (j: any): boolean =>
      !isAdmin && j.assigned_to !== user.id &&
      (j.helper_assigned_to === user.id || crewHelperJobIds.has(j.id));

    // Co-operator detection: crewed with role 'operator' (not the lead, not in
    // the helper slot). Gets the FULL work-performed flow; day-complete and
    // status transitions stay lead-only.
    const viewerIsCoOperator = (j: any): boolean =>
      !isAdmin && j.assigned_to !== user.id &&
      j.helper_assigned_to !== user.id &&
      crewOperatorJobIds.has(j.id);

    // If ID is provided, fetch that specific job
    if (id) {
      let specificJobQuery = supabaseAdmin
        .from('active_job_orders')
        .select('*')
        .eq('id', id);
      if (tenantId) specificJobQuery = specificJobQuery.eq('tenant_id', tenantId);
      const { data: specificJob, error: jobError } = await specificJobQuery.single();

      if (jobError) {
        console.error('Error fetching specific job:', jobError);
        return NextResponse.json(
          { error: 'Failed to fetch job' },
          { status: 500 }
        );
      }

      if (!specificJob) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        );
      }

      // Check if user has access to this job (operator OR helper OR crew
      // member OR mapped to it by the per-day assignment ledger — e.g. the
      // day-2 operator of a multi-day job, or any date they ran it).
      let hasJdaAccess = jdaUserJobIdSet.has(specificJob.id);
      if (!isAdmin && !hasJdaAccess) {
        const { data: anyJdaRow } = await supabaseAdmin
          .from('job_daily_assignments')
          .select('id')
          .eq('job_order_id', specificJob.id)
          .or(`operator_id.eq.${user.id},helper_id.eq.${user.id}`)
          .limit(1)
          .maybeSingle();
        hasJdaAccess = !!anyJdaRow;
      }
      if (
        !isAdmin &&
        specificJob.assigned_to !== user.id &&
        specificJob.helper_assigned_to !== user.id &&
        !crewJobIds.includes(specificJob.id) &&
        !hasJdaAccess
      ) {
        return NextResponse.json(
          { error: 'Unauthorized to view this job' },
          { status: 403 }
        );
      }
      // Tell the client whether the viewer is a helper on this job (drives the
      // light "Team Member" view vs the full operator flow), and whether they
      // are a crew co-operator (full input, lead-only completion).
      if (!isAdmin) {
        (specificJob as any).viewer_is_helper = viewerIsHelper(specificJob);
        (specificJob as any).viewer_is_co_operator = viewerIsCoOperator(specificJob);
      }

      // Fetch operator profile data for autofilling forms
      let operatorProfile = null;
      let assignedOperatorProfile = null;

      // Get current user's profile
      const { data: currentUserProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, phone_number, email')
        .eq('id', user.id)
        .single();

      operatorProfile = currentUserProfile;

      // Get assigned operator's profile (for the employees list)
      if (specificJob.assigned_to) {
        const { data: assignedProfile } = await supabaseAdmin
          .from('profiles')
          .select('full_name, phone_number, email')
          .eq('id', specificJob.assigned_to)
          .single();

        assignedOperatorProfile = assignedProfile;
      }

      // Operators/helpers must not see office-only money & estimate fields.
      const safeSpecificJob = isAdmin ? specificJob : stripOfficeOnly(specificJob);

      console.log('Returning specific job:', specificJob.job_number);
      return NextResponse.json(
        {
          success: true,
          data: [safeSpecificJob],
          user_role: userRole,
          operator_profile: operatorProfile,
          assigned_operator_profile: assignedOperatorProfile
        },
        { status: 200 }
      );
    }

    // Build query from active_job_orders view
    let query = supabaseAdmin
      .from('active_job_orders')
      .select('*');

    // Scope to tenant (super_admin with null tenantId intentionally sees all tenants)
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    // If not admin, scope to jobs the user is operator OR helper on
    if (!isAdmin) {
      if (includeHelperJobs) {
        // assigned_to = uid OR helper_assigned_to = uid OR crewed on the job
        // OR mapped by the per-day ledger (today-forward / requested date)
        const ors = [`assigned_to.eq.${user.id}`, `helper_assigned_to.eq.${user.id}`];
        if (crewJobIds.length) ors.push(`id.in.(${crewJobIds.join(',')})`);
        if (jdaUserJobIds.length) ors.push(`id.in.(${jdaUserJobIds.join(',')})`);
        query = query.or(ors.join(','));
      } else {
        // Even without helper jobs, the per-day ledger can make this user the
        // operator of a day they aren't assigned_to on yet (day-2 operator).
        const ors = [`assigned_to.eq.${user.id}`];
        if (jdaUserJobIds.length) ors.push(`id.in.(${jdaUserJobIds.join(',')})`);
        query = query.or(ors.join(','));
      }
      // Operators only see DISPATCHED tickets — no peeking at tomorrow's work
      // until it's dispatched (founder). BUT always show a job that is actively
      // in the field (in_progress/on_hold/on_site/pending_completion) even if
      // some path left dispatched_at null — so a same-day or continuing/unfinished
      // job an operator is working can never be hidden from them.
      query = query.or('dispatched_at.not.is.null,status.in.(in_progress,on_hold,on_site,pending_completion)');
    }

    // Filter by scheduled_date if provided
    if (scheduledDate) {
      query = query.eq('scheduled_date', scheduledDate);
    }

    // Date range filters (used by 7-day lookahead on my-jobs)
    if (dateFrom) {
      query = query.gte('scheduled_date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('scheduled_date', dateTo);
    }

    query = query.order('scheduled_date', { ascending: true });

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Exclude completed jobs unless explicitly requested
    if (!includeCompleted) {
      query = query.neq('status', 'completed');
    }

    const { data: jobOrders, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching job orders:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch job orders' },
        { status: 500 }
      );
    }

    // ── Per-day ledger filtering (non-admin) ──────────────────────────────
    // VISIBILITY MATRIX (my-jobs is a WORK QUEUE, not a history view):
    //   Date-scoped query (scheduled_date=D):
    //     • ledger row for (job, D) exists → show only if it names THIS user
    //       (operator_id OR helper_id) or the user is job_crew.
    //     • no ledger row → base slots apply (assigned_to / helper slot / crew).
    //   Non-date query (status lists, lookahead ranges):
    //     • user in a slot other than assigned_to (helper/crew) → keep.
    //     • user in ANY today-forward ledger row for the job → keep.
    //     • user is assigned_to: keep UNLESS every remaining day (today →
    //       end of span) has a ledger row naming someone else — the
    //       "old-operator ghost": they were fully reassigned going forward,
    //       so the job leaves their queue. Days without a ledger row still
    //       belong to assigned_to, so one uncovered day keeps it visible.
    //     • jobs whose span is entirely in the past keep base-slot rules
    //       (unfinished past tickets must stay visible for late completion).
    let filteredOrders = jobOrders || [];
    if (!isAdmin && scheduledDate && filteredOrders.length > 0) {
      const jobIds = filteredOrders.map((j: any) => j.id);
      const { data: dailyAssignments } = await supabaseAdmin
        .from('job_daily_assignments')
        .select('job_order_id, operator_id, helper_id, day_sequence')
        .eq('assignment_date', scheduledDate)
        .in('job_order_id', jobIds);

      if (dailyAssignments && dailyAssignments.length > 0) {
        const dailyMap = new Map(dailyAssignments.map((a: any) => [a.job_order_id, a]));
        filteredOrders = filteredOrders.filter((j: any) => {
          const dayRow = dailyMap.get(j.id);
          // If no daily override exists, fall through (base assignment applies)
          if (dayRow === undefined) return true;
          // A crew helper stays on the job regardless of the operator daily override.
          if (crewJobIds.includes(j.id)) return true;
          // Daily override exists — show only if it names THIS user (either seat)
          return dayRow.operator_id === user.id || dayRow.helper_id === user.id;
        });
        // Attach the day's sequence so the client can render 1st/2nd badges
        // and lock job #2 until job #1 is done (sequencing, Aug 2026).
        for (const j of filteredOrders) {
          const dayRow = dailyMap.get(j.id);
          if (dayRow) (j as any).day_sequence = dayRow.day_sequence ?? 1;
        }
      }
    }

    // Old-operator ghost filter for status/range queries (no scheduled_date).
    if (!isAdmin && !scheduledDate && filteredOrders.length > 0) {
      try {
        const candidateIds = filteredOrders
          .filter(
            (j: any) =>
              j.assigned_to === user.id &&
              j.helper_assigned_to !== user.id &&
              !crewJobIds.includes(j.id) &&
              !jdaUserJobIdSet.has(j.id)
          )
          .map((j: any) => j.id);

        if (candidateIds.length > 0) {
          const { data: futureRows } = await supabaseAdmin
            .from('job_daily_assignments')
            .select('job_order_id, assignment_date, operator_id, helper_id')
            .gte('assignment_date', tenantToday)
            .in('job_order_id', candidateIds);

          const rowsByJob = new Map<string, Map<string, { operator_id: string | null; helper_id: string | null }>>();
          for (const r of futureRows || []) {
            const m = rowsByJob.get(r.job_order_id) || new Map();
            m.set(r.assignment_date, { operator_id: r.operator_id ?? null, helper_id: r.helper_id ?? null });
            rowsByJob.set(r.job_order_id, m);
          }

          filteredOrders = filteredOrders.filter((j: any) => {
            if (!candidateIds.includes(j.id)) return true;
            const jobRows = rowsByJob.get(j.id);
            if (!jobRows || jobRows.size === 0) return true; // no overrides → theirs
            // Remaining days of the job's span, today forward.
            const spanEnd = j.end_date || j.scheduled_date;
            if (!j.scheduled_date || !spanEnd || spanEnd < tenantToday) return true; // fully past → keep
            const start = j.scheduled_date > tenantToday ? j.scheduled_date : tenantToday;
            const remaining: string[] = [];
            const cur = new Date(start + 'T00:00:00');
            const end = new Date(spanEnd + 'T00:00:00');
            while (cur <= end) {
              remaining.push(
                `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
              );
              cur.setDate(cur.getDate() + 1);
            }
            if (remaining.length === 0) return true;
            // Ghost only when EVERY remaining day is ledgered to someone else.
            return !remaining.every((d) => {
              const row = jobRows.get(d);
              return row !== undefined && row.operator_id !== user.id && row.helper_id !== user.id;
            });
          });
        }
      } catch { /* best-effort — never hide work on an unexpected error */ }
    }

    // Annotate helper-view flag per job so the client shows the light view for
    // crew members (not just the helper_assigned_to slot). viewer_is_daily
    // marks rows the user sees via the per-day ledger only (day-2 operator) —
    // the my-jobs client keeps those instead of re-filtering them out.
    if (!isAdmin) {
      for (const j of filteredOrders) {
        (j as any).viewer_is_helper = viewerIsHelper(j);
        (j as any).viewer_is_co_operator = viewerIsCoOperator(j);
        if (jdaUserJobIdSet.has(j.id)) (j as any).viewer_is_daily = true;
      }
    }

    // Operators/helpers must not see office-only money & estimate fields
    // (founder: cost/quote/hours are for the office only). Strip them entirely.
    const safeOrders = isAdmin
      ? filteredOrders
      : filteredOrders.map(stripOfficeOnly);

    return NextResponse.json(
      {
        success: true,
        data: safeOrders,
        user_role: userRole,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in job orders route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
