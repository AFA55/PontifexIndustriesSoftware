export const dynamic = 'force-dynamic';

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
import { resolveAvatarUrl } from '@/lib/avatar';
import { buildLaborBreakdown, getTenantLaborBurdenPct } from '@/lib/labor-cost-server';
import { attributableTimecards } from '@/lib/job-clock-attribution';
import { bookedEndDateOf, dropHelperDoubleCountedCards } from '@/lib/labor-cost';
import { quotedAmount } from '@/lib/job-quoted-amount';

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
    // Fetch job details (tenant-scoped — this response includes payroll/hourly-rate data)
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, tenant_id, job_number, title, customer_name, status, scheduled_date, scheduled_end_date, end_date, job_quote, estimated_cost, estimated_hours, assigned_to, helper_assigned_to, track_financials, drive_distance_miles, mileage_rate, work_started_at, route_started_at, work_completed_at')
      .eq('id', jobId)
      .is('deleted_at', null);
    if (authResult.role !== 'super_admin') {
      if (!authResult.tenantId) {
        return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
      }
      jobQuery = jobQuery.eq('tenant_id', authResult.tenantId);
    }
    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // ── The crew's CLOCK CARDS ────────────────────────────────────────────────
    // This used to be `.eq('job_order_id', jobId)` and nothing else, which is
    // the SAME bug the printed work ticket had: only a minority of production
    // cards carry that tag, so a job the crew genuinely worked reported no time
    // at all. Verified against production Aug 17 2026 — 8 of 14 completed jobs
    // had ZERO linked cards, and the Labor Cost tile on every one of them read
    // "No time entries linked to this job". SIX of those eight gained real
    // hours from attribution; QA-2026-140542 and QA-2026-320243 correctly stay
    // at zero (nobody's day can be tied to them), so the claim is "6 of 14
    // went from nothing to something", not 8. On JOB-2026-877412 Dante was
    // assigned, filed a 5.51h daily log, and clocked 6.11h that day; the card
    // simply carried no job link, so the office was told the job cost nothing.
    //
    // `attributableTimecards` is the ONE shared rule (lib/job-clock-attribution.ts)
    // the work ticket already uses, so the printed sheet and the cost breakdown
    // can no longer disagree about who worked a job. It reads the view rather
    // than the base table because the cost math needs `full_name`+`hourly_rate`
    // on the row. Cards it takes WITHOUT a job link come back in
    // `attributedIds` and stay labelled as attributed the whole way to the
    // screen — the office bills off this number, so an inferred hour must never
    // look like a recorded one.
    const [{ data: crewRows }, { data: opLogRows }, { data: helperLogs }] = await Promise.all([
      supabaseAdmin.from('job_crew').select('user_id').eq('job_order_id', jobId),
      supabaseAdmin.from('daily_job_logs').select('operator_id, log_date').eq('job_order_id', jobId),
      supabaseAdmin
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
            hourly_rate,
            avatar_url,
            profile_picture_url
          )
        `)
        .eq('job_order_id', jobId)
        .order('log_date', { ascending: true }),
    ]);

    const laborUserIds = Array.from(
      new Set(
        [
          job.assigned_to,
          job.helper_assigned_to,
          ...((crewRows || []) as Array<{ user_id: string | null }>).map((c) => c.user_id),
          ...((opLogRows || []) as Array<{ operator_id: string | null }>).map((l) => l.operator_id),
          ...((helperLogs || []) as Array<{ helper_id: string | null }>).map((h) => h.helper_id),
        ].filter(Boolean) as string[]
      )
    );
    const laborDates = Array.from(
      new Set(
        [
          ...((opLogRows || []) as Array<{ log_date: string | null }>).map((l) => l.log_date),
          ...((helperLogs || []) as Array<{ log_date: string | null }>).map((h) => h.log_date),
        ].filter(Boolean) as string[]
      )
    );
    const {
      cards: attributedCards,
      attributedIds,
      splitDates,
    } = await attributableTimecards(
      jobId,
      laborUserIds,
      laborDates,
      '*',
      'timecards_with_users',
      (job as { tenant_id?: string | null }).tenant_id ?? authResult.tenantId ?? null
    );

    // DON'T BILL THE SAME PERSON-DAY TWICE — the helper's own log row wins over
    // their inferred day card. The guard used to live only here; it is now the
    // shared `dropHelperDoubleCountedCards` (lib/labor-cost.ts) so the
    // completion-summary route and the day-by-day builder apply it too.
    const timecards = dropHelperDoubleCountedCards(
      attributedCards as Array<{ id: string; user_id?: string | null; date?: string | null }>,
      attributedIds,
      helperLogs as Array<{ helper_id: string | null; log_date: string | null; hours_worked: number | null }>
    ) as any[];

    // The timecards_with_users view does not expose avatar columns, so fetch
    // operator avatars separately by the view's user_id and build an id->url map.
    const operatorIds = Array.from(
      new Set((timecards || []).map((t: any) => t.user_id).filter(Boolean))
    );
    const operatorAvatarById: Record<string, string | null> = {};
    if (operatorIds.length > 0) {
      const { data: operatorProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, avatar_url, profile_picture_url')
        .in('id', operatorIds);
      for (const op of operatorProfiles || []) {
        operatorAvatarById[op.id] = resolveAvatarUrl(op);
      }
    }

    // ── TRUE labor cost (lib/labor-cost) — the ONE source every screen reads ──
    // Bounded job hours per card × the worker's wage × (1 + tenant burden %).
    // Replaces the per-screen hardcoded rate ladders ($75 / $125–187.5) that
    // showed three different labor costs for the same job (founder, Aug 1).
    //
    // BUILT FIRST, ON PURPOSE. This response used to compute the breakdown at
    // the END and send `total_hours: t.total_hours` — the RAW column — on every
    // timecard entry, then sum THAT into `workerSummary` and `totalLaborHours`.
    // So one API returned two different hour figures for the same card, and the
    // P&L page rendered the unfixed one in its Hours column while the modal
    // behind the same tile rendered the fixed one. They disagreed on the 14
    // production rows where `total_hours` is stale-high (Keontre Aug 5: 8.01 vs
    // 7.47 paid; worst gap 10.93h), and again on every shop card and every card
    // clipped to the job window. Now every hour and dollar below is READ OFF
    // the breakdown, so there is exactly one number per card.
    const burdenPct = await getTenantLaborBurdenPct(
      (job as { tenant_id?: string | null }).tenant_id ?? authResult.tenantId ?? null
    );
    const labor = buildLaborBreakdown({
      job: {
        work_started_at: (job as any).work_started_at ?? null,
        route_started_at: (job as any).route_started_at ?? null,
        work_completed_at: (job as any).work_completed_at ?? null,
        // Gives the window a real end when the closing stamp is missing on an
        // already-completed job — otherwise it runs forever. See
        // `bookedSpanEndDay` in lib/labor-cost.ts.
        status: (job as any).status ?? null,
        booked_end_date: bookedEndDateOf(
          (job as any).scheduled_end_date,
          (job as any).end_date,
          (job as any).scheduled_date
        ),
      },
      timecards: timecards || [],
      helperLogs: helperLogs || [],
      burdenPct,
      attributedTimecardIds: attributedIds,
    });
    const lineById = new Map(labor.lines.map((l) => [`${l.source}:${l.id}`, l]));

    // Aggregate timecard labor
    const timecardEntries = (timecards || []).map((t: any) => {
      const line = lineById.get(`timecard:${t.id}`);
      return {
        id: t.id,
        worker_name: t.full_name,
        avatar_url: operatorAvatarById[t.user_id] ?? null,
        role: t.role,
        hourly_rate: t.hourly_rate,
        date: t.date,
        clock_in_time: t.clock_in_time,
        clock_out_time: t.clock_out_time,
        // Hours THIS JOB can be charged, not the card's whole day.
        total_hours: line?.bounded_hours ?? 0,
        // The card's own paid day + what this job did not get, so the screen can
        // explain a clipped figure instead of just quoting a smaller one.
        raw_hours: line?.raw_hours ?? 0,
        excluded_hours: line?.excluded_hours ?? 0,
        excluded_reason: line?.excluded_reason ?? null,
        labor_cost: line?.total_cost ?? 0,
        hour_type: t.hour_type,
        // All three shop flags, not just the one the view happens to expose.
        is_shop_hours:
          t.is_shop_hours === true ||
          t.is_shop_time === true ||
          (typeof t.work_location === 'string' && t.work_location.toLowerCase() === 'shop'),
        is_night_shift: t.is_night_shift,
        is_approved: t.is_approved,
        // Inferred from the office's placement, not tagged by the operator.
        attributed: attributedIds.has(t.id),
      };
    });

    // Aggregate helper labor
    const helperEntries = (helperLogs || []).map((h: any) => {
      const profile = h.profiles;
      const line = lineById.get(`helper:${h.id}`);
      return {
        id: h.id,
        worker_name: profile?.full_name || 'Unknown',
        avatar_url: resolveAvatarUrl(profile),
        role: profile?.role || 'apprentice',
        hourly_rate: profile?.hourly_rate || null,
        date: h.log_date,
        started_at: h.started_at,
        completed_at: h.completed_at,
        total_hours: line?.bounded_hours ?? 0,
        raw_hours: line?.raw_hours ?? 0,
        labor_cost: line?.total_cost ?? 0,
        is_shop_ticket: h.is_shop_ticket,
        attributed: false,
      };
    });

    // Combine all workers for per-person summary. `attributed_hours` rides
    // along so the Worker Summary can say which part of a person's total is
    // inferred rather than merging the two unmarked.
    const workerMap: Record<string, { name: string; avatar_url: string | null; role: string; hourly_rate: number | null; total_hours: number; attributed_hours: number; labor_cost: number; type: string }> = {};

    for (const entry of [...timecardEntries, ...helperEntries]) {
      const key = entry.worker_name || 'Unknown';
      const type = 'is_shop_ticket' in entry ? 'helper' : 'operator';
      if (!workerMap[key]) {
        workerMap[key] = { name: key, avatar_url: entry.avatar_url ?? null, role: entry.role, hourly_rate: entry.hourly_rate, total_hours: 0, attributed_hours: 0, labor_cost: 0, type };
      }
      workerMap[key].total_hours += entry.total_hours || 0;
      workerMap[key].labor_cost  += entry.labor_cost  || 0;
      if (entry.attributed) workerMap[key].attributed_hours += entry.total_hours || 0;
    }
    for (const w of Object.values(workerMap)) {
      w.total_hours = parseFloat(w.total_hours.toFixed(2));
      w.attributed_hours = parseFloat(w.attributed_hours.toFixed(2));
      w.labor_cost = parseFloat(w.labor_cost.toFixed(2));
    }

    // The hours tile and the breakdown modal now quote the same figure.
    const totalLaborHours = labor.totals.bounded_hours;
    // The pre-wage trigger figure, kept ONLY as the fallback for jobs where no
    // wage is on file (the breakdown totals $0 there). Computed from the raw
    // rows, not from the entries above — those now carry burdened costs.
    const legacyLaborCost =
      (timecards || []).reduce((s: number, t: any) => {
        const own = t.labor_cost != null ? Number(t.labor_cost) : NaN;
        if (Number.isFinite(own)) return s + own;
        return s + (t.hourly_rate && t.total_hours ? Number(t.hourly_rate) * Number(t.total_hours) : 0);
      }, 0) +
      ((helperLogs || []) as any[]).reduce((s: number, h: any) => {
        const rate = h.profiles?.hourly_rate;
        return s + (rate ? Number(rate) * (Number(h.hours_worked) || 0) : 0);
      }, 0);
    // THE QUOTE, by the shared rule (lib/job-quoted-amount.ts). This read
    // `job.job_quote || 0`, which is non-null on 1 of 48 production jobs — so
    // every gross-profit and margin figure on this page was computed against a
    // $0 quote while the Completed Jobs modal, reading `estimated_cost`, showed
    // a real "Quoted" amount for the same job.
    const jobQuote = quotedAmount(job as { estimated_cost?: number | null; job_quote?: number | null }) ?? 0;
    // Prefer the burdened bounded cost when wages exist; the legacy trigger
    // figure (timecards.labor_cost) is $0 until wages are set, so this is the
    // upgrade path, not a silent change.
    const totalLaborCost = labor.totals.total > 0 ? labor.totals.total : legacyLaborCost;

    // track_financials gates the non-labor cost fields; jobs created before this
    // feature default to false and must reduce to the original labor-only formula.
    // Keeping this simple for now (labor + mileage only) per the founder's call —
    // equipment/material/subcontractor/other cost columns exist but aren't
    // collected by the UI yet, so they're intentionally not factored in here.
    const trackFinancials = job.track_financials === true;
    const driveCost = trackFinancials
      ? (job.drive_distance_miles ?? 0) * (job.mileage_rate ?? 0)
      : 0;
    const totalNonLaborCost = driveCost;

    const grossProfit = jobQuote - totalLaborCost - totalNonLaborCost;
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
          // The resolved quote (`estimated_cost`, falling back to `job_quote`)
          // — same figure `totals.jobQuote` and the margin are computed from.
          job_quote: jobQuote,
          // Both raw columns travel too, so the page can apply the SAME shared
          // rule rather than trusting a pre-resolved number. `job_quote` is set
          // on 1 of 48 production jobs (verified Aug 17 2026); the schedule form
          // writes `estimated_cost`, which is set on 9 — a screen that asks for
          // "the quote" and reads only `job_quote` shows a blank on 47 of 48.
          estimated_cost: (job as { estimated_cost?: number | null }).estimated_cost ?? null,
          estimated_hours: job.estimated_hours,
          track_financials: trackFinancials,
        },
        timecardEntries,
        helperEntries,
        labor,
        // Days where somebody's card could not be attributed at all because
        // they split the day across jobs — the caller says "we can't attribute
        // this" instead of printing a guess. See lib/job-clock-attribution.ts.
        unattributableDates: Array.from(splitDates).sort(),
        workerSummary: Object.values(workerMap).sort((a, b) => b.total_hours - a.total_hours),
        costBreakdown: trackFinancials ? {
          driveDistanceMiles: job.drive_distance_miles ?? 0,
          mileageRate: job.mileage_rate ?? 0,
          driveCost: parseFloat(driveCost.toFixed(2)),
          totalNonLaborCost: parseFloat(totalNonLaborCost.toFixed(2)),
        } : null,
        totals: {
          totalLaborHours:  parseFloat(totalLaborHours.toFixed(2)),
          totalLaborCost:   parseFloat(totalLaborCost.toFixed(2)),
          totalNonLaborCost: parseFloat(totalNonLaborCost.toFixed(2)),
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
