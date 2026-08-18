export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireScheduleViewer } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { todayInTz } from '@/lib/reminder-timing';

// Roles that see ALL active jobs in their tenant. Everyone else (salesman,
// supervisor, ...) is forced to a created_by=self filter on the server.
const FULL_ADMIN_ROLES = ['super_admin', 'operations_manager', 'admin'] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleViewer(request);
    if (!auth.authorized) return auth.response;

    const isFullAdmin = (FULL_ADMIN_ROLES as readonly string[]).includes(auth.role);
    // ACTIVE JOBS WAS EMPTY FOR THE SUPERVISOR (founder, Aug 15 sweep).
    //
    // `created_by` is the right ownership signal for a SALESMAN — they are
    // never assigned to jobs as an operator, so their own pipeline is what they
    // created. It is the wrong signal entirely for a supervisor, whose whole
    // role is overseeing OTHER people's jobs in the field. Measured in prod:
    // David has created 0 jobs, so his Active Jobs card and list both returned
    // zero even on days he was dispatched. The salesmen see rows, which is why
    // it read as "works for sales, broken for the supervisor".
    //
    // lib/rbac.ts already grants supervisor `active_jobs: 'view'` — view means
    // the board, not "mine". This is a GET; nothing here lets him change a job.
    const isFieldOverseer = auth.role === 'supervisor';
    const mineFlag = request.nextUrl.searchParams.get('mine') === 'true';
    // Non-admins are ALWAYS scoped to their own jobs regardless of the `mine`
    // query flag — the server is the source of truth, not the client.
    // Full admins can opt in to a "my jobs only" view via `?mine=true`.
    const shouldScope = (!isFullAdmin && !isFieldOverseer) || mineFlag;

    // Base query for active (non-completed, non-cancelled) jobs
    let query = supabaseAdmin
      .from('job_orders')
      .select(`
        id,
        job_number,
        title,
        status,
        scheduled_date,
        end_date,
        job_type,
        address,
        location,
        customer_name,
        assigned_to,
        helper_assigned_to,
        created_by,
        priority,
        completion_signed_at,
        office_completed_at,
        office_completion_reason
      `)
      .eq('tenant_id', auth.tenantId)
      // Exclude on_hold too — parked jobs live in the Pending Jobs page, not here.
      .not('status', 'in', '("completed","cancelled","archived","pending_approval","on_hold")')
      .order('scheduled_date', { ascending: true });

    if (shouldScope) {
      // Created_by is the only correct ownership signal for sales staff —
      // salesmen are not assigned to jobs as operators.
      query = query.eq('created_by', auth.userId);
    }

    const { data: jobsRaw, error } = await query;
    if (error) {
      console.error('Error fetching active jobs:', error);
      return NextResponse.json({ error: 'Failed to fetch active jobs' }, { status: 500 });
    }

    const jobs = jobsRaw || [];

    if (jobs.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        scope: {
          is_scoped: shouldScope,
          role: auth.role,
          scoped_to_user: shouldScope ? auth.userId : null,
        },
      });
    }

    // Per-day assignment overrides (job_daily_assignments) — multi-day jobs
    // can be reassigned per day; job_orders.assigned_to alone would show the
    // day-1 operator forever. Resolve TODAY's operator (tenant-local date).
    const jobIdsForJda = jobs.map((j: any) => j.id);
    let tenantTz = 'America/New_York';
    try {
      const { data: tzRow } = await supabaseAdmin
        .from('tenants')
        .select('timezone')
        .eq('id', auth.tenantId)
        .maybeSingle();
      if (tzRow?.timezone) tenantTz = tzRow.timezone;
    } catch { /* default tz */ }
    const todayLocal = todayInTz(tenantTz);
    const todaysOperatorByJob = new Map<string, { id: string | null; name: string | null }>();
    try {
      // Tenant scoping comes from jobIdsForJda (the main query is already
      // tenant-filtered) — don't assume a tenant_id column on JDA.
      const { data: jdaRows } = await supabaseAdmin
        .from('job_daily_assignments')
        .select('job_order_id, operator_id, operator_name')
        .eq('assignment_date', todayLocal)
        .in('job_order_id', jobIdsForJda);
      for (const r of (jdaRows || []) as Array<{ job_order_id: string; operator_id: string | null; operator_name: string | null }>) {
        if (r.operator_id || r.operator_name) {
          todaysOperatorByJob.set(r.job_order_id, { id: r.operator_id, name: r.operator_name });
        }
      }
    } catch { /* table optional — fall back to assigned_to */ }

    // Fetch operator names
    const operatorIds = [...new Set(jobs.map((j: any) => j.assigned_to).filter(Boolean))];
    const jdaOperatorIds = [...new Set(Array.from(todaysOperatorByJob.values()).map((v) => v.id).filter(Boolean))] as string[];
    const helperIds = [...new Set(jobs.map((j: any) => j.helper_assigned_to).filter(Boolean))];
    const creatorIds = [...new Set(jobs.map((j: any) => j.created_by).filter(Boolean))];
    const allProfileIds = [...new Set([...operatorIds, ...jdaOperatorIds, ...helperIds, ...creatorIds])];

    let profileMap: Record<string, string> = {};
    if (allProfileIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', allProfileIds);
      if (profiles) {
        profiles.forEach((p: any) => { profileMap[p.id] = p.full_name; });
      }
    }

    // Fetch pending completion requests
    const jobIds = jobs.map((j: any) => j.id);

    const { data: completionRequests } = await supabaseAdmin
      .from('job_completion_requests')
      .select('job_order_id, status')
      .in('job_order_id', jobIds)
      .eq('status', 'pending');

    const completionPendingSet = new Set((completionRequests || []).map((r: any) => r.job_order_id));

    // Fetch pending schedule change requests
    const { data: changeRequests } = await supabaseAdmin
      .from('schedule_change_requests')
      .select('job_order_id, status')
      .in('job_order_id', jobIds)
      .eq('status', 'pending');

    const changeRequestCounts: Record<string, number> = {};
    (changeRequests || []).forEach((r: any) => {
      changeRequestCounts[r.job_order_id] = (changeRequestCounts[r.job_order_id] || 0) + 1;
    });

    // Fetch operator notes counts (exclude system change_log notes)
    const { data: jobNotes } = await supabaseAdmin
      .from('job_notes')
      .select('job_order_id')
      .in('job_order_id', jobIds)
      .neq('note_type', 'change_log');

    const notesCounts: Record<string, number> = {};
    (jobNotes || []).forEach((n: any) => {
      notesCounts[n.job_order_id] = (notesCounts[n.job_order_id] || 0) + 1;
    });

    const result = jobs.map((j: any) => {
      const jda = todaysOperatorByJob.get(j.id);
      const todaysOperatorName = jda
        ? ((jda.id ? profileMap[jda.id] : null) ?? jda.name ?? null)
        : null;
      return {
      id: j.id,
      job_number: j.job_number,
      title: j.title,
      status: j.status,
      scheduled_date: j.scheduled_date,
      scheduled_end_date: j.end_date,
      job_type: j.job_type,
      customer_name: j.customer_name,
      address: j.address || j.location,
      assigned_operator_name: j.assigned_to ? (profileMap[j.assigned_to] ?? null) : null,
      // Today's per-day override (job_daily_assignments), when present.
      todays_operator_name: todaysOperatorName,
      helper_assigned_name: j.helper_assigned_to ? (profileMap[j.helper_assigned_to] ?? null) : null,
      created_by_name: j.created_by ? (profileMap[j.created_by] ?? null) : null,
      pending_change_requests: changeRequestCounts[j.id] || 0,
      pending_completion_approval: completionPendingSet.has(j.id),
      operator_notes_count: notesCounts[j.id] || 0,
      // Office close-out state. The list draws a "Mark complete (office)"
      // control per card, and it must know whether the OPERATOR already signed
      // the job off — without `completion_signed_at` the button would appear on
      // a properly-closed job, which is a false affordance.
      completion_signed_at: j.completion_signed_at ?? null,
      office_completed_at: j.office_completed_at ?? null,
      office_completion_reason: j.office_completion_reason ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      data: result,
      scope: {
        is_scoped: shouldScope,
        role: auth.role,
        scoped_to_user: shouldScope ? auth.userId : null,
      },
    });
  } catch (err) {
    console.error('Unexpected error in active-jobs GET:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
