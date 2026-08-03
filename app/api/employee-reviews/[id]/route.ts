export const dynamic = 'force-dynamic';

/**
 * GET /api/employee-reviews/[id]
 *
 * ONE review-history endpoint, two audiences:
 *
 *   • the employee themself ("My Reviews" on /dashboard/my-profile) — so an
 *     operator can see the grade a supervisor left them and where they fell
 *     short, which is the whole point of grading them;
 *   • management + sales ("Previous Reviews" on the employee record) — so the
 *     office and the salespeople can see an employee's track record.
 *
 * It returns every grading source, LABELLED BY SOURCE so supervisor grades and
 * customer grades are never conflated, plus the canonical composite standing
 * from lib/operator-rating.ts (computed on read — nothing to drift).
 *
 * ── Permission matrix (enforced here, server-side) ─────────────────────────
 *   caller is the subject          → allowed (any role, always their own row)
 *   admin / super_admin /
 *     operations_manager           → allowed for anyone in their tenant
 *   salesman                       → allowed for anyone in their tenant (READ-ONLY;
 *                                    matches supervisor-visits READ_ROLES)
 *   supervisor (viewing others)    → 403 ON PURPOSE. Supervisors are already
 *                                    narrowed to their OWN filed visits by
 *                                    /api/admin/supervisor-visits and cannot
 *                                    read another supervisor's report; serving
 *                                    them a full history here would silently
 *                                    widen that. They still see their own
 *                                    reports, and their own reviews as a subject.
 *   operator / apprentice / other  → 403 for anyone but themselves.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, resolveTenantScope } from '@/lib/api-auth';
import { computeOperatorRating } from '@/lib/operator-rating';

/** Roles allowed to read SOMEONE ELSE'S review history. */
const HISTORY_ROLES = new Set(['admin', 'super_admin', 'operations_manager', 'salesman']);

