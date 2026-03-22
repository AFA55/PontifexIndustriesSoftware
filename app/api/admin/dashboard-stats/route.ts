/**
 * API Route: GET /api/admin/dashboard-stats
 * Returns analytics data for the admin dashboard.
 * Role-filtered: super_admin/ops_manager get everything,
 * admin gets a subset, salesman gets own data, supervisor gets jobs only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, isTableNotFoundError } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || 'daily'; // daily | weekly | monthly
    const dateParam = searchParams.get('date');
    const baseDate = dateParam ? new Date(dateParam) : new Date();

    // Calculate date range boundaries
    let rangeStart: string;
    const rangeEnd = baseDate.toISOString();

    switch (range) {
      case 'weekly':
        rangeStart = new Date(baseDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'monthly':
        rangeStart = new Date(baseDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'daily':
      default:
        rangeStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate()).toISOString();
        break;
    }

    const today = new Date().toISOString().split('T')[0];
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const userRole = auth.role;
    const userId = auth.userId;

    // Build all queries in parallel based on role
    const queries: Record<string, Promise<any>> = {};

    // --- Revenue (admin+) ---
    if (['super_admin', 'operations_manager', 'admin'].includes(userRole)) {
      queries.revenue = (async () => {
        const [paidRes, outstandingRes, statusCountRes] = await Promise.all([
          supabaseAdmin
            .from('invoices')
            .select('total_amount')
            .eq('status', 'paid')
            .gte('paid_date', rangeStart.split('T')[0])
            .lte('paid_date', rangeEnd.split('T')[0]),
          supabaseAdmin
            .from('invoices')
            .select('balance_due, status')
            .in('status', ['sent', 'overdue']),
          supabaseAdmin
            .from('invoices')
            .select('status'),
        ]);

        const paidTotal = (paidRes.data || []).reduce(
          (sum: number, i: any) => sum + Number(i.total_amount || 0), 0
        );
        const outstandingTotal = (outstandingRes.data || []).reduce(
          (sum: number, i: any) => sum + Number(i.balance_due || 0), 0
        );

        // Count by status
        const statusCounts: Record<string, number> = {};
        for (const inv of statusCountRes.data || []) {
          statusCounts[inv.status] = (statusCounts[inv.status] || 0) + 1;
        }

        return { paid_in_range: paidTotal, outstanding: outstandingTotal, by_status: statusCounts };
      })();

      queries.revenue_trend = (async () => {
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

        const { data } = await supabaseAdmin
          .from('invoices')
          .select('total_amount, paid_date')
          .eq('status', 'paid')
          .gte('paid_date', twelveMonthsAgo.toISOString().split('T')[0]);

        // Group by month in JS
        const monthly: Record<string, number> = {};
        for (const inv of data || []) {
          if (!inv.paid_date) continue;
          const month = inv.paid_date.substring(0, 7); // YYYY-MM
          monthly[month] = (monthly[month] || 0) + Number(inv.total_amount || 0);
        }

        return Object.entries(monthly)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, total]) => ({ month, total }));
      })();

      queries.invoice_summary = (async () => {
        const { data } = await supabaseAdmin
          .from('invoices')
          .select('status, total_amount, balance_due');

        const summary: Record<string, { count: number; total: number }> = {};
        for (const inv of data || []) {
          if (!summary[inv.status]) summary[inv.status] = { count: 0, total: 0 };
          summary[inv.status].count++;
          summary[inv.status].total += Number(inv.total_amount || 0);
        }
        return summary;
      })();
    }

    // --- Jobs (all admin roles) ---
    if (['super_admin', 'operations_manager', 'admin', 'supervisor'].includes(userRole)) {
      queries.jobs = (async () => {
        const { data: allJobs } = await supabaseAdmin
          .from('job_orders')
          .select('status, scheduled_date');

        const byStatus: Record<string, number> = {};
        let todayCount = 0;
        let weekCount = 0;

        for (const j of allJobs || []) {
          byStatus[j.status] = (byStatus[j.status] || 0) + 1;
          if (j.scheduled_date === today) todayCount++;
          if (j.scheduled_date && j.scheduled_date >= weekStart && j.scheduled_date <= today) weekCount++;
        }

        return { by_status: byStatus, today: todayCount, this_week: weekCount, total: (allJobs || []).length };
      })();

      queries.jobs_by_type = (async () => {
        const { data } = await supabaseAdmin
          .from('job_orders')
          .select('job_type')
          .gte('created_at', rangeStart)
          .lte('created_at', rangeEnd);

        const byType: Record<string, number> = {};
        for (const j of data || []) {
          const t = j.job_type || 'Unknown';
          byType[t] = (byType[t] || 0) + 1;
        }
        return byType;
      })();

      queries.job_trend = (async () => {
        const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000);

        const { data } = await supabaseAdmin
          .from('job_orders')
          .select('created_at')
          .gte('created_at', twelveWeeksAgo.toISOString());

        // Group by ISO week
        const weekly: Record<string, number> = {};
        for (const j of data || []) {
          const d = new Date(j.created_at);
          // Get Monday of the week
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          const monday = new Date(d.setDate(diff));
          const weekKey = monday.toISOString().split('T')[0];
          weekly[weekKey] = (weekly[weekKey] || 0) + 1;
        }

        return Object.entries(weekly)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([week, count]) => ({ week, count }));
      })();

      queries.completion_rate = (async () => {
        const { data } = await supabaseAdmin
          .from('job_orders')
          .select('status')
          .in('status', ['completed', 'cancelled']);

        const completed = (data || []).filter(j => j.status === 'completed').length;
        const total = (data || []).length;
        return { completed, total, rate: total > 0 ? completed / total : 0 };
      })();
    }

    // --- Top operators & customers (super_admin/ops_manager only) ---
    if (['super_admin', 'operations_manager'].includes(userRole)) {
      queries.top_operators = (async () => {
        const { data: completedJobs } = await supabaseAdmin
          .from('job_orders')
          .select('assigned_to, estimated_cost')
          .eq('status', 'completed')
          .not('assigned_to', 'is', null);

        // Aggregate per operator
        const opMap: Record<string, { count: number; revenue: number }> = {};
        for (const j of completedJobs || []) {
          if (!j.assigned_to) continue;
          if (!opMap[j.assigned_to]) opMap[j.assigned_to] = { count: 0, revenue: 0 };
          opMap[j.assigned_to].count++;
          opMap[j.assigned_to].revenue += Number(j.estimated_cost || 0);
        }

        // Get top 10
        const sorted = Object.entries(opMap)
          .sort(([, a], [, b]) => b.count - a.count)
          .slice(0, 10);

        // Fetch profile names
        const operatorIds = sorted.map(([id]) => id);
        const { data: profiles } = operatorIds.length > 0
          ? await supabaseAdmin
              .from('profiles')
              .select('id, full_name, email')
              .in('id', operatorIds)
          : { data: [] };

        const profileMap = new Map((profiles || []).map(p => [p.id, p]));

        return sorted.map(([id, stats]) => ({
          operator_id: id,
          name: profileMap.get(id)?.full_name || profileMap.get(id)?.email || 'Unknown',
          jobs_completed: stats.count,
          total_revenue: stats.revenue,
        }));
      })();

      queries.top_customers = (async () => {
        const { data } = await supabaseAdmin
          .from('job_orders')
          .select('customer_name, estimated_cost');

        const custMap: Record<string, { count: number; revenue: number }> = {};
        for (const j of data || []) {
          const name = j.customer_name || 'Unknown';
          if (!custMap[name]) custMap[name] = { count: 0, revenue: 0 };
          custMap[name].count++;
          custMap[name].revenue += Number(j.estimated_cost || 0);
        }

        return Object.entries(custMap)
          .sort(([, a], [, b]) => b.revenue - a.revenue)
          .slice(0, 10)
          .map(([name, stats]) => ({ customer_name: name, jobs: stats.count, total_revenue: stats.revenue }));
      })();

      queries.recent_activity = (async () => {
        const { data, error } = await supabaseAdmin
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(15);

        if (error && isTableNotFoundError(error)) return [];
        return data || [];
      })();

      queries.active_operators = (async () => {
        const { data } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .in('role', ['operator', 'apprentice'])
          .eq('active', true);

        return { count: (data || []).length };
      })();
    }

    // --- Salesman-specific queries ---
    if (userRole === 'salesman') {
      queries.jobs = (async () => {
        const { data } = await supabaseAdmin
          .from('job_orders')
          .select('status, estimated_cost')
          .eq('created_by', userId);

        const byStatus: Record<string, number> = {};
        let totalEstimated = 0;
        for (const j of data || []) {
          byStatus[j.status] = (byStatus[j.status] || 0) + 1;
          totalEstimated += Number(j.estimated_cost || 0);
        }

        return { by_status: byStatus, total: (data || []).length, total_estimated: totalEstimated };
      })();

      queries.my_jobs = (async () => {
        const { data } = await supabaseAdmin
          .from('job_orders')
          .select('status, estimated_cost')
          .eq('created_by', userId);

        const byStatus: Record<string, number> = {};
        let totalEstimated = 0;
        for (const j of data || []) {
          byStatus[j.status] = (byStatus[j.status] || 0) + 1;
          totalEstimated += Number(j.estimated_cost || 0);
        }

        return { by_status: byStatus, total: (data || []).length, total_estimated: totalEstimated };
      })();

      queries.my_commission = (async () => {
        // Get the salesman's commission rate
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('commission_rate')
          .eq('id', userId)
          .single();

        const commissionRate = Number(profile?.commission_rate || 0);

        // Get completed jobs created by this salesman
        const { data: completedJobs } = await supabaseAdmin
          .from('job_orders')
          .select('estimated_cost, completed_at, created_at')
          .eq('created_by', userId)
          .eq('status', 'completed');

        // Group by month
        const monthly: Record<string, { revenue: number; commission: number; count: number }> = {};
        for (const j of completedJobs || []) {
          const dateStr = j.completed_at || j.created_at;
          if (!dateStr) continue;
          const month = dateStr.substring(0, 7);
          if (!monthly[month]) monthly[month] = { revenue: 0, commission: 0, count: 0 };
          const cost = Number(j.estimated_cost || 0);
          monthly[month].revenue += cost;
          monthly[month].commission += cost * commissionRate;
          monthly[month].count++;
        }

        return {
          rate: commissionRate,
          monthly: Object.entries(monthly)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, data]) => ({ month, ...data })),
        };
      })();
    }

    // Execute all queries in parallel
    const keys = Object.keys(queries);
    const results = await Promise.all(Object.values(queries));

    const data: Record<string, any> = {};
    keys.forEach((key, i) => {
      data[key] = results[i];
    });

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'dashboard_stats_viewed',
        entity_type: 'dashboard',
        details: { range, role: userRole },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data, range, role: userRole });
  } catch (error: any) {
    console.error('Error in dashboard-stats GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
