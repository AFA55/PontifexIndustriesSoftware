export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/operator-report/[id]?year=2026 — the ANNUAL employee report
 * (founder Jul 12, modeled on Patriot's paper attendance tracker): per-month
 * lates (count + minutes), days worked, hours (regular/OT/total), subsistence
 * nights, approved time-off days by type — plus year totals and every customer
 * survey left for this operator. Admin roles only, tenant-scoped.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { computeOperatorRating } from '@/lib/operator-rating';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });

  const { id } = await params;
  const yearParam = request.nextUrl.searchParams.get('year');
  const year = /^\d{4}$/.test(yearParam ?? '') ? Number(yearParam) : new Date().getFullYear();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  // Person must belong to the caller's tenant (admin client bypasses RLS —
  // this check IS the boundary).
  const { data: person } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, role, email, created_at')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle();
  if (!person) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  const [cardsRes, timeOffRes, surveysRes, attendanceRes, helperReviewsRes, subsistenceRes, visitsRes] = await Promise.all([
    supabaseAdmin
      .from('timecards')
      .select('date, net_hours, total_hours, regular_hours, overtime_hours, is_late, late_minutes, out_of_town, is_shop_hours')
      .eq('tenant_id', auth.tenantId)
      .eq('user_id', id)
      .gte('date', start)
      .lte('date', end)
      .limit(2000),
    supabaseAdmin
      .from('operator_time_off')
      .select('date, end_date, type, status')
      .eq('tenant_id', auth.tenantId)
      .eq('operator_id', id)
      .eq('status', 'approved')
      .gte('date', start)
      .lte('date', end),
    supabaseAdmin
      .from('customer_surveys')
      .select('job_order_id, overall_rating, communication_rating, cleanliness_rating, would_recommend, feedback_text, submitted_at')
      .eq('tenant_id', auth.tenantId)
      .eq('operator_id', id)
      .gte('submitted_at', `${year}-01-01T00:00:00Z`)
      .lt('submitted_at', `${year + 1}-01-01T00:00:00Z`)
      .order('submitted_at', { ascending: false }),
    supabaseAdmin
      .from('attendance_events')
      .select('date, code')
      .eq('tenant_id', auth.tenantId)
      .eq('user_id', id)
      .gte('date', start)
      .lte('date', end),
    // Helper → operator reviews (crew feedback) left for THIS operator this year.
    supabaseAdmin
      .from('job_helper_reviews')
      .select('job_order_id, reviewer_id, rating, comment, created_at')
      .eq('tenant_id', auth.tenantId)
      .eq('operator_id', id)
      .gte('created_at', `${year}-01-01T00:00:00Z`)
      .lt('created_at', `${year + 1}-01-01T00:00:00Z`)
      .order('created_at', { ascending: false }),
    // Subsistence nights — the source of truth (was double-counting off timecards.out_of_town).
    supabaseAdmin
      .from('subsistence_nights')
      .select('night_date')
      .eq('tenant_id', auth.tenantId)
      .eq('operator_id', id)
      .gte('night_date', start)
      .lte('night_date', end),
    // Supervisor walkthroughs of THIS employee. Until now the report card
    // claimed to be the operator's record while omitting the one grade filed by
    // management itself.
    supabaseAdmin
      .from('supervisor_visits')
      .select(
        'id, visit_date, supervisor_name, job_order_id, job_number, customer_name, observations, issues_flagged, follow_up_required, follow_up_notes, performance_rating, safety_rating, cleanliness_rating'
      )
      .eq('tenant_id', auth.tenantId)
      .eq('operator_id', id)
      // Drafts are not filed grades — they must not show or move the score.
      .eq('status', 'submitted')
      .gte('visit_date', start)
      .lte('visit_date', end)
      .order('visit_date', { ascending: false }),
  ]);
  if (cardsRes.error) return NextResponse.json({ error: cardsRes.error.message }, { status: 500 });

  const blankMonth = () => ({
    daysWorked: 0, totalHours: 0, regularHours: 0, overtimeHours: 0,
    lateDays: 0, lateMinutes: 0, shopDays: 0, subsistenceNights: 0,
    timeOffDays: {} as Record<string, number>,
    attendanceCodes: {} as Record<string, number>,
  });
  const months = Array.from({ length: 12 }, blankMonth);

  for (const c of cardsRes.data ?? []) {
    const m = Number(String(c.date).slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    const b = months[m];
    const net = Number(c.net_hours ?? c.total_hours ?? 0);
    const ot = Number(c.overtime_hours ?? 0);
    b.daysWorked += 1;
    b.totalHours += net;
    b.overtimeHours += ot;
    b.regularHours += c.regular_hours != null ? Number(c.regular_hours) : Math.max(0, net - ot);
    if (c.is_late) { b.lateDays += 1; b.lateMinutes += Number(c.late_minutes ?? 0); }
    if (c.is_shop_hours) b.shopDays += 1;
  }

  // Subsistence nights from the source-of-truth table, bucketed by month.
  for (const n of subsistenceRes?.data ?? []) {
    const m = Number(String(n.night_date).slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    months[m].subsistenceNights += 1;
  }

  // Manual attendance codes (EA/UA/NCNS/... — the paper tracker's judgment calls).
  for (const a of attendanceRes.data ?? []) {
    const m = Number(String(a.date).slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    const b = months[m];
    b.attendanceCodes[a.code] = (b.attendanceCodes[a.code] ?? 0) + 1;
  }

  // Approved time off: expand each request across its days, bucketed by month.
  for (const t of timeOffRes.data ?? []) {
    const from = new Date(`${t.date}T00:00:00`);
    const to = new Date(`${(t.end_date ?? t.date)}T00:00:00`);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() !== year) continue;
      const b = months[d.getMonth()];
      const key = (t.type ?? 'other') as string;
      b.timeOffDays[key] = (b.timeOffDays[key] ?? 0) + 1;
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const monthsOut = months.map((b, i) => ({
    month: i + 1,
    daysWorked: b.daysWorked,
    totalHours: round(b.totalHours),
    regularHours: round(b.regularHours),
    overtimeHours: round(b.overtimeHours),
    lateDays: b.lateDays,
    lateMinutes: b.lateMinutes,
    shopDays: b.shopDays,
    subsistenceNights: b.subsistenceNights,
    timeOffDays: b.timeOffDays,
    attendanceCodes: b.attendanceCodes,
  }));

  const totals = monthsOut.reduce(
    (acc, m) => ({
      daysWorked: acc.daysWorked + m.daysWorked,
      totalHours: round(acc.totalHours + m.totalHours),
      regularHours: round(acc.regularHours + m.regularHours),
      overtimeHours: round(acc.overtimeHours + m.overtimeHours),
      lateDays: acc.lateDays + m.lateDays,
      lateMinutes: acc.lateMinutes + m.lateMinutes,
      subsistenceNights: acc.subsistenceNights + m.subsistenceNights,
      timeOffDays: Object.entries(m.timeOffDays).reduce((t, [k, v]) => ({ ...t, [k]: (t[k] ?? 0) + v }), acc.timeOffDays),
      attendanceCodes: Object.entries(m.attendanceCodes).reduce((t, [k, v]) => ({ ...t, [k]: (t[k] ?? 0) + v }), acc.attendanceCodes),
    }),
    { daysWorked: 0, totalHours: 0, regularHours: 0, overtimeHours: 0, lateDays: 0, lateMinutes: 0, subsistenceNights: 0, timeOffDays: {} as Record<string, number>, attendanceCodes: {} as Record<string, number> }
  );

  // Survey job numbers for context.
  const surveys = surveysRes.data ?? [];
  const jobIds = [...new Set(surveys.map((s: any) => s.job_order_id).filter(Boolean))];
  const jobNumbers = jobIds.length
    ? new Map(
        ((await supabaseAdmin.from('job_orders').select('id, job_number, customer_name').eq('tenant_id', auth.tenantId).in('id', jobIds)).data ?? [])
          .map((j: any) => [j.id, { jobNumber: j.job_number, customer: j.customer_name }])
      )
    : new Map();

  const ratings = surveys.map((s: any) => Number(s.overall_rating)).filter((n) => Number.isFinite(n) && n > 0);
  const avgRating = ratings.length ? round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;

  // Helper → operator reviews: resolve reviewer names + job numbers for display.
  const helperReviews = helperReviewsRes?.data ?? [];
  const reviewerIds = [...new Set(helperReviews.map((r: any) => r.reviewer_id).filter(Boolean))];
  const reviewJobIds = [...new Set(helperReviews.map((r: any) => r.job_order_id).filter(Boolean))];
  const reviewerNames = reviewerIds.length
    ? new Map(
        ((await supabaseAdmin.from('profiles').select('id, full_name').eq('tenant_id', auth.tenantId).in('id', reviewerIds)).data ?? [])
          .map((p: any) => [p.id, p.full_name])
      )
    : new Map();
  const reviewJobNumbers = reviewJobIds.length
    ? new Map(
        ((await supabaseAdmin.from('job_orders').select('id, job_number, customer_name').eq('tenant_id', auth.tenantId).in('id', reviewJobIds)).data ?? [])
          .map((j: any) => [j.id, { jobNumber: j.job_number, customer: j.customer_name }])
      )
    : new Map();
  const helperRatings = helperReviews.map((r: any) => Number(r.rating)).filter((n) => Number.isFinite(n) && n > 0);
  const helperAvg = helperRatings.length ? round(helperRatings.reduce((a, b) => a + b, 0) / helperRatings.length) : null;

  // Supervisor site visits + the canonical composite standing. The composite is
  // computed on read from lib/operator-rating.ts — one definition, nothing to
  // drift out of sync with a stored rollup.
  const visits = visitsRes?.data ?? [];

  // A source that ERRORS must not be silently read as "no reviews": the
  // composite renormalises its weights over the surviving sources, so a dropped
  // source doesn't just lose detail, it changes the number. The rest of this
  // report (attendance, hours, time off) is still useful, so instead of failing
  // the whole request we withhold the composite and say why.
  const compositeSourceErrors = [
    visitsRes?.error ? 'supervisor visits' : null,
    surveysRes?.error ? 'customer surveys' : null,
    helperReviewsRes?.error ? 'helper reviews' : null,
  ].filter((s): s is string => s !== null);
  if (compositeSourceErrors.length > 0) {
    console.error('operator-report composite source failure:', {
      visits: visitsRes?.error?.message,
      surveys: surveysRes?.error?.message,
      helper: helperReviewsRes?.error?.message,
    });
  }
  const visitRatings = visits
    .map((v: any) =>
      [v.performance_rating, v.safety_rating, v.cleanliness_rating]
        .map(Number)
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5)
    )
    .filter((parts: number[]) => parts.length > 0)
    .map((parts: number[]) => parts.reduce((a, b) => a + b, 0) / parts.length);
  const visitAvg = visitRatings.length
    ? round(visitRatings.reduce((a: number, b: number) => a + b, 0) / visitRatings.length)
    : null;

  const compositeRating = compositeSourceErrors.length > 0
    ? null
    : computeOperatorRating({
        supervisorVisits: visits as never,
        customerSurveys: surveys as never,
        helperReviews: helperReviews as never,
      });

  return NextResponse.json({
    success: true,
    data: {
      year,
      employee: { name: person.full_name, role: person.role, email: person.email },
      months: monthsOut,
      totals,
      surveys: {
        count: surveys.length,
        averageRating: avgRating,
        items: surveys.map((s: any) => ({
          submittedAt: s.submitted_at,
          overall: s.overall_rating,
          communication: s.communication_rating,
          cleanliness: s.cleanliness_rating,
          wouldRecommend: s.would_recommend,
          feedback: s.feedback_text,
          ...(jobNumbers.get(s.job_order_id) ?? {}),
        })),
      },
      helperReviews: {
        count: helperReviews.length,
        averageRating: helperAvg,
        items: helperReviews.map((r: any) => ({
          createdAt: r.created_at,
          rating: r.rating,
          comment: r.comment,
          reviewer: reviewerNames.get(r.reviewer_id) ?? 'Helper',
          ...(reviewJobNumbers.get(r.job_order_id) ?? {}),
        })),
      },
      supervisorVisits: {
        count: visits.length,
        averageRating: visitAvg,
        items: visits.map((v: any) => ({
          id: v.id,
          visitDate: v.visit_date,
          supervisor: v.supervisor_name,
          jobNumber: v.job_number,
          customer: v.customer_name,
          performance: v.performance_rating,
          safety: v.safety_rating,
          cleanliness: v.cleanliness_rating,
          observations: v.observations,
          issuesFlagged: v.issues_flagged,
          followUpRequired: !!v.follow_up_required,
          followUpNotes: v.follow_up_notes,
        })),
      },
      // Canonical composite across supervisor + customer + helper grades.
      // See lib/operator-rating.ts for the weights and why. null when a source
      // failed to load — `compositeUnavailable` names which, so the UI can say
      // "couldn't compute" instead of rendering a wrong number.
      compositeRating,
      compositeUnavailable: compositeSourceErrors.length > 0 ? compositeSourceErrors : null,
    },
  });
}
