export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess, resolveTenantScope } from '@/lib/api-auth';

/**
 * GET /api/admin/schedule-board/week-snapshot?date=YYYY-MM-DD&jobId=XXX
 * Returns a 7-day window (Mon–Sun) centered on the given date.
 * For each operator: their name + array of job assignments per day.
 * Also returns the skill-match data for the given job.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;
    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const jobId = searchParams.get('jobId');
    if (!dateParam) return NextResponse.json({ error: 'date required' }, { status: 400 });

    // Build Mon–Sun window
    const anchor = new Date(dateParam + 'T12:00:00');
    const dow = anchor.getDay(); // 0=Sun
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - (dow === 0 ? 6 : dow - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const weekStart = fmt(monday);
    const weekEnd = fmt(sunday);

    // Build array of date strings for the week
    const weekDays: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekDays.push(fmt(d));
    }

    // Fetch all operators for this tenant
    const { data: operators } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, skill_level_numeric, tasks_qualified_for, skill_levels')
      .eq('tenant_id', scope.tenantId)
      .in('role', ['operator', 'apprentice'])
      .eq('active', true)
      .order('full_name');

    // Fetch all jobs assigned to operators this week
    const { data: weekJobs } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, status, scheduled_date, scheduled_end_date, assigned_to, helper_assigned_to, difficulty_rating')
      .eq('tenant_id', scope.tenantId)
      .not('status', 'in', '("completed","cancelled","deleted")')
      .lte('scheduled_date', weekEnd)
      .or(`scheduled_end_date.gte.${weekStart},scheduled_end_date.is.null`)
      .not('assigned_to', 'is', null);

    // Build operator → day → jobs map
    type DayJob = { id: string; job_number: string; customer_name: string; status: string; difficulty: number };
    type OperatorRow = { id: string; name: string; days: Record<string, DayJob[]>; skill_level_numeric: number | null };

    const opMap: Record<string, OperatorRow> = {};
    for (const op of operators || []) {
      opMap[op.id] = { id: op.id, name: op.full_name, days: {}, skill_level_numeric: op.skill_level_numeric };
      for (const day of weekDays) opMap[op.id].days[day] = [];
    }

    for (const j of weekJobs || []) {
      const jStart = j.scheduled_date;
      const jEnd = (j as { scheduled_end_date?: string }).scheduled_end_date || j.scheduled_date;
      const dJob: DayJob = { id: j.id, job_number: j.job_number || '', customer_name: j.customer_name || '', status: j.status, difficulty: (j as { difficulty_rating?: number }).difficulty_rating || 0 };

      for (const day of weekDays) {
        if (day >= jStart && day <= jEnd) {
          if (j.assigned_to && opMap[j.assigned_to]) opMap[j.assigned_to].days[day].push(dJob);
          const helper = (j as { helper_assigned_to?: string }).helper_assigned_to;
          if (helper && opMap[helper]) opMap[helper].days[day].push(dJob);
        }
      }
    }

    // Fetch the specific job's skill match (reuse existing logic inline)
    let jobDifficulty = 0;
    let jobTypes: string[] = [];
    if (jobId) {
      const { data: jData } = await supabaseAdmin
        .from('job_orders')
        .select('difficulty_rating, job_type')
        .eq('id', jobId)
        .maybeSingle();
      if (jData) {
        jobDifficulty = jData.difficulty_rating || 0;
        jobTypes = (jData.job_type || '').split(',').map((t: string) => t.trim()).filter(Boolean);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        week_start: weekStart,
        week_end: weekEnd,
        week_days: weekDays,
        operators: Object.values(opMap),
        job_difficulty: jobDifficulty,
        job_types: jobTypes,
      },
    });
  } catch (err) {
    console.error('week-snapshot error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
