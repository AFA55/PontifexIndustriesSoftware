export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/schedule-board/crew-grid
 * Returns operator × date matrix for the crew schedule grid view.
 * Shows job counts per operator per day over a configurable date range.
 *
 * Query params:
 *   startDate - YYYY-MM-DD (default: today)
 *   days - number of days to show (default: 14, max: 30)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const daysParam = parseInt(searchParams.get('days') || '14');
    const days = Math.min(Math.max(daysParam, 7), 30);

    // Build date range
    const startDate = startDateParam ? new Date(startDateParam) : new Date();
    startDate.setHours(0, 0, 0, 0);

    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const endDate = dates[dates.length - 1];

    // Fetch all operators and helpers
    const { data: operators } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, skill_level_numeric, active')
      .in('role', ['operator', 'apprentice'])
      .order('full_name', { ascending: true });

    // Fetch all jobs in the date range (assigned + unassigned)
    const { data: jobs } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, job_type, status, scheduled_date, arrival_time, assigned_to, helper_assigned_to, estimated_hours, address')
      .gte('scheduled_date', dates[0])
      .lte('scheduled_date', endDate)
      .not('status', 'in', '("cancelled","void")');

    // Build operator × date matrix
    const activeOperators = (operators || []).filter(op => op.active !== false);

    // Count jobs per operator per date + track unassigned
    const operatorGrid: Record<string, Record<string, {
      count: number;
      jobs: { id: string; job_number: string; customer: string; job_type: string; status: string; time: string }[];
    }>> = {};

    // Initialize grid for all operators
    for (const op of activeOperators) {
      operatorGrid[op.id] = {};
      for (const date of dates) {
        operatorGrid[op.id][date] = { count: 0, jobs: [] };
      }
    }

    // Track unassigned jobs per date
    const unassigned: Record<string, number> = {};
    for (const date of dates) {
      unassigned[date] = 0;
    }

    // Populate grid from jobs
    for (const job of jobs || []) {
      const date = job.scheduled_date;
      if (!dates.includes(date)) continue;

      const jobInfo = {
        id: job.id,
        job_number: job.job_number || '',
        customer: job.customer_name || 'Unknown',
        job_type: job.job_type || '',
        status: job.status,
        time: job.arrival_time || '',
      };

      if (job.assigned_to && operatorGrid[job.assigned_to]) {
        operatorGrid[job.assigned_to][date].count++;
        operatorGrid[job.assigned_to][date].jobs.push(jobInfo);
      }

      // Also count for helper
      if (job.helper_assigned_to && operatorGrid[job.helper_assigned_to]) {
        operatorGrid[job.helper_assigned_to][date].count++;
        operatorGrid[job.helper_assigned_to][date].jobs.push(jobInfo);
      }

      if (!job.assigned_to) {
        unassigned[date] = (unassigned[date] || 0) + 1;
      }
    }

    // Fetch capacity settings
    const { data: settings } = await supabaseAdmin
      .from('schedule_settings')
      .select('max_slots, warning_threshold')
      .limit(1)
      .single();

    const maxSlots = settings?.max_slots || 3; // Per-operator max (not board max)
    const warningThreshold = settings?.warning_threshold || 2;

    // Build response rows
    const rows = activeOperators.map(op => ({
      operator_id: op.id,
      name: op.full_name || 'Unknown',
      role: op.role,
      skill_level: op.skill_level_numeric || 0,
      cells: dates.map(date => {
        const cell = operatorGrid[op.id]?.[date] || { count: 0, jobs: [] };
        let color: 'empty' | 'green' | 'amber' | 'red' = 'empty';

        if (cell.count === 0) {
          color = 'empty';
        } else if (cell.count >= maxSlots) {
          color = 'red';
        } else if (cell.count >= warningThreshold) {
          color = 'amber';
        } else {
          color = 'green';
        }

        return {
          date,
          count: cell.count,
          color,
          jobs: cell.jobs,
        };
      }),
    }));

    // Unassigned row
    const unassignedRow = {
      operator_id: 'unassigned',
      name: 'UNASSIGNED',
      role: 'unassigned',
      skill_level: 0,
      cells: dates.map(date => ({
        date,
        count: unassigned[date] || 0,
        color: (unassigned[date] || 0) > 0 ? 'red' as const : 'empty' as const,
        jobs: [] as any[],
      })),
    };

    return NextResponse.json({
      success: true,
      data: {
        dates: dates.map(d => ({
          date: d,
          dayName: new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
          dayNum: new Date(d + 'T12:00:00').getDate(),
          month: new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }),
          isWeekend: [0, 6].includes(new Date(d + 'T12:00:00').getDay()),
          isToday: d === new Date().toISOString().split('T')[0],
        })),
        rows: [unassignedRow, ...rows],
        totalOperators: activeOperators.length,
        maxSlots,
        warningThreshold,
      },
    });
  } catch (error: any) {
    console.error('Error in crew-grid GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
