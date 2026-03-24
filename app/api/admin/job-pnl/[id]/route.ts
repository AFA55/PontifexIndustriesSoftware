/**
 * API Route: GET /api/admin/job-pnl/[id]
 * Returns detailed P&L breakdown for a single job:
 * - Job info + quote
 * - Each operator's timecard entries (hours, cost, hour type)
 * - Each helper's work log entries (hours, cost)
 * - Combined totals and gross profit
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) return authResult.response;

  const { id: jobId } = await params;
  if (!jobId) {
    return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
  }

  try {
    // Fetch job details
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, title, customer_name, status, scheduled_date, job_quote, estimated_hours, assigned_to, helper_assigned_to')
      .eq('id', jobId)
      .is('deleted_at', null)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Fetch all timecard entries for this job
    const { data: timecards } = await supabaseAdmin
      .from('timecards_with_users')
      .select('*')
      .eq('job_order_id', jobId)
      .order('clock_in_time', { ascending: true });

    // Fetch all helper work log entries for this job
    const { data: helperLogs } = await supabaseAdmin
      .from('helper_work_logs')
      .select(`
        id,
        helper_id,
        log_date,
        hours_worked,
        started_at,
        completed_at,
        is_shop_ticket,
        profiles!helper_work_logs_helper_id_fkey (
          full_name,
          email,
          role,
          hourly_rate
        )
      `)
      .eq('job_order_id', jobId)
      .order('log_date', { ascending: true });

    // Aggregate timecard labor
    const timecardEntries = (timecards || []).map((t: any) => {
      const effectiveCost = t.labor_cost != null
        ? t.labor_cost
        : (t.hourly_rate && t.total_hours ? parseFloat((t.total_hours * t.hourly_rate).toFixed(2)) : 0);
      return {
        id: t.id,
        worker_name: t.full_name,
        role: t.role,
        hourly_rate: t.hourly_rate,
        date: t.date,
        clock_in_time: t.clock_in_time,
        clock_out_time: t.clock_out_time,
        total_hours: t.total_hours,
        labor_cost: effectiveCost,
        hour_type: t.hour_type,
        is_shop_hours: t.is_shop_hours,
        is_night_shift: t.is_night_shift,
        is_approved: t.is_approved,
      };
    });

    // Aggregate helper labor
    const helperEntries = (helperLogs || []).map((h: any) => {
      const profile = h.profiles;
      const hourlyRate = profile?.hourly_rate || null;
      const hours = h.hours_worked || 0;
      const cost = hourlyRate ? parseFloat((hours * hourlyRate).toFixed(2)) : 0;
      return {
        id: h.id,
        worker_name: profile?.full_name || 'Unknown',
        role: profile?.role || 'apprentice',
        hourly_rate: hourlyRate,
        date: h.log_date,
        started_at: h.started_at,
        completed_at: h.completed_at,
        total_hours: hours,
        labor_cost: cost,
        is_shop_ticket: h.is_shop_ticket,
      };
    });

    // Combine all workers for per-person summary
    const workerMap: Record<string, { name: string; role: string; hourly_rate: number | null; total_hours: number; labor_cost: number; type: string }> = {};

    for (const entry of timecardEntries) {
      const key = entry.worker_name || 'Unknown';
      if (!workerMap[key]) {
        workerMap[key] = { name: key, role: entry.role, hourly_rate: entry.hourly_rate, total_hours: 0, labor_cost: 0, type: 'operator' };
      }
      workerMap[key].total_hours += entry.total_hours || 0;
      workerMap[key].labor_cost  += entry.labor_cost  || 0;
    }

    for (const entry of helperEntries) {
      const key = entry.worker_name;
      if (!workerMap[key]) {
        workerMap[key] = { name: key, role: entry.role, hourly_rate: entry.hourly_rate, total_hours: 0, labor_cost: 0, type: 'helper' };
      }
      workerMap[key].total_hours += entry.total_hours || 0;
      workerMap[key].labor_cost  += entry.labor_cost  || 0;
    }

    const totalLaborHours = [...timecardEntries, ...helperEntries].reduce((s, e) => s + (e.total_hours || 0), 0);
    const totalLaborCost  = [...timecardEntries, ...helperEntries].reduce((s, e) => s + (e.labor_cost  || 0), 0);
    const jobQuote = job.job_quote || 0;
    const grossProfit = jobQuote - totalLaborCost;
    const grossMarginPct = jobQuote > 0 ? parseFloat(((grossProfit / jobQuote) * 100).toFixed(1)) : null;

    return NextResponse.json({
      success: true,
      data: {
        job: {
          id: job.id,
          job_number: job.job_number,
          title: job.title,
          customer_name: job.customer_name,
          status: job.status,
          scheduled_date: job.scheduled_date,
          job_quote: jobQuote,
          estimated_hours: job.estimated_hours,
        },
        timecardEntries,
        helperEntries,
        workerSummary: Object.values(workerMap).sort((a, b) => b.total_hours - a.total_hours),
        totals: {
          totalLaborHours:  parseFloat(totalLaborHours.toFixed(2)),
          totalLaborCost:   parseFloat(totalLaborCost.toFixed(2)),
          jobQuote,
          grossProfit:      parseFloat(grossProfit.toFixed(2)),
          grossMarginPct,
          workerCount: Object.keys(workerMap).length,
        },
      },
    });
  } catch (err: any) {
    console.error('Unexpected error in job-pnl/[id] route:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
