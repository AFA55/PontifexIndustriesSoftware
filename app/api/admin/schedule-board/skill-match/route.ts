export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/schedule-board/skill-match?jobId=X
 * Fetches the job's difficulty_rating, then returns all operators sorted by match quality.
 * Optional query params:
 *   date=YYYY-MM-DD        — filter for availability on that date
 *   requiredBadge=GE       — add hasBadge / badgeExpiry to each operator result
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import {
  resolveAllScopesForServiceCode,
  type ScopeKey,
} from '@/lib/skills-taxonomy';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const jobId = request.nextUrl.searchParams.get('jobId');
    const date = request.nextUrl.searchParams.get('date'); // optional YYYY-MM-DD
    const requiredBadge = request.nextUrl.searchParams.get('requiredBadge') ?? undefined; // optional badge type
    if (!jobId) {
      return NextResponse.json({ error: 'Missing required query param: jobId' }, { status: 400 });
    }

    // Fetch job difficulty and job_type
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('id, difficulty_rating, job_type')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const difficulty = job.difficulty_rating || 5; // default to 5 if not set
    const jobTypes = (job.job_type || '').split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean);

    // Determine scope keys this job requires (primary + secondary mappings).
    // jobTypes come in as lowercased service codes already.
    const jobScopeSet = new Set<ScopeKey>();
    let anyScopeMapped = false;
    for (const jt of jobTypes) {
      const scopes = resolveAllScopesForServiceCode(jt);
      if (scopes.length > 0) anyScopeMapped = true;
      for (const s of scopes) jobScopeSet.add(s);
    }
    const jobScopes = Array.from(jobScopeSet);

    // Fetch all operators with skill levels, per-scope skill_levels, and tasks_qualified_for
    const { data: operators, error: opError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, skill_level_numeric, tasks_qualified_for, skill_levels')
      .eq('role', 'operator')
      .order('full_name');

    if (opError) {
      console.error('Error fetching operators for skill match:', opError);
      return NextResponse.json({ error: 'Failed to fetch operators' }, { status: 500 });
    }

    // If date was provided, find operators busy that day (assigned or helper on active jobs)
    const busyIds = new Set<string>();
    if (date) {
      const { data: busyJobs } = await supabaseAdmin
        .from('job_orders')
        .select('assigned_to, helper_assigned_to, scheduled_date, scheduled_end_date')
        .in('status', ['scheduled', 'in_progress', 'pending'])
        .lte('scheduled_date', date)
        .or(`scheduled_end_date.gte.${date},scheduled_end_date.is.null`);
      for (const j of busyJobs || []) {
        const endDate = (j as any).scheduled_end_date || (j as any).scheduled_date;
        if (endDate && endDate >= date) {
          if (j.assigned_to) busyIds.add(j.assigned_to);
          if ((j as any).helper_assigned_to) busyIds.add((j as any).helper_assigned_to);
        }
      }
    }

    // Fetch badge eligibility if a requiredBadge was specified
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const badgeMap = new Map<string, { hasBadge: boolean; badgeExpiry: string | null }>();
    if (requiredBadge) {
      const operatorIds = (operators || []).map((op) => op.id);
      if (operatorIds.length > 0) {
        const { data: badgeRows } = await supabaseAdmin
          .from('operator_badges')
          .select('operator_id, expiry_date')
          .eq('badge_type', requiredBadge)
          .in('operator_id', operatorIds);
        for (const row of badgeRows || []) {
          const valid = !row.expiry_date || row.expiry_date >= today;
          badgeMap.set(row.operator_id, {
            hasBadge: valid,
            badgeExpiry: row.expiry_date ?? null,
          });
        }
      }
    }

    let qualifiedCount = 0;
    const totalOperators = (operators || []).length;

    // Calculate match quality for each operator
    const results = (operators || []).map((op) => {
      const perScope: Record<string, number> =
        (op as any).skill_levels && typeof (op as any).skill_levels === 'object' && !Array.isArray((op as any).skill_levels)
          ? ((op as any).skill_levels as Record<string, number>)
          : {};

      // If the job has any scope-mapped service code, use the best per-scope
      // skill across the job's required scopes; otherwise fall back to the
      // generic skill_level_numeric.
      let skill: number;
      if (anyScopeMapped && jobScopes.length > 0) {
        let best = -Infinity;
        for (const s of jobScopes) {
          const v = typeof perScope[s] === 'number' ? perScope[s] : undefined;
          if (typeof v === 'number' && v > best) best = v;
        }
        if (!Number.isFinite(best)) {
          // operator has no rating for any mapped scope → use generic fallback
          skill = op.skill_level_numeric || 5;
        } else {
          skill = best;
        }
      } else {
        skill = op.skill_level_numeric || 5;
      }

      let match_quality: 'good' | 'stretch' | 'over';
      if (skill >= difficulty) {
        match_quality = 'good';
      } else if (skill >= difficulty - 2) {
        match_quality = 'stretch';
      } else {
        match_quality = 'over';
      }

      // Check task qualification
      const qualifiedFor: string[] = Array.isArray(op.tasks_qualified_for) ? op.tasks_qualified_for : [];
      const qualifiedLower = qualifiedFor.map((t: string) => t.toLowerCase());

      let isQualified: boolean;
      if (anyScopeMapped && jobScopes.length > 0) {
        // Qualified if per-scope skill >= 1 for at least one required scope,
        // OR fall back to legacy tasks_qualified_for match on the raw job_type.
        const hasScopeQual = jobScopes.some(
          (s) => typeof perScope[s] === 'number' && perScope[s] >= 1
        );
        const hasLegacyQual =
          jobTypes.length > 0 && jobTypes.some((jt: string) => qualifiedLower.includes(jt));
        isQualified = hasScopeQual || hasLegacyQual;
      } else {
        isQualified = jobTypes.length === 0 || jobTypes.some((jt: string) => qualifiedLower.includes(jt));
      }

      if (isQualified) qualifiedCount++;

      const badgeInfo = requiredBadge
        ? (badgeMap.get(op.id) ?? { hasBadge: false, badgeExpiry: null })
        : null;

      return {
        id: op.id,
        full_name: op.full_name,
        skill_level_numeric: op.skill_level_numeric,
        scope_skill: skill,
        match_quality,
        is_qualified: isQualified,
        is_available: date ? !busyIds.has(op.id) : true,
        tasks_qualified_for: qualifiedFor,
        ...(requiredBadge ? { hasBadge: badgeInfo!.hasBadge, badgeExpiry: badgeInfo!.badgeExpiry } : {}),
      };
    });

    const availableQualified = date
      ? results.filter((r) => r.is_available && r.is_qualified).length
      : qualifiedCount;

    // Sort: good first, then stretch, then over
    const order = { good: 0, stretch: 1, over: 2 };
    results.sort((a, b) => order[a.match_quality] - order[b.match_quality]);

    return NextResponse.json({
      success: true,
      data: {
        job_difficulty: difficulty,
        job_types: jobTypes,
        qualified_count: qualifiedCount,
        available_qualified_count: availableQualified,
        total_operators: totalOperators,
        date: date || null,
        required_badge: requiredBadge ?? null,
        operators: results,
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/schedule-board/skill-match:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
