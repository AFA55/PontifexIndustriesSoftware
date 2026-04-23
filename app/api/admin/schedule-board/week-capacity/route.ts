export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/schedule-board/week-capacity
 *
 * Query params:
 *   start        - ISO date (YYYY-MM-DD) — first day of the 7-day window (required)
 *   serviceType  - comma-joined list of service codes (e.g. "WS/TS,ECD") the job needs.
 *                   Drives the "qualified operator" math. Optional.
 *   difficulty   - numeric 1-10, used to flag operators that are a stretch/over-skill.
 *                   Optional.
 *
 * Returns per-day capacity + skill roster + scheduled jobs for the 7 days,
 * plus a `required_skill_label` field that describes the primary skill the
 * front-end should surface.
 *
 * Access: schedule-board viewers (admin, super_admin, salesman, ops manager, supervisor).
 * Tenant-scoped (admin client + explicit tenant_id filter).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import {
  SERVICE_SKILL_MAP,
  parseServiceCodes,
  operatorQualifiesFor,
  primarySkillLabel,
  rollupSkillRoster,
} from '@/lib/skill-match';

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    const start = searchParams.get('start');
    const serviceTypeRaw = searchParams.get('serviceType') || '';
    const difficultyRaw = searchParams.get('difficulty');

    if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      return NextResponse.json({ error: 'Missing or invalid `start` param (YYYY-MM-DD)' }, { status: 400 });
    }

    const difficulty = difficultyRaw ? Number(difficultyRaw) : null;
    const requiredMeta = parseServiceCodes(serviceTypeRaw);
    const requiredCodes = requiredMeta.map((m) => m.code);

    const end = addDays(start, 6);

    // ── 1) Operators in tenant ────────────────────────────────────
    let opQuery = supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, active, skill_level_numeric, tasks_qualified_for')
      .in('role', ['operator', 'apprentice'])
      .order('full_name');
    if (tenantId) opQuery = opQuery.eq('tenant_id', tenantId);

    const { data: operators, error: opErr } = await opQuery;
    if (opErr) {
      console.error('week-capacity: operator fetch error', opErr);
      return NextResponse.json({ error: 'Failed to load operators' }, { status: 500 });
    }
    const activeOperators = (operators || []).filter((o: any) => o.active !== false);
    const totalOperators = activeOperators.length;

    // Pre-compute qualification per operator (static across the week)
    const opQualified = new Map<string, boolean>();
    for (const op of activeOperators) {
      opQualified.set(
        op.id,
        requiredCodes.length === 0 ? true : operatorQualifiesFor(op.tasks_qualified_for, requiredCodes)
      );
    }

    // ── 2) Jobs overlapping the 7-day window ──────────────────────
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select(
        'id, job_number, customer_name, project_name, job_type, scheduled_date, end_date, ' +
        'estimated_start_time, estimated_end_time, arrival_time, difficulty_rating, ' +
        'job_difficulty_rating, assigned_to, helper_assigned_to, crew_size, is_will_call, status'
      )
      .is('deleted_at', null)
      .eq('is_will_call', false)
      .not('status', 'in', '("pending_approval","cancelled","rejected")')
      .lte('scheduled_date', end);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);

    const { data: jobsRaw, error: jobErr } = await jobQuery;
    if (jobErr) {
      console.error('week-capacity: job fetch error', jobErr);
      return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 });
    }
    const jobs = (jobsRaw || []).filter((j: any) => {
      const s = j.scheduled_date ? String(j.scheduled_date).slice(0, 10) : null;
      const e = j.end_date ? String(j.end_date).slice(0, 10) : s;
      if (!s) return false;
      return e! >= start; // overlap
    });

    // ── 3) Per-day operator assignments ───────────────────────────
    let assignQuery = supabaseAdmin
      .from('job_daily_assignments')
      .select('job_order_id, assignment_date, operator_id, helper_id')
      .gte('assignment_date', start)
      .lte('assignment_date', end);
    if (tenantId) assignQuery = assignQuery.eq('tenant_id', tenantId);
    const { data: dailyAssignments } = await assignQuery;

    // crew_assignments holds persistent operator-on-job mappings; we use them
    // as a fallback for jobs with no daily row.
    let crewQuery = supabaseAdmin
      .from('job_crew_assignments')
      .select('job_order_id, operator_id, removed_at')
      .is('removed_at', null);
    if (tenantId) crewQuery = crewQuery.eq('tenant_id', tenantId);
    const { data: crewAssignments } = await crewQuery;
    const crewByJob = new Map<string, Set<string>>();
    for (const c of crewAssignments || []) {
      if (!c.job_order_id || !c.operator_id) continue;
      if (!crewByJob.has(c.job_order_id)) crewByJob.set(c.job_order_id, new Set());
      crewByJob.get(c.job_order_id)!.add(c.operator_id);
    }

    // ── 4) Time off ───────────────────────────────────────────────
    let timeOffQuery = supabaseAdmin
      .from('operator_time_off')
      .select('operator_id, date')
      .gte('date', start)
      .lte('date', end);
    if (tenantId) timeOffQuery = timeOffQuery.eq('tenant_id', tenantId);
    const { data: timeOff } = await timeOffQuery;
    const timeOffByDate: Record<string, Set<string>> = {};
    for (const t of timeOff || []) {
      const d = String(t.date).slice(0, 10);
      if (!timeOffByDate[d]) timeOffByDate[d] = new Set();
      timeOffByDate[d].add(t.operator_id);
    }

    // ── 5) Per-day rollup ─────────────────────────────────────────
    const days: any[] = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = addDays(start, i);
      const booked = new Set<string>();

      // Jobs scheduled on this date
      const dayJobs = jobs.filter((j: any) => {
        const s = String(j.scheduled_date).slice(0, 10);
        const e = j.end_date ? String(j.end_date).slice(0, 10) : s;
        return dateStr >= s && dateStr <= e;
      });

      // Build a per-job operator list for the UI.
      const jobsForUI = dayJobs.map((j: any) => {
        const assigned = new Set<string>();

        // (a) daily-assignments pin for this exact date
        for (const a of dailyAssignments || []) {
          if (a.job_order_id !== j.id) continue;
          if (String(a.assignment_date).slice(0, 10) !== dateStr) continue;
          if (a.operator_id) assigned.add(a.operator_id);
          if (a.helper_id) assigned.add(a.helper_id);
        }

        // (b) fallback: legacy single-operator fields on job_orders
        if (assigned.size === 0) {
          if (j.assigned_to) assigned.add(j.assigned_to);
          if (j.helper_assigned_to) assigned.add(j.helper_assigned_to);
        }

        // (c) fallback: crew assignment rows
        if (assigned.size === 0 && crewByJob.has(j.id)) {
          for (const opId of crewByJob.get(j.id)!) assigned.add(opId);
        }

        for (const opId of assigned) booked.add(opId);

        return {
          id: j.id,
          job_number: j.job_number,
          customer_name: j.customer_name,
          project_name: j.project_name,
          job_type: j.job_type,
          difficulty: j.difficulty_rating ?? j.job_difficulty_rating ?? null,
          arrival_time: j.arrival_time || null,
          estimated_start_time: j.estimated_start_time || null,
          estimated_end_time: j.estimated_end_time || null,
          operator_ids: Array.from(assigned),
        };
      });

      // Add time-off operators to the booked set
      const offSet = timeOffByDate[dateStr] || new Set<string>();
      for (const opId of offSet) booked.add(opId);

      const bookedOperatorIds = Array.from(booked).filter((id) => opQualified.has(id));
      const freeOperatorIds = activeOperators.map((o: any) => o.id).filter((id) => !booked.has(id));
      const freeOps = activeOperators.filter((o: any) => freeOperatorIds.includes(o.id));

      const qualifiedFreeOperators = freeOps.filter((o: any) => opQualified.get(o.id));
      const qualifiedTotal = activeOperators.filter((o: any) => opQualified.get(o.id)).length;

      // Stretch: qualified-on-paper but skill_level_numeric < difficulty
      let stretchFreeCount = 0;
      if (difficulty) {
        stretchFreeCount = qualifiedFreeOperators.filter((o: any) =>
          (o.skill_level_numeric ?? 5) < Number(difficulty)
        ).length;
      }

      const skillRoster = rollupSkillRoster(
        freeOps.map((o: any) => ({ tasks_qualified_for: o.tasks_qualified_for })),
        requiredCodes
      );

      days.push({
        date: dateStr,
        total_operators: totalOperators,
        qualified_total: qualifiedTotal,
        booked_operator_ids: bookedOperatorIds,
        free_operator_ids: freeOperatorIds,
        time_off_operator_ids: Array.from(offSet),
        free_count: freeOperatorIds.length,
        booked_count: Array.from(booked).length,
        qualified_free_count: qualifiedFreeOperators.length,
        stretch_free_count: stretchFreeCount,
        jobs: jobsForUI,
        skill_roster: skillRoster,
      });
    }

    // Operator dictionary so the frontend can render names without a second query
    const operatorDict = activeOperators.map((o: any) => ({
      id: o.id,
      full_name: o.full_name,
      role: o.role,
      skill_level_numeric: o.skill_level_numeric ?? null,
      is_qualified: opQualified.get(o.id) === true,
    }));

    return NextResponse.json({
      success: true,
      data: {
        start,
        end,
        required_service_codes: requiredCodes,
        required_service_labels: requiredMeta.map((m) => m.label),
        required_skill_label: primarySkillLabel(requiredCodes),
        required_difficulty: difficulty,
        total_operators: totalOperators,
        operators: operatorDict,
        days,
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/schedule-board/week-capacity:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
