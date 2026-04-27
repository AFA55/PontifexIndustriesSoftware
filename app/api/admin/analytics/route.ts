export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/analytics
 * Business analytics overview: revenue, jobs, operators, AR, trends.
 * Requires admin, super_admin, or operations_manager role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const firstOfYear = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Run all queries in parallel
    const [
      jobsThisMonth,
      jobsLastMonth,
      jobsAllTime,
      invoicesResult,
      operatorsResult,
      recentJobsResult,
      timecardResult,
    ] = await Promise.all([
      // Jobs this month
      supabaseAdmin
        .from('job_orders')
        .select('id, status, job_quote, scheduled_date, customer_name, job_type')
        .gte('scheduled_date', firstOfMonth)
        .lte('scheduled_date', today)
        .is('deleted_at', null),

      // Jobs last month
      supabaseAdmin
        .from('job_orders')
        .select('id, status, job_quote')
        .gte('scheduled_date', firstOfLastMonth)
        .lt('scheduled_date', firstOfMonth)
        .is('deleted_at', null),

      // All time jobs for YTD
      supabaseAdmin
        .from('job_orders')
        .select('id, status, job_quote, scheduled_date, job_type')
        .gte('scheduled_date', firstOfYear)
        .is('deleted_at', null),

      // Invoices
      supabaseAdmin
        .from('invoices')
        .select('id, status, total_amount, balance_due, due_date, invoice_date')
        .gte('invoice_date', firstOfYear),

      // Operator stats (active operators)
      supabaseAdmin
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['operator', 'apprentice']),

      // Recent 7 days jobs for trend
      supabaseAdmin
        .from('job_orders')
        .select('id, status, scheduled_date, job_quote, job_type')
        .gte('scheduled_date', sevenDaysAgo)
        .is('deleted_at', null)
        .order('scheduled_date', { ascending: true }),

      // Timecard hours this week
      supabaseAdmin
        .from('timecards')
        .select('id, user_id, total_hours, date, hour_type')
        .gte('date', sevenDaysAgo)
        .not('clock_out_time', 'is', null),
    ]);

    const thisMonthJobs = jobsThisMonth.data || [];
    const lastMonthJobs = jobsLastMonth.data || [];
    const ytdJobs = jobsAllTime.data || [];
    const invoices = invoicesResult.data || [];
    const operators = operatorsResult.data || [];
    const recentJobs = recentJobsResult.data || [];
    const timecards = timecardResult.data || [];

    // ── Job Stats ──────────────────────────────────
    const completedThisMonth = thisMonthJobs.filter(j => j.status === 'completed').length;
    const completedLastMonth = lastMonthJobs.filter(j => j.status === 'completed').length;
    const scheduledThisMonth = thisMonthJobs.filter(j => ['scheduled', 'dispatched', 'en_route', 'in_progress'].includes(j.status)).length;

    const jobsByStatus: Record<string, number> = {};
    for (const job of ytdJobs) {
      jobsByStatus[job.status] = (jobsByStatus[job.status] || 0) + 1;
    }

    // ── Revenue Stats ──────────────────────────────
    const paidInvoices = invoices.filter(i => i.status === 'paid');
    const sentInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue');
    const overdueInvoices = invoices.filter(i => i.status === 'overdue');

    const revenueYTD = paidInvoices.reduce((sum, i) => sum + Number(i.total_amount || 0), 0);
    const outstandingAR = sentInvoices.reduce((sum, i) => sum + Number(i.balance_due || 0), 0);
    const overdueAR = overdueInvoices.reduce((sum, i) => sum + Number(i.balance_due || 0), 0);

    // ── Quoted Revenue vs Invoiced ─────────────────
    const quotedThisMonth = thisMonthJobs.reduce((sum, j) => sum + Number(j.job_quote || 0), 0);
    const quotedLastMonth = lastMonthJobs.reduce((sum, j) => sum + Number(j.job_quote || 0), 0);

    // ── Job Types Breakdown ────────────────────────
    const jobTypeBreakdown: Record<string, number> = {};
    for (const job of ytdJobs) {
      const type = job.job_type || 'Other';
      jobTypeBreakdown[type] = (jobTypeBreakdown[type] || 0) + 1;
    }

    // ── Daily trend (last 7 days, grouped by date) ─
    const dailyTrend: Record<string, { jobs: number; quoted: number; completed: number }> = {};
    for (const job of recentJobs) {
      const d = job.scheduled_date;
      if (!dailyTrend[d]) dailyTrend[d] = { jobs: 0, quoted: 0, completed: 0 };
      dailyTrend[d].jobs++;
      dailyTrend[d].quoted += Number(job.job_quote || 0);
      if (job.status === 'completed') dailyTrend[d].completed++;
    }

    const trendDays = Object.entries(dailyTrend)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));

    // ── Operator utilization this week ─────────────
    const operatorHours: Record<string, number> = {};
    for (const tc of timecards) {
      if (tc.user_id && tc.total_hours) {
        operatorHours[tc.user_id] = (operatorHours[tc.user_id] || 0) + Number(tc.total_hours);
      }
    }

    const operatorStats = operators
      .map(op => ({
        id: op.id,
        name: op.full_name,
        role: op.role,
        hoursThisWeek: Number((operatorHours[op.id] || 0).toFixed(1)),
      }))
      .sort((a, b) => b.hoursThisWeek - a.hoursThisWeek)
      .slice(0, 10);

    // ── Month-over-month change ─────────────────────
    const jobsMoM = lastMonthJobs.length > 0
      ? ((thisMonthJobs.length - lastMonthJobs.length) / lastMonthJobs.length * 100).toFixed(1)
      : null;
    const quotedMoM = quotedLastMonth > 0
      ? ((quotedThisMonth - quotedLastMonth) / quotedLastMonth * 100).toFixed(1)
      : null;

    return NextResponse.json({
      success: true,
      data: {
        // Job counts
        jobs: {
          thisMonth: thisMonthJobs.length,
          lastMonth: lastMonthJobs.length,
          completedThisMonth,
          completedLastMonth,
          scheduledThisMonth,
          ytdTotal: ytdJobs.length,
          momChangePct: jobsMoM,
          byStatus: jobsByStatus,
          byType: jobTypeBreakdown,
        },
        // Revenue
        revenue: {
          quotedThisMonth: parseFloat(quotedThisMonth.toFixed(2)),
          quotedLastMonth: parseFloat(quotedLastMonth.toFixed(2)),
          quotedMomChangePct: quotedMoM,
          revenueYTD: parseFloat(revenueYTD.toFixed(2)),
          outstandingAR: parseFloat(outstandingAR.toFixed(2)),
          overdueAR: parseFloat(overdueAR.toFixed(2)),
          totalInvoicesYTD: invoices.length,
          paidInvoicesYTD: paidInvoices.length,
          collectionRate: invoices.length > 0
            ? parseFloat((paidInvoices.length / invoices.length * 100).toFixed(1))
            : 0,
        },
        // Operator stats
        operators: {
          total: operators.length,
          operatorCount: operators.filter(o => o.role === 'operator').length,
          helperCount: operators.filter(o => o.role === 'apprentice').length,
          weeklyStats: operatorStats,
          totalHoursThisWeek: parseFloat(timecards.reduce((s, t) => s + Number(t.total_hours || 0), 0).toFixed(1)),
        },
        // Daily trend
        trend: trendDays,
        // Meta
        asOf: now.toISOString(),
      },
    });
  } catch (err: unknown) {
    console.error('Analytics API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
