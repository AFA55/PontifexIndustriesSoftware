/**
 * API Route: GET /api/admin/dashboard-summary
 * Main data feed for the admin dashboard KPI row, schedule view, and team status.
 * All queries are tenant-scoped. Each section catches independently so partial
 * data is always returned even if one query fails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ─── helpers ────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function monthStartISO(offset = 0): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1).toISOString();
}

function monthEndISO(offset = 0): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset + 1, 0, 23, 59, 59).toISOString();
}

// ─── section fetchers ────────────────────────────────────────────────────────

async function getJobsToday(tenantId: string) {
  try {
    const today = todayISO();

    const { data: jobs, error } = await supabaseAdmin
      .from('job_orders')
      .select(`
        id,
        job_number,
        arrival_time,
        customer_name,
        assigned_to,
        status
      `)
      .eq('tenant_id', tenantId)
      .eq('scheduled_date', today)
      .is('deleted_at', null)
      .order('arrival_time', { ascending: true })
      .limit(20);

    if (error) {
      console.error('[dashboard-summary] jobs_today query error:', error.message);
      return { count: 0, jobs: [] };
    }

    // Collect unique operator ids and fetch names in one round-trip
    const operatorIds = [...new Set((jobs ?? []).map((j) => j.assigned_to).filter(Boolean))];

    let operatorMap: Record<string, string> = {};
    if (operatorIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', operatorIds);

      if (profiles) {
        for (const p of profiles) {
          operatorMap[p.id] = p.full_name;
        }
      }
    }

    const mapped = (jobs ?? []).map((j) => ({
      id: j.id,
      job_number: j.job_number,
      scheduled_time: j.arrival_time ?? null,
      customer_name: j.customer_name,
      operator_name: j.assigned_to ? (operatorMap[j.assigned_to] ?? null) : null,
      status: j.status,
    }));

    return { count: mapped.length, jobs: mapped };
  } catch (err: any) {
    console.error('[dashboard-summary] jobs_today unexpected error:', err?.message);
    return { count: 0, jobs: [] };
  }
}

async function getRevenueMtd(tenantId: string) {
  try {
    // Current month: sum total_amount from paid/sent invoices
    const [currentRes, lastRes] = await Promise.all([
      supabaseAdmin
        .from('invoices')
        .select('total_amount')
        .eq('tenant_id', tenantId)
        .in('status', ['paid', 'sent', 'partial'])
        .gte('invoice_date', monthStartISO(0).split('T')[0])
        .lte('invoice_date', monthEndISO(0).split('T')[0]),

      supabaseAdmin
        .from('invoices')
        .select('total_amount')
        .eq('tenant_id', tenantId)
        .in('status', ['paid', 'sent', 'partial'])
        .gte('invoice_date', monthStartISO(-1).split('T')[0])
        .lte('invoice_date', monthEndISO(-1).split('T')[0]),
    ]);

    const sum = (rows: { total_amount: number }[] | null) =>
      (rows ?? []).reduce((acc, r) => acc + Number(r.total_amount ?? 0), 0);

    const current = sum(currentRes.data);
    const last = sum(lastRes.data);
    const trend_pct = last === 0 ? 0 : Math.round(((current - last) / last) * 100 * 10) / 10;

    return { total: current, last_month: last, trend_pct };
  } catch (err: any) {
    console.error('[dashboard-summary] revenue_mtd error:', err?.message);
    return { total: 0, last_month: 0, trend_pct: 0 };
  }
}

async function getOpenItems(tenantId: string) {
  try {
    const today = todayISO();

    const [
      pendingTimecardsRes,
      unassignedJobsRes,
      overdueInvoicesRes,
    ] = await Promise.all([
      // Timecards awaiting approval (approval_status = 'pending')
      supabaseAdmin
        .from('timecards')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('approval_status', 'pending'),

      // Scheduled jobs with no operator assigned
      supabaseAdmin
        .from('job_orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('assigned_to', null)
        .eq('status', 'scheduled')
        .is('deleted_at', null),

      // Invoices past due date and not yet paid
      supabaseAdmin
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .lt('due_date', today)
        .not('status', 'in', '("paid","void","cancelled")'),
    ]);

    return {
      pending_timecards: pendingTimecardsRes.count ?? 0,
      unassigned_jobs: unassignedJobsRes.count ?? 0,
      overdue_invoices: overdueInvoicesRes.count ?? 0,
      unsigned_estimates: 0, // TODO: implement when estimates table exists
    };
  } catch (err: any) {
    console.error('[dashboard-summary] open_items error:', err?.message);
    return {
      pending_timecards: 0,
      unassigned_jobs: 0,
      overdue_invoices: 0,
      unsigned_estimates: 0,
    };
  }
}

async function getCrewUtilization(tenantId: string) {
  try {
    // Total operators/apprentices in this tenant
    const { count: total } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('role', ['operator', 'apprentice'])
      .eq('active', true);

    // Operators currently clocked in (no clock_out_time)
    const { count: clockedIn } = await supabaseAdmin
      .from('timecards')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('date', todayISO())
      .is('clock_out_time', null);

    // Also check any jobs in_progress today as a cross-reference floor
    const { count: inProgressJobs } = await supabaseAdmin
      .from('job_orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'in_progress')
      .eq('scheduled_date', todayISO())
      .is('deleted_at', null);

    const totalCount = total ?? 0;
    // Active = the higher of clocked-in timecards or in-progress jobs (avoids undercounting)
    const activeCount = Math.max(clockedIn ?? 0, inProgressJobs ?? 0);
    const pct = totalCount === 0 ? 0 : Math.round((activeCount / totalCount) * 100);

    return { active: activeCount, total: totalCount, pct };
  } catch (err: any) {
    console.error('[dashboard-summary] crew_utilization error:', err?.message);
    return { active: 0, total: 0, pct: 0 };
  }
}

async function getTeamStatus(tenantId: string) {
  try {
    const today = todayISO();

    // All operators/apprentices for this tenant
    const { data: crew, error: crewError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role')
      .eq('tenant_id', tenantId)
      .in('role', ['operator', 'apprentice'])
      .eq('active', true)
      .order('full_name', { ascending: true });

    if (crewError || !crew) {
      console.error('[dashboard-summary] team_status profiles error:', crewError?.message);
      return [];
    }

    if (crew.length === 0) return [];

    const crewIds = crew.map((c) => c.id);

    // Active timecards today (no clock_out = still working)
    const { data: activeTcs } = await supabaseAdmin
      .from('timecards')
      .select('user_id, job_order_id')
      .eq('tenant_id', tenantId)
      .eq('date', today)
      .is('clock_out_time', null)
      .in('user_id', crewIds);

    // Build map: operatorId -> job_order_id (if on a job)
    const activeMap: Record<string, string | null> = {};
    for (const tc of activeTcs ?? []) {
      activeMap[tc.user_id] = tc.job_order_id ?? null;
    }

    // Collect job ids to resolve job numbers
    const activeJobIds = [...new Set(Object.values(activeMap).filter(Boolean))] as string[];
    let jobNumberMap: Record<string, string> = {};

    if (activeJobIds.length > 0) {
      const { data: jobRows } = await supabaseAdmin
        .from('job_orders')
        .select('id, job_number')
        .in('id', activeJobIds);

      if (jobRows) {
        for (const j of jobRows) {
          jobNumberMap[j.id] = j.job_number;
        }
      }
    }

    // Time off today: fetch operator_time_off records that cover today
    const { data: timeOffRows } = await supabaseAdmin
      .from('operator_time_off')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .lte('start_date', today)
      .gte('end_date', today)
      .in('user_id', crewIds);

    const offSet = new Set((timeOffRows ?? []).map((r) => r.user_id));

    return crew.map((member) => {
      const isOff = offSet.has(member.id);
      const jobId = activeMap[member.id];
      const isActive = !isOff && member.id in activeMap;

      return {
        id: member.id,
        name: member.full_name,
        status: isOff ? 'off' : isActive ? 'active' : 'idle',
        current_job: jobId ? (jobNumberMap[jobId] ?? null) : null,
        current_job_id: jobId ?? null,
      };
    });
  } catch (err: any) {
    console.error('[dashboard-summary] team_status error:', err?.message);
    return [];
  }
}

async function getRecentActivity(tenantId: string) {
  try {
    // Pull from audit_logs — richest recent-activity source in this codebase
    const { data: logs, error } = await supabaseAdmin
      .from('audit_logs')
      .select('id, action, resource_type, resource_id, details, created_at')
      .eq('tenant_id', tenantId)
      .in('action', [
        'job_completed',
        'invoice_paid',
        'invoice_created',
        'job_created',
        'job_updated',
        'timecard_approved',
        'timecard_submitted',
      ])
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !logs) {
      // Fallback: use recent job_orders completions + creations
      const { data: recentJobs } = await supabaseAdmin
        .from('job_orders')
        .select('id, job_number, customer_name, status, work_completed_at, created_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(10);

      return (recentJobs ?? []).map((j) => ({
        id: j.id,
        type: j.status === 'completed' ? 'job_completed' : 'job_created',
        description:
          j.status === 'completed'
            ? `Job ${j.job_number} completed for ${j.customer_name}`
            : `Job ${j.job_number} created for ${j.customer_name}`,
        created_at: (j.work_completed_at ?? j.created_at) as string,
        link: `/admin/job-orders/${j.id}`,
      }));
    }

    return logs.map((log) => {
      const details = (log.details ?? {}) as Record<string, any>;

      // Build human-readable description from action type
      let description = '';
      let link: string | null = null;

      switch (log.action) {
        case 'job_completed':
          description = `Job ${details.job_number ?? log.resource_id} completed`;
          if (log.resource_id) link = `/admin/job-orders/${log.resource_id}`;
          break;
        case 'invoice_paid':
          description = `Invoice ${details.invoice_number ?? log.resource_id} marked as paid`;
          if (log.resource_id) link = `/admin/invoices/${log.resource_id}`;
          break;
        case 'invoice_created':
          description = `Invoice ${details.invoice_number ?? log.resource_id} created`;
          if (log.resource_id) link = `/admin/invoices/${log.resource_id}`;
          break;
        case 'job_created':
          description = `Job ${details.job_number ?? log.resource_id} created`;
          if (log.resource_id) link = `/admin/job-orders/${log.resource_id}`;
          break;
        case 'job_updated':
          description = `Job ${details.job_number ?? log.resource_id} updated`;
          if (log.resource_id) link = `/admin/job-orders/${log.resource_id}`;
          break;
        case 'timecard_approved':
          description = `Timecard for ${details.operator_name ?? 'operator'} approved`;
          if (log.resource_id) link = `/admin/timecards/${log.resource_id}`;
          break;
        case 'timecard_submitted':
          description = `Timecard submitted by ${details.operator_name ?? 'operator'}`;
          if (log.resource_id) link = `/admin/timecards/${log.resource_id}`;
          break;
        default:
          description = `${log.resource_type} ${log.action}`;
          break;
      }

      return {
        id: log.id,
        type: log.action,
        description,
        created_at: log.created_at as string,
        link,
      };
    });
  } catch (err: any) {
    console.error('[dashboard-summary] recent_activity error:', err?.message);
    return [];
  }
}

// ─── route handler ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return auth.response;
  }

  const { tenantId } = auth;

  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant context required.' }, { status: 403 });
  }

  // Run all independent sections in parallel for speed
  const [jobs_today, revenue_mtd, open_items, crew_utilization, team_status, recent_activity] =
    await Promise.all([
      getJobsToday(tenantId),
      getRevenueMtd(tenantId),
      getOpenItems(tenantId),
      getCrewUtilization(tenantId),
      getTeamStatus(tenantId),
      getRecentActivity(tenantId),
    ]);

  return NextResponse.json({
    success: true,
    data: {
      jobs_today,
      revenue_mtd,
      open_items,
      crew_utilization,
      team_status,
      recent_activity,
    },
  });
}