const MAX_ITEMS = 50;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const isSelf = id === auth.userId;

  if (!isSelf && !HISTORY_ROLES.has(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Tenant boundary. supabaseAdmin bypasses RLS, so this IS the check — and it
  // must be UNCONDITIONAL. `if (tenantId) .eq(...)` is the documented unsafe
  // shape (lib/api-auth.ts:13-17): a null tenant silently drops the filter and
  // a tenant-scoped super_admin could read another client's grades.
  // resolveTenantScope confines non-platform-owner super_admins to their own
  // tenant and guarantees a non-null id.
  const scope = await resolveTenantScope(request, auth);
  if ('response' in scope) return scope.response;
  const tenantId = scope.tenantId;

  const { data: person } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, role, tenant_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!person) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  // NOTE: `status='submitted'` — a DRAFT walkthrough is not a filed grade. It
  // must not be shown to the employee being graded, and must not move the score.
  const visitQuery = supabaseAdmin
    .from('supervisor_visits')
    .select(
      'id, visit_date, supervisor_name, job_order_id, job_number, customer_name, observations, issues_flagged, follow_up_required, follow_up_notes, performance_rating, safety_rating, cleanliness_rating, created_at'
    )
    .eq('tenant_id', tenantId)
    .eq('operator_id', id)
    .eq('status', 'submitted')
    .order('visit_date', { ascending: false })
    .limit(MAX_ITEMS);

  const surveyQuery = supabaseAdmin
    .from('customer_surveys')
    .select(
      'id, job_order_id, overall_rating, communication_rating, cleanliness_rating, would_recommend, feedback_text, operator_feedback_notes, submitted_at'
    )
    .eq('tenant_id', tenantId)
    .eq('operator_id', id)
    .order('submitted_at', { ascending: false })
    .limit(MAX_ITEMS);

  const helperQuery = supabaseAdmin
    .from('job_helper_reviews')
    .select('id, job_order_id, reviewer_id, rating, comment, created_at')
    .eq('tenant_id', tenantId)
    .eq('operator_id', id)
    .order('created_at', { ascending: false })
    .limit(MAX_ITEMS);

  const [visitsRes, surveysRes, helperRes] = await Promise.all([visitQuery, surveyQuery, helperQuery]);

  // A source that ERRORS must never be silently treated as "no reviews". The
  // composite renormalises its weights over surviving sources, so a dropped
  // supervisor score doesn't just lose detail — it changes the number (a 5.0
  // supervisor average dropping out can turn 3.5 into 1.0). Fail loudly.
  const sourceErrors = [
    visitsRes.error ? 'supervisor visits' : null,
    surveysRes.error ? 'customer surveys' : null,
    helperRes.error ? 'helper reviews' : null,
  ].filter((s): s is string => s !== null);
  if (sourceErrors.length > 0) {
    console.error('employee-reviews source failure:', {
      visits: visitsRes.error?.message,
      surveys: surveysRes.error?.message,
      helper: helperRes.error?.message,
    });
    return NextResponse.json(
      { error: `Could not load ${sourceErrors.join(' + ')}. Showing a partial rating would be misleading, so nothing is returned.` },
      { status: 503 }
    );
  }

  const visits: Record<string, unknown>[] = visitsRes.data ?? [];
  const surveys: Record<string, unknown>[] = surveysRes.data ?? [];
  const helperReviews: Record<string, unknown>[] = helperRes.data ?? [];

  // Resolve job numbers once for every source that references a job.
  const jobIds = [
    ...new Set(
      [...surveys, ...helperReviews]
        .map((r: Record<string, unknown>) => r.job_order_id as string | null)
        .filter((v): v is string => !!v)
    ),
  ];
  let jobMap = new Map<string, { jobNumber: string | null; customer: string | null }>();
  if (jobIds.length > 0) {
    const { data: jobs } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name')
      .eq('tenant_id', tenantId)
      .in('id', jobIds);
    jobMap = new Map(
      (jobs ?? []).map((j: Record<string, unknown>) => [
        j.id as string,
        { jobNumber: (j.job_number as string) ?? null, customer: (j.customer_name as string) ?? null },
      ])
    );
  }

  // The helper's NAME is withheld from the person being reviewed — naming the
  // helper who graded their own lead operator would chill honest crew feedback.
  // Management sees the name.
  //
  // This is name-withholding, NOT anonymity, and no UI copy may claim otherwise:
  // on a two-person crew the operator can infer who left it from the job + date.
  // Real anonymity would require withholding reviews until several exist.
  let reviewerNames = new Map<string, string>();
  if (!isSelf && helperReviews.length > 0) {
    const reviewerIds = [
      ...new Set(
        helperReviews.map((r: Record<string, unknown>) => r.reviewer_id as string).filter(Boolean)
      ),
    ];
    if (reviewerIds.length > 0) {
      const { data: reviewers } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .eq('tenant_id', tenantId)
        .in('id', reviewerIds);
      reviewerNames = new Map(
        (reviewers ?? []).map((p: Record<string, unknown>) => [p.id as string, (p.full_name as string) ?? 'Helper'])
      );
    }
  }

  const rating = computeOperatorRating({
    supervisorVisits: visits as never,
    customerSurveys: surveys as never,
    helperReviews: helperReviews as never,
  });

  const mean = (nums: Array<number | null | undefined>) => {
    const vals = nums.filter((n): n is number => typeof n === 'number' && n >= 1 && n <= 5);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  };

  return NextResponse.json({
    success: true,
    data: {
      employee: { id: person.id, name: person.full_name, role: person.role },
      viewer: { isSelf, role: auth.role },
      rating,
      supervisorVisits: visits.map((v: Record<string, unknown>) => ({
        id: v.id,
        source: 'supervisor' as const,
        visitDate: v.visit_date,
        supervisorName: v.supervisor_name,
        jobOrderId: v.job_order_id ?? null,
        jobNumber: v.job_number ?? null,
        customer: v.customer_name ?? null,
        performance: v.performance_rating ?? null,
        safety: v.safety_rating ?? null,
        cleanliness: v.cleanliness_rating ?? null,
        average: mean([
          v.performance_rating as number | null,
          v.safety_rating as number | null,
          v.cleanliness_rating as number | null,
        ]),
        observations: v.observations ?? null,
        issuesFlagged: v.issues_flagged ?? null,
        followUpRequired: !!v.follow_up_required,
        followUpNotes: v.follow_up_notes ?? null,
      })),
      customerSurveys: surveys.map((s: Record<string, unknown>) => ({
        id: s.id,
        source: 'customer' as const,
        submittedAt: s.submitted_at,
        overall: s.overall_rating ?? null,
        communication: s.communication_rating ?? null,
        cleanliness: s.cleanliness_rating ?? null,
        average: mean([
          s.overall_rating as number | null,
          s.communication_rating as number | null,
          s.cleanliness_rating as number | null,
        ]),
        wouldRecommend: s.would_recommend ?? null,
        feedback: s.feedback_text ?? null,
        operatorNotes: s.operator_feedback_notes ?? null,
        ...(jobMap.get(s.job_order_id as string) ?? {}),
      })),
      helperReviews: helperReviews.map((r: Record<string, unknown>) => ({
        id: r.id,
        source: 'helper' as const,
        createdAt: r.created_at,
        rating: r.rating ?? null,
        comment: r.comment ?? null,
        reviewer: isSelf ? 'Crew member' : reviewerNames.get(r.reviewer_id as string) ?? 'Helper',
        ...(jobMap.get(r.job_order_id as string) ?? {}),
      })),
    },
  });
}
