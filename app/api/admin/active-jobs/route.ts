export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireSalesStaff } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Roles that see ALL active jobs in their tenant. Everyone else (salesman,
// supervisor, ...) is forced to a created_by=self filter on the server.
const FULL_ADMIN_ROLES = ['super_admin', 'operations_manager', 'admin'] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const isFullAdmin = (FULL_ADMIN_ROLES as readonly string[]).includes(auth.role);
    const mineFlag = request.nextUrl.searchParams.get('mine') === 'true';
    // Non-admins are ALWAYS scoped to their own jobs regardless of the `mine`
    // query flag — the server is the source of truth, not the client.
    // Full admins can opt in to a "my jobs only" view via `?mine=true`.
    const shouldScope = !isFullAdmin || mineFlag;

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
        created_by,
        priority
      `)
      .eq('tenant_id', auth.tenantId)
      .not('status', 'in', '("completed","cancelled","archived")')
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

    // Fetch operator names
    const operatorIds = [...new Set(jobs.map((j: any) => j.assigned_to).filter(Boolean))];
    const creatorIds = [...new Set(jobs.map((j: any) => j.created_by).filter(Boolean))];
    const allProfileIds = [...new Set([...operatorIds, ...creatorIds])];

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

    const result = jobs.map((j: any) => ({
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
      created_by_name: j.created_by ? (profileMap[j.created_by] ?? null) : null,
      pending_change_requests: changeRequestCounts[j.id] || 0,
      pending_completion_approval: completionPendingSet.has(j.id),
      operator_notes_count: notesCounts[j.id] || 0,
    }));

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
