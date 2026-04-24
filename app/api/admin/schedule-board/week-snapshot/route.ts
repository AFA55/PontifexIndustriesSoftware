export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/schedule-board/week-snapshot?date=YYYY-MM-DD&jobId=X
 *
 * Returns a 7-day grid (Mon–Sun containing `date`) with:
 *   - week_days: string[]  (7 ISO dates)
 *   - job_difficulty: number
 *   - operators: Array<{
 *       id, name, skill_level_numeric,
 *       days: Record<YYYY-MM-DD, Array<{ id, customer_name, status }>>
 *     }>
 *
 * Used by the Approve Job modal's Schedule Quick-View panel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns the Monday of the week containing dateStr */
function weekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0 = Sun, 1 = Mon, …
  const diff = day === 0 ? -6 : 1 - day; // shift to Mon
  d.setDate(d.getDate() + diff);
  return toDateStr(d);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    const { searchParams } = new URL(request.url);

    const date = searchParams.get('date');
    const jobId = searchParams.get('jobId');

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Missing or invalid `date` param (YYYY-MM-DD)' }, { status: 400 });
    }

    const monday = weekMonday(date);
    const weekDays: string[] = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const start = weekDays[0];
    const end = weekDays[6];

    // ── 1) Job difficulty (optional) ─────────────────────────────
    let jobDifficulty = 5;
    if (jobId) {
      const { data: jobRow } = await supabaseAdmin
        .from('job_orders')
        .select('difficulty_rating')
        .eq('id', jobId)
        .single();
      if (jobRow?.difficulty_rating != null) jobDifficulty = jobRow.difficulty_rating;
    }

    // ── 2) Active operators ───────────────────────────────────────
    let opQuery = supabaseAdmin
      .from('profiles')
      .select('id, full_name, skill_level_numeric')
      .in('role', ['operator', 'apprentice'])
      .order('full_name');
    if (tenantId) opQuery = opQuery.eq('tenant_id', tenantId);
    const { data: operatorsRaw } = await opQuery;
    const operators = (operatorsRaw || []).filter((o: any) => o.active !== false);

    // ── 3) Jobs overlapping the 7-day window ─────────────────────
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, customer_name, status, scheduled_date, end_date, assigned_to, helper_assigned_to')
      .is('deleted_at', null)
      .not('status', 'in', '("pending_approval","cancelled","rejected")')
      .lte('scheduled_date', end)
      .gte(
        // We want jobs where end_date >= start OR (end_date is null AND scheduled_date >= start)
        // Supabase can't easily do OR, so fetch broad and filter in JS
        'scheduled_date',
        // fetch from a week before start to catch multi-day jobs that started earlier
        addDays(start, -7)
      );
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: jobsRaw } = await jobQuery;

    const jobs = (jobsRaw || []).filter((j: any) => {
      const s = j.scheduled_date ? String(j.scheduled_date).slice(0, 10) : null;
      const e = j.end_date ? String(j.end_date).slice(0, 10) : s;
      if (!s) return false;
      return e! >= start && s <= end;
    });

    // ── 4) Daily assignments ──────────────────────────────────────
    let assignQuery = supabaseAdmin
      .from('job_daily_assignments')
      .select('job_order_id, assignment_date, operator_id, helper_id')
      .gte('assignment_date', start)
      .lte('assignment_date', end);
    if (tenantId) assignQuery = assignQuery.eq('tenant_id', tenantId);
    const { data: dailyAssignments } = await assignQuery;

    // ── 5) Crew assignments (fallback) ────────────────────────────
    let crewQuery = supabaseAdmin
      .from('job_crew_assignments')
      .select('job_order_id, operator_id')
      .is('removed_at', null);
    if (tenantId) crewQuery = crewQuery.eq('tenant_id', tenantId);
    const { data: crewAssignmentsRaw } = await crewQuery;

    const crewByJob = new Map<string, Set<string>>();
    for (const c of crewAssignmentsRaw || []) {
      if (!c.job_order_id || !c.operator_id) continue;
      if (!crewByJob.has(c.job_order_id)) crewByJob.set(c.job_order_id, new Set());
      crewByJob.get(c.job_order_id)!.add(c.operator_id);
    }

    // ── 6) Build per-operator, per-day grid ──────────────────────
    // For each operator, for each day, collect the jobs they're on.
    type JobRef = { id: string; customer_name: string; status: string };
    const result: Array<{
      id: string;
      name: string;
      skill_level_numeric: number | null;
      days: Record<string, JobRef[]>;
    }> = operators.map((op: any) => ({
      id: op.id,
      name: op.full_name || 'Unknown',
      skill_level_numeric: op.skill_level_numeric ?? null,
      days: Object.fromEntries(weekDays.map(d => [d, [] as JobRef[]])),
    }));

    const opIndex = new Map<string, number>(operators.map((op: any, i: number) => [op.id, i]));

    for (const j of jobs) {
      const s = String(j.scheduled_date).slice(0, 10);
      const e = j.end_date ? String(j.end_date).slice(0, 10) : s;
      const jobRef: JobRef = {
        id: j.id,
        customer_name: j.customer_name || 'Unknown',
        status: j.status || 'scheduled',
      };

      // Collect operator ids for this job (daily + crew)
      const opIds = new Set<string>();
      if (j.assigned_to) opIds.add(j.assigned_to);
      if (j.helper_assigned_to) opIds.add(j.helper_assigned_to);
      for (const id of crewByJob.get(j.id) || []) opIds.add(id);

      for (const dayStr of weekDays) {
        if (dayStr < s || dayStr > e) continue;

        // Check if daily assignments override for this day
        const dailyOps = new Set<string>();
        for (const a of dailyAssignments || []) {
          if (a.job_order_id !== j.id) continue;
          if (String(a.assignment_date).slice(0, 10) !== dayStr) continue;
          if (a.operator_id) dailyOps.add(a.operator_id);
          if (a.helper_id) dailyOps.add(a.helper_id);
        }

        const effectiveOps = dailyOps.size > 0 ? dailyOps : opIds;

        for (const opId of effectiveOps) {
          const idx = opIndex.get(opId);
          if (idx == null) continue;
          // Avoid duplicates
          const existing = result[idx].days[dayStr];
          if (!existing.some(r => r.id === j.id)) {
            existing.push(jobRef);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        week_days: weekDays,
        job_difficulty: jobDifficulty,
        operators: result,
      },
    });
  } catch (err) {
    console.error('week-snapshot error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
