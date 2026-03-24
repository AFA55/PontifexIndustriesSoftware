/**
 * API Route: GET /api/admin/job-pnl
 * Returns P&L summary for all jobs (or filtered by date range / status).
 * Requires admin, super_admin, or operations_manager role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;

  const sp = request.nextUrl.searchParams;
  const startDate = sp.get('startDate');
  const endDate = sp.get('endDate');
  const status = sp.get('status');
  const limit = parseInt(sp.get('limit') || '200');

  try {
    let query = supabaseAdmin
      .from('job_pnl_summary')
      .select('*')
      .order('scheduled_date', { ascending: false })
      .limit(limit);

    if (startDate) query = query.gte('scheduled_date', startDate);
    if (endDate)   query = query.lte('scheduled_date', endDate);
    if (status)    query = query.eq('status', status);

    const { data: jobs, error } = await query;

    if (error) {
      console.error('job_pnl_summary query error:', error);
      return NextResponse.json({ error: 'Failed to fetch P&L data' }, { status: 500 });
    }

    // Aggregate totals across all returned jobs
    const totals = (jobs || []).reduce(
      (acc, j) => {
        acc.totalQuoted        += j.job_quote           || 0;
        acc.totalLaborCost     += j.combined_labor_cost || 0;
        acc.totalLaborHours    += j.combined_labor_hours|| 0;
        acc.totalGrossProfit   += j.gross_profit        || 0;
        return acc;
      },
      { totalQuoted: 0, totalLaborCost: 0, totalLaborHours: 0, totalGrossProfit: 0 }
    );

    const overallMarginPct = totals.totalQuoted > 0
      ? parseFloat(((totals.totalGrossProfit / totals.totalQuoted) * 100).toFixed(1))
      : null;

    return NextResponse.json({
      success: true,
      data: {
        jobs: jobs || [],
        totals: {
          ...totals,
          totalQuoted:      parseFloat(totals.totalQuoted.toFixed(2)),
          totalLaborCost:   parseFloat(totals.totalLaborCost.toFixed(2)),
          totalLaborHours:  parseFloat(totals.totalLaborHours.toFixed(2)),
          totalGrossProfit: parseFloat(totals.totalGrossProfit.toFixed(2)),
          overallMarginPct,
        },
      },
    });
  } catch (err: any) {
    console.error('Unexpected error in job-pnl route:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
