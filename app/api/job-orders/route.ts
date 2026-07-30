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
    // once so access + list inclusion + helper detection all agree.
    let crewJobIds: string[] = [];
    const crewHelperJobIds = new Set<string>();
    if (!isAdmin) {
      const { data: crewRows } = await supabaseAdmin
        .from('job_crew')
        .select('job_order_id, role')
        .eq('user_id', user.id);
      for (const r of crewRows || []) {
        crewJobIds.push(r.job_order_id);
        if (r.role === 'helper') crewHelperJobIds.add(r.job_order_id);
      }
    }
    // Helper detection for a job the current non-admin user is viewing.
    const viewerIsHelper = (j: any): boolean =>
      !isAdmin && j.assigned_to !== user.id &&
      (j.helper_assigned_to === user.id || crewHelperJobIds.has(j.id));

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

      // Check if user has access to this job (operator OR helper OR crew member)
      if (
        !isAdmin &&
        specificJob.assigned_to !== user.id &&
        specificJob.helper_assigned_to !== user.id &&
        !crewJobIds.includes(specificJob.id)
      ) {
        return NextResponse.json(
          { error: 'Unauthorized to view this job' },
          { status: 403 }
        );
      }
      // Tell the client whether the viewer is a helper on this job (drives the
      // light "Team Member" view vs the full operator flow).
      if (!isAdmin) (specificJob as any).viewer_is_helper = viewerIsHelper(specificJob);

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
        const ors = [`assigned_to.eq.${user.id}`, `helper_assigned_to.eq.${user.id}`];
        if (crewJobIds.length) ors.push(`id.in.(${crewJobIds.join(',')})`);
        query = query.or(ors.join(','));
      } else {
        query = query.eq('assigned_to', user.id);
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

    // For non-admin users viewing a specific date: respect job_daily_assignments.
    // The schedule board can override which operator is on a job for a given day
    // (e.g., reassigning or unassigning a multi-day job). If such an override exists
    // and the current user is NOT the assigned operator for that day, exclude the job
    // so the operator's view stays in sync with what the schedule board shows.
    let filteredOrders = jobOrders || [];
    if (!isAdmin && scheduledDate && filteredOrders.length > 0) {
      const jobIds = filteredOrders.map((j: any) => j.id);
      const { data: dailyAssignments } = await supabaseAdmin
        .from('job_daily_assignments')
        .select('job_order_id, operator_id')
        .eq('assignment_date', scheduledDate)
        .in('job_order_id', jobIds);

      if (dailyAssignments && dailyAssignments.length > 0) {
        const dailyMap = new Map(dailyAssignments.map((a: any) => [a.job_order_id, a.operator_id]));
        filteredOrders = filteredOrders.filter((j: any) => {
          const dailyOperator = dailyMap.get(j.id);
          // If no daily override exists, fall through (base assignment applies)
          if (dailyOperator === undefined) return true;
          // A crew helper stays on the job regardless of the operator daily override.
          if (crewJobIds.includes(j.id)) return true;
          // Daily override exists — only show this job if the override assigns it to THIS user
          return dailyOperator === user.id;
        });
      }
    }

    // Annotate helper-view flag per job so the client shows the light view for
    // crew members (not just the helper_assigned_to slot).
    if (!isAdmin) {
      for (const j of filteredOrders) (j as any).viewer_is_helper = viewerIsHelper(j);
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
