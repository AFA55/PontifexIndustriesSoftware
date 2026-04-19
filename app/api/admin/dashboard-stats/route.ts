export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/dashboard-stats
 * Returns analytics data for the admin dashboard widgets.
 * Each key matches a widget's dataKey in WidgetRegistry.
 * Role-filtered: super_admin/ops_manager get everything,
 * admin gets a subset, salesman gets own data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, isTableNotFoundError } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('timeRange') || searchParams.get('range') || 'monthly';

    const today = new Date().toISOString().split('T')[0];
    const userRole = auth.role;
    const userId = auth.userId;

    // Calculate date range boundaries
    const now = new Date();
    let rangeStart: string;
    switch (range) {
      case 'daily':
        rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        break;
      case 'weekly':
        rangeStart = new Date(now.getTime() - 7 * 86400000).toISOString();
        break;
      case 'monthly':
      default:
        rangeStart = new Date(now.getTime() - 30 * 86400000).toISOString();
        break;
    }

    // ================================================================
    // Build all queries in parallel based on role
    // Keys MUST match WidgetRegistry dataKey values
    // ================================================================
    const widgetData: Record<string, any> = {};
    const queries: Promise<void>[] = [];

    const isFinanceRole = ['super_admin', 'operations_manager', 'admin'].includes(userRole);
    const isOpsRole = ['super_admin', 'operations_manager'].includes(userRole);
    const isSalesman = userRole === 'salesman';
    const isSuperAdmin = userRole === 'super_admin';
    const tenantId = auth.tenantId;

    // Helper: apply tenant filter unless super_admin (who sees all tenants intentionally)
    const withTenant = (query: any) =>
      isSuperAdmin ? query : query.eq('tenant_id', tenantId);

    // ─── REVENUE widget (dataKey: 'revenue') ─────────────────
    if (isFinanceRole) {
      queries.push((async () => {
        const [paidRes, outstandingRes] = await Promise.all([
          withTenant(supabaseAdmin.from('invoices').select('total_amount')).eq('status', 'paid'),
          withTenant(supabaseAdmin.from('invoices').select('balance_due')).in('status', ['sent', 'overdue']),
        ]);

        const totalRevenue = (paidRes.data || []).reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
        const outstanding = (outstandingRes.data || []).reduce((s: number, i: any) => s + Number(i.balance_due || 0), 0);

        // Revenue trend (12 months)
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
        const { data: paidInvoices } = await withTenant(supabaseAdmin
          .from('invoices')
          .select('total_amount, paid_date'))
          .eq('status', 'paid')
          .gte('paid_date', twelveMonthsAgo.toISOString().split('T')[0]);

        const monthly: Record<string, number> = {};
        for (const inv of paidInvoices || []) {
          if (!inv.paid_date) continue;
          const m = inv.paid_date.substring(0, 7);
          monthly[m] = (monthly[m] || 0) + Number(inv.total_amount || 0);
        }

        const currentMonth = now.toISOString().substring(0, 7);
        const paidThisPeriod = monthly[currentMonth] || 0;

        widgetData.revenue = {
          total_revenue: totalRevenue,
          outstanding,
          paid_this_period: paidThisPeriod,
          revenue_trend: Object.entries(monthly)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, revenue]) => ({ month, revenue })),
        };
      })());
    }

    // ─── FINANCIAL widget (dataKey: 'financial') — monthly revenue bars
    if (isFinanceRole) {
      queries.push((async () => {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const { data } = await withTenant(supabaseAdmin
          .from('invoices')
          .select('total_amount, paid_date'))
          .eq('status', 'paid')
          .gte('paid_date', sixMonthsAgo.toISOString().split('T')[0]);

        const monthly: Record<string, number> = {};
        for (const inv of data || []) {
          if (!inv.paid_date) continue;
          const m = inv.paid_date.substring(0, 7);
          monthly[m] = (monthly[m] || 0) + Number(inv.total_amount || 0);
        }

        widgetData.financial = {
          monthly_revenue: Object.entries(monthly)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, revenue]) => ({ month, revenue })),
        };
      })());
    }

    // ─── INVOICES widget (dataKey: 'invoices') ────────────────
    if (isFinanceRole) {
      queries.push((async () => {
        const { data } = await withTenant(supabaseAdmin
          .from('invoices')
          .select('status, total_amount, balance_due'));

        const statusMap: Record<string, number> = {};
        let totalOutstanding = 0;
        let totalPaid = 0;

        for (const inv of data || []) {
          statusMap[inv.status] = (statusMap[inv.status] || 0) + 1;
          if (['sent', 'overdue'].includes(inv.status)) totalOutstanding += Number(inv.balance_due || 0);
          if (inv.status === 'paid') totalPaid += Number(inv.total_amount || 0);
        }

        widgetData.invoices = {
          statuses: Object.entries(statusMap).map(([status, count]) => ({ status, count })),
          total_outstanding: totalOutstanding,
          total_paid: totalPaid,
        };
      })());
    }

    // ─── JOB_STATUS widget (dataKey: 'job_status') ────────────
    if (!isSalesman) {
      queries.push((async () => {
        const { data: allJobs } = await withTenant(supabaseAdmin
          .from('job_orders')
          .select('status'));

        const byStatus: Record<string, number> = {};
        for (const j of allJobs || []) {
          byStatus[j.status] = (byStatus[j.status] || 0) + 1;
        }

        widgetData.job_status = {
          statuses: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
          total: (allJobs || []).length,
        };
      })());
    }

    // ─── SCHEDULE widget (dataKey: 'schedule') ────────────────
    queries.push((async () => {
      const query = withTenant(supabaseAdmin
        .from('job_orders')
        .select('id, job_number, customer_name, address, status, scheduled_time, assigned_to, profiles!job_orders_assigned_to_fkey(full_name)'))
        .eq('scheduled_date', today)
        .order('scheduled_time', { ascending: true })
        .limit(15);

      const { data, error } = await query;

      widgetData.schedule = {
        todays_jobs: (data || []).map((j: any) => ({
          id: j.id,
          job_number: j.job_number,
          customer: j.customer_name || 'Unknown',
          location: j.address || '',
          status: j.status,
          time: j.scheduled_time || '',
          operator: j.profiles?.full_name || 'Unassigned',
        })),
      };
    })());

    // ─── CREWS widget (dataKey: 'crews') ──────────────────────
    if (!isSalesman) {
      queries.push((async () => {
        const { data: operators } = await withTenant(supabaseAdmin
          .from('profiles')
          .select('id, active'))
          .in('role', ['operator', 'apprentice']);

        const totalActive = (operators || []).filter((o: any) => o.active).length;

        // Count operators by current job status
        const { data: activeJobs } = await withTenant(supabaseAdmin
          .from('job_orders')
          .select('status, assigned_to'))
          .eq('scheduled_date', today)
          .not('assigned_to', 'is', null)
          .in('status', ['in_route', 'on_site', 'in_progress', 'dispatched']);

        let enRoute = 0, onSite = 0, clockedIn = 0;
        const uniqueOperators = new Set<string>();
        for (const j of activeJobs || []) {
          uniqueOperators.add(j.assigned_to);
          if (j.status === 'in_route') enRoute++;
          else if (['on_site', 'in_progress'].includes(j.status)) onSite++;
          else if (j.status === 'dispatched') clockedIn++;
        }

        widgetData.crews = {
          total_active: totalActive,
          clocked_in: clockedIn + enRoute + onSite,
          en_route: enRoute,
          on_site: onSite,
        };
      })());
    }

    // ─── COMPLETION widget (dataKey: 'completion') ────────────
    if (!isSalesman) {
      queries.push((async () => {
        const { data } = await withTenant(supabaseAdmin
          .from('job_orders')
          .select('status'))
          .in('status', ['completed', 'cancelled']);

        const completed = (data || []).filter((j: any) => j.status === 'completed').length;
        const cancelled = (data || []).filter((j: any) => j.status === 'cancelled').length;

        widgetData.completion = { completed, cancelled };
      })());
    }

    // ─── OPERATORS widget (dataKey: 'operators') ──────────────
    if (isOpsRole) {
      queries.push((async () => {
        const { data: completedJobs } = await withTenant(supabaseAdmin
          .from('job_orders')
          .select('assigned_to, estimated_cost'))
          .eq('status', 'completed')
          .not('assigned_to', 'is', null);

        const opMap: Record<string, { count: number; revenue: number }> = {};
        for (const j of completedJobs || []) {
          if (!j.assigned_to) continue;
          if (!opMap[j.assigned_to]) opMap[j.assigned_to] = { count: 0, revenue: 0 };
          opMap[j.assigned_to].count++;
          opMap[j.assigned_to].revenue += Number(j.estimated_cost || 0);
        }

        const sorted = Object.entries(opMap).sort(([, a], [, b]) => b.count - a.count).slice(0, 10);
        const operatorIds = sorted.map(([id]) => id);
        const { data: profiles } = operatorIds.length > 0
          ? await withTenant(supabaseAdmin.from('profiles').select('id, full_name, email')).in('id', operatorIds)
          : { data: [] };
        const profileMap = new Map<string, { id: string; full_name: string | null; email: string | null }>((profiles || []).map((p: any) => [p.id, p]));

        widgetData.operators = {
          operators: sorted.map(([id, stats]) => ({
            name: profileMap.get(id)?.full_name || profileMap.get(id)?.email || 'Unknown',
            jobs_completed: stats.count,
            revenue: stats.revenue,
          })),
        };
      })());
    }

    // ─── CUSTOMERS widget (dataKey: 'customers') ──────────────
    if (isOpsRole) {
      queries.push((async () => {
        const { data } = await withTenant(supabaseAdmin
          .from('job_orders')
          .select('customer_name, estimated_cost'));

        const custMap: Record<string, number> = {};
        for (const j of data || []) {
          const name = j.customer_name || 'Unknown';
          custMap[name] = (custMap[name] || 0) + Number(j.estimated_cost || 0);
        }

        widgetData.customers = {
          top_customers: Object.entries(custMap)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([name, revenue]) => ({ name, revenue })),
        };
      })());
    }

    // ─── ACTIVITY widget (dataKey: 'activity') ────────────────
    if (isOpsRole) {
      queries.push((async () => {
        const { data, error } = await withTenant(supabaseAdmin
          .from('audit_logs')
          .select('action, entity_type, details, created_at'))
          .order('created_at', { ascending: false })
          .limit(15);

        if (error && isTableNotFoundError(error)) {
          widgetData.activity = { events: [] };
          return;
        }

        widgetData.activity = {
          events: (data || []).map((log: any) => ({
            type: log.action?.includes('complet') ? 'job_completed' :
                  log.action?.includes('creat') ? 'job_created' :
                  log.action?.includes('login') ? 'user_login' : 'default',
            description: `${log.action || 'Activity'} on ${log.entity_type || 'system'}`,
            timestamp: log.created_at,
          })),
        };
      })());
    }

    // ─── HEALTH widget (dataKey: 'health') ────────────────────
    if (userRole === 'super_admin') {
      queries.push((async () => {
        const checks: Record<string, { status: string; latency: number }> = {};

        // Database check
        const dbStart = Date.now();
        try {
          await supabaseAdmin.from('profiles').select('id').limit(1);
          checks.database = { status: 'healthy', latency: Date.now() - dbStart };
        } catch {
          checks.database = { status: 'down', latency: Date.now() - dbStart };
        }

        // Auth check
        const authStart = Date.now();
        try {
          await supabaseAdmin.auth.admin.listUsers({ perPage: 1 });
          checks.auth = { status: 'healthy', latency: Date.now() - authStart };
        } catch {
          checks.auth = { status: 'degraded', latency: Date.now() - authStart };
        }

        // Storage check
        const storageStart = Date.now();
        try {
          await supabaseAdmin.storage.listBuckets();
          checks.storage = { status: 'healthy', latency: Date.now() - storageStart };
        } catch {
          checks.storage = { status: 'degraded', latency: Date.now() - storageStart };
        }

        widgetData.health = { services: checks };
      })());
    }

    // ─── KPI row data ─────────────────────────────────────────
    queries.push((async () => {
      const [jobsRes, invoicesRes, operatorsRes] = await Promise.all([
        withTenant(supabaseAdmin.from('job_orders').select('status, scheduled_date')),
        isFinanceRole
          ? withTenant(supabaseAdmin.from('invoices').select('total_amount, status'))
          : Promise.resolve({ data: [] }),
        withTenant(supabaseAdmin.from('profiles').select('id, active')).in('role', ['operator', 'apprentice']),
      ]);

      const jobs = jobsRes.data || [];
      const invoices = (invoicesRes as any).data || [];
      const operators = operatorsRes.data || [];

      const activeJobs = jobs.filter((j: any) => !['completed', 'cancelled', 'void'].includes(j.status)).length;
      const todayJobs = jobs.filter((j: any) => j.scheduled_date === today).length;
      const completed = jobs.filter((j: any) => j.status === 'completed').length;
      const totalForRate = jobs.filter((j: any) => ['completed', 'cancelled'].includes(j.status)).length;
      const completionRate = totalForRate > 0 ? Math.round((completed / totalForRate) * 100) : 0;
      const totalRevenue = invoices.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
      const activeCrews = operators.filter((o: any) => o.active).length;

      widgetData.kpi = {
        total_revenue: totalRevenue,
        active_jobs: activeJobs,
        today_jobs: todayJobs,
        completion_rate: completionRate,
        active_crews: activeCrews,
      };
    })());

    // ─── SALESMAN: commission widget (dataKey: 'commission') ──
    if (isSalesman) {
      queries.push((async () => {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('commission_rate')
          .eq('id', userId)
          .eq('tenant_id', tenantId)
          .single();

        const commissionRate = Number(profile?.commission_rate || 0);

        const { data: completedJobs } = await withTenant(supabaseAdmin
          .from('job_orders')
          .select('estimated_cost, completed_at, created_at'))
          .eq('created_by', userId)
          .eq('status', 'completed');

        const monthly: Record<string, { revenue: number; commission: number }> = {};
        let allTimeCommission = 0;
        let thisMonthCommission = 0;
        let thisQuarterCommission = 0;
        const currentMonth = now.toISOString().substring(0, 7);
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().substring(0, 7);

        for (const j of completedJobs || []) {
          const dateStr = j.completed_at || j.created_at;
          if (!dateStr) continue;
          const m = dateStr.substring(0, 7);
          const cost = Number(j.estimated_cost || 0);
          const comm = cost * commissionRate;

          if (!monthly[m]) monthly[m] = { revenue: 0, commission: 0 };
          monthly[m].revenue += cost;
          monthly[m].commission += comm;
          allTimeCommission += comm;
          if (m === currentMonth) thisMonthCommission += comm;
          if (m >= quarterStart) thisQuarterCommission += comm;
        }

        widgetData.commission = {
          commission_rate: commissionRate,
          earned_this_month: thisMonthCommission,
          earned_this_quarter: thisQuarterCommission,
          earned_all_time: allTimeCommission,
          monthly_commission: Object.entries(monthly)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, d]) => ({ month, commission: d.commission })),
        };
      })());
    }

    // ─── SALESMAN: my_jobs widget (dataKey: 'my_jobs') ────────
    if (isSalesman) {
      queries.push((async () => {
        const { data } = await withTenant(supabaseAdmin
          .from('job_orders')
          .select('id, job_number, customer_name, status, estimated_cost, created_at'))
          .eq('created_by', userId)
          .order('created_at', { ascending: false });

        const jobs = data || [];
        const byStatus: Record<string, number> = {};
        let totalRevenue = 0;
        let pending = 0;

        for (const j of jobs) {
          byStatus[j.status] = (byStatus[j.status] || 0) + 1;
          totalRevenue += Number(j.estimated_cost || 0);
          if (['pending_approval', 'scheduled', 'dispatched'].includes(j.status)) pending++;
        }

        widgetData.my_jobs = {
          total_jobs: jobs.length,
          total_revenue: totalRevenue,
          pending_jobs: pending,
          statuses: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
          recent_jobs: jobs.slice(0, 5).map((j: any) => ({
            job_number: j.job_number,
            customer: j.customer_name || 'Unknown',
            status: j.status,
          })),
        };
      })());
    }

    // ─── SALESMAN: pipeline widget (dataKey: 'pipeline') ──────
    if (isSalesman) {
      queries.push((async () => {
        const { data } = await withTenant(supabaseAdmin
          .from('job_orders')
          .select('status'))
          .eq('created_by', userId);

        const pipeline: Record<string, number> = {};
        for (const j of data || []) {
          pipeline[j.status] = (pipeline[j.status] || 0) + 1;
        }

        widgetData.pipeline = { pipeline };
      })());
    }

    // ─── NOTIFICATIONS widget (dataKey: 'notifications') ──────
    queries.push((async () => {
      const { data, error } = await supabaseAdmin
        .from('schedule_notifications')
        .select('*')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error && isTableNotFoundError(error)) {
        widgetData.notifications = { items: [], unread: 0 };
        return;
      }

      widgetData.notifications = {
        items: data || [],
        unread: (data || []).filter((n: any) => !n.read).length,
      };
    })());

    // ─── CALENDAR widget (dataKey: 'calendar') ──────────────────
    queries.push((async () => {
      const fourteenDays = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const { data } = await withTenant(supabaseAdmin
        .from('job_orders')
        .select('id, job_number, customer_name, status, scheduled_date, scheduled_time'))
        .gte('scheduled_date', thirtyDaysAgo)
        .lte('scheduled_date', fourteenDays)
        .order('scheduled_date');

      const byDate: Record<string, any> = {};
      for (const j of data || []) {
        if (!j.scheduled_date) continue;
        if (!byDate[j.scheduled_date]) byDate[j.scheduled_date] = { count: 0, jobs: [] };
        byDate[j.scheduled_date].count++;
        byDate[j.scheduled_date].jobs.push({
          id: j.id,
          job_number: j.job_number,
          customer: j.customer_name,
          status: j.status,
          time: j.scheduled_time,
        });
      }

      widgetData.calendar = { dates: byDate };
    })());

    // ─── CREW UTILIZATION widget (dataKey: 'crew_utilization') ──
    if (isOpsRole) {
      queries.push((async () => {
        // Count active operators
        const { data: ops } = await withTenant(supabaseAdmin
          .from('profiles')
          .select('id'))
          .eq('active', true)
          .in('role', ['operator', 'apprentice']);
        const totalOperators = ops?.length || 0;
        const availableHours = totalOperators * 8;

        // Count scheduled hours today
        const { data: todayJobs } = await withTenant(supabaseAdmin
          .from('job_orders')
          .select('id, estimated_hours'))
          .eq('scheduled_date', today)
          .not('status', 'in', '("completed","cancelled")');
        const scheduledHours = (todayJobs || []).reduce(
          (sum: number, j: any) => sum + Number(j.estimated_hours || 4), 0
        );
        const utilization = availableHours > 0
          ? Math.round((scheduledHours / availableHours) * 100)
          : 0;

        widgetData.crew_utilization = {
          total_operators: totalOperators,
          available_hours: availableHours,
          scheduled_hours: scheduledHours,
          utilization_pct: utilization,
        };
      })());
    }

    // Execute all queries in parallel
    await Promise.all(queries);

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'dashboard_stats_viewed',
        entity_type: 'dashboard',
        details: { range, role: userRole },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data: widgetData, range, role: userRole });
  } catch (error: any) {
    console.error('Error in dashboard-stats GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
