/**
 * lib/labor-cost-server.ts — server-side labor-cost aggregation built on the
 * pure math in lib/labor-cost.ts. This is the ONE place that turns a job's
 * timecards + helper logs + wages + tenant burden % into a labor breakdown.
 *
 * Consumers:
 *  - GET /api/admin/job-pnl/[id]        → returns the breakdown to the UI
 *    (job P&L page, completed-jobs modal, completed-job-tickets page all
 *    render labor from that API — no more per-screen hardcoded rates).
 *
 * NOT a consumer, despite what this header used to claim: /api/admin/invoices
 * does its own thing and has never imported from here. The fetch-and-assemble
 * variant written for it (`computeJobLaborBreakdown`) had zero callers and was
 * deleted rather than left as a second, drifting copy of the rules below.
 *
 * Server-only: imports supabaseAdmin. Never import from client components.
 */

import { supabaseAdmin } from './supabase-admin';
import {
  cardSpanHours,
  jobHoursForCard,
  laborLine,
  paidCardHours,
  paidSegmentHours,
  round2,
  DEFAULT_LABOR_BURDEN_PCT,
  type BoundableCard,
  type JobWindow,
} from './labor-cost';

export interface LaborBreakdownLine {
  id: string;
  source: 'timecard' | 'helper';
  worker_name: string;
  role: string | null;
  date: string | null;
  /** Raw span for display: clock-in/out (timecards) or started/completed (helpers). */
  span_start: string | null;
  span_end: string | null;
  /** The card/log's own paid hours (lunch-adjusted for timecards). */
  raw_hours: number;
  /**
   * Hours actually attributable to THIS job (bounded; shop-flagged → 0), on the
   * PAYROLL basis — this is a COST line, and payroll does not pay the lunch.
   *
   * On a day divided at the in-route presses that makes it deliberately SMALLER
   * than the same segment on the printed work ticket, which carries the gross
   * span because the customer IS billed for the lunch inside it (founder,
   * Aug 17 2026). Conrade's Aug 19 Sterling stretch is 3.55 billable / 3.38
   * paid. See `paidSegmentHours` in lib/labor-cost.ts.
   */
  bounded_hours: number;
  /** raw_hours − bounded_hours (≥ 0). */
  excluded_hours: number;
  /** Why hours were excluded, when they were. */
  excluded_reason: 'shop' | 'outside_job_window' | 'other_job' | null;
  /**
   * TRUE = these hours are ATTRIBUTED, not recorded: the card carries no
   * `job_order_id`, and it counts here because the office placed this person on
   * this job that day (or they touched no other job). The office invoices from
   * this screen, so the distinction has to survive all the way to the pixel —
   * see lib/job-clock-attribution.ts.
   */
  attributed: boolean;
  hourly_rate: number | null;
  rate_missing: boolean;
  burden_pct: number;
  base_cost: number;
  burden_amount: number;
  total_cost: number;
}

export interface LaborBreakdownTotals {
  bounded_hours: number;
  base: number;
  burden: number;
  total: number;
  /** True when any line with job hours has no wage set — the total is an UNDERCOUNT. */
  any_rate_missing: boolean;
  line_count: number;
  /** Of `bounded_hours`, how many came from cards LINKED to this job. */
  linked_hours: number;
  /** Of `bounded_hours`, how many were ATTRIBUTED from an unlinked day card. */
  attributed_hours: number;
  /** Of `total`, the dollars that rest on attributed hours. */
  attributed_total: number;
  /** How many lines are attributed — lets a caller say "3 of 5 day cards". */
  attributed_line_count: number;
}

export interface LaborBreakdown {
  burden_pct: number;
  lines: LaborBreakdownLine[];
  totals: LaborBreakdownTotals;
}

/**
 * Tenant labor burden %, with column-missing tolerance: before migration
 * 20260802b_labor_burden.sql lands, the select 42703s → default 25.
 */
export async function getTenantLaborBurdenPct(tenantId: string | null): Promise<number> {
  if (!tenantId) return DEFAULT_LABOR_BURDEN_PCT;
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('labor_burden_pct')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return DEFAULT_LABOR_BURDEN_PCT; // 42703 pre-migration, etc.
    const n = Number((data as { labor_burden_pct?: unknown } | null)?.labor_burden_pct);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : DEFAULT_LABOR_BURDEN_PCT;
  } catch {
    return DEFAULT_LABOR_BURDEN_PCT;
  }
}

interface TimecardRowLike extends BoundableCard {
  id: string;
  full_name?: string | null;
  role?: string | null;
  hourly_rate?: number | null;
  date?: string | null;
  /** Lunch-deducted payroll hours. Preferred over `total_hours` — see `paidHours`. */
  net_hours?: number | null;
}

/**
 * The hours this card's owner was PAID for — the ceiling on what the job can be
 * charged, `null` when not yet known. THE RULE LIVES IN `lib/labor-cost.ts` so
 * this file and `lib/completed-job-days.ts` (the Work-Performed panel rendered
 * beside this cost) can never quote different hours for the same card. They
 * drifted once: the day-panel copy mapped `Number(null) → 0` before filtering,
 * so a NULL `total_hours` became a zero cap and won the `min()`.
 */
const paidHours = paidCardHours;

interface HelperProfileLike {
  full_name?: string | null;
  role?: string | null;
  hourly_rate?: number | null;
}

interface HelperLogRowLike {
  id: string;
  log_date?: string | null;
  hours_worked?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  is_shop_ticket?: boolean | null;
  /** Supabase typegen models the to-one FK join as an array; runtime is an object. Accept both. */
  profiles?: HelperProfileLike | HelperProfileLike[] | null;
}

/**
 * Assemble the breakdown from already-fetched rows (the job-pnl route reuses
 * its own queries — no double fetch). Pure given its inputs.
 */
export function buildLaborBreakdown(args: {
  job: JobWindow;
  timecards: TimecardRowLike[] | null | undefined;
  helperLogs: HelperLogRowLike[] | null | undefined;
  burdenPct: number;
  now?: Date;
  /**
   * Ids of timecards that reached this job by ATTRIBUTION rather than by a
   * `job_order_id` link (from `attributableTimecards`). Omit and every card is
   * treated as linked, which is the pre-attribution behaviour.
   */
  attributedTimecardIds?: Set<string>;
  /**
   * `attributableTimecards.boundarySegments` — card id → the stretch of that
   * card belonging to THIS job on a day the crew ran more than one. When a card
   * is in here the segment IS its bound, and the on-site window below is not
   * consulted at all: the founder's boundary is the START OF THE NEXT JOB, not
   * this one's completion. Omit and every card keeps the window clip it has
   * today.
   */
  boundarySegments?: Map<string, { start: string; end: string }>;
}): LaborBreakdown {
  const { job, burdenPct } = args;
  const now = args.now ?? new Date();
  const attributedIds = args.attributedTimecardIds ?? new Set<string>();
  const lines: LaborBreakdownLine[] = [];

  for (const t of args.timecards || []) {
    const attributed = attributedIds.has(t.id);
    // WHEN AN ATTRIBUTED CARD IS NOT CUT TO THE JOB WINDOW — AND WHEN IT IS.
    // `work_started_at`/`work_completed_at` are the ON-SITE window of a single
    // visit, and on a multi-day job they only ever hold one of the days —
    // JOB-2026-124747 in production records Aug 6 12:14→19:36 and nothing for
    // Aug 5. Intersecting Dante's 9.54h Aug 5 card with that window yields
    // 0.00h: the day the office is trying to bill would vanish a second time,
    // now with a decimal point on it. On THAT day the card's own span is the
    // right bound, because attribution has already proven the whole day went
    // here (the office placed him on this job and only this job).
    //
    // But that reasoning covers exactly one case: a card on a day the window
    // does not describe. Skipping the clip unconditionally handed the MORE
    // speculative evidence class the MORE generous bound, and production showed
    // what that costs — JOB-2026-343888 billed 18.27 attributed crew-hours
    // against a single-day 11:46→16:38 window its own daily log measured at
    // 4.87h, on the same screen where a LINKED card was clipped 9.76h → 0.61h.
    // So the window is skipped ONLY when the card's day falls outside it; when
    // the day IS inside, the measurement wins, linked or attributed alike.
    // The rule itself is `jobHoursForCard` in lib/labor-cost.ts — shared with
    // the Completed Job Ticket's hours panel, which is read beside this cost
    // while an invoice is being written and must not quote a different figure.
    const paid = paidHours(t);
    const segment = args.boundarySegments?.get(t.id) ?? null;
    // BILLABLE first (the segment's gross clocked span, lunch included — the
    // figure the customer's ticket carries), then the PAYROLL basis for the
    // COST, because payroll does not pay the lunch.
    //
    // "lunch is deducted for employees and still considered billable hours"
    // (founder, Aug 17 2026). A divided day is split on the gross clock, so its
    // segments sum to the card's gross span: Conrade's Aug 19 is 7.03 + 3.55 =
    // 10.58 against 10.09 actually paid. Feeding 10.58 into `laborLine` books
    // half an hour of wage AND burden that no payroll run will ever produce —
    // +2.43 h across the five divided person-days in production today. Every
    // other line in this function is already capped at the card's paid hours;
    // the segment path was the one that was not. See `paidSegmentHours` for the
    // proportional rule and why a lunch-window rule is not available.
    const billable = jobHoursForCard(t, job, attributed, now, undefined, segment);
    const bounded = segment ? paidSegmentHours(t, billable, now) : billable;
    const isShop =
      t.is_shop_hours === true ||
      t.is_shop_time === true ||
      (typeof t.work_location === 'string' && t.work_location.toLowerCase() === 'shop');
    // raw = the card's own paid hours (lunch-adjusted), else its clocked span.
    // An OPEN card has no paid figure yet (`net_hours` is written 0.00 and
    // `total_hours` NULL until clock-out), so its span runs to `now` under the
    // 16h guard — never 0, which would render "0.00h raw" beside live bounded
    // hours and explain nothing.
    const raw = round2(Math.max(paid != null ? paid : cardSpanHours(t, now), bounded));
    const excluded = round2(Math.max(0, raw - bounded));
    const rate = t.hourly_rate != null && Number(t.hourly_rate) > 0 ? Number(t.hourly_rate) : null;
    const math = laborLine(bounded, rate ?? 0, burdenPct);
    lines.push({
      id: t.id,
      source: 'timecard',
      worker_name: t.full_name || 'Unknown',
      role: t.role ?? null,
      date: t.date ?? null,
      // On a divided day the span shown must be the span BILLED, or the screen
      // states a ten-hour clock beside three and a half hours and reads as an
      // error. The card's own clock is still on the timecard.
      span_start: segment?.start ?? t.clock_in_time ?? null,
      span_end: segment?.end ?? t.clock_out_time ?? null,
      raw_hours: raw,
      bounded_hours: bounded,
      excluded_hours: excluded,
      excluded_reason:
        excluded > 0 ? (isShop ? 'shop' : segment ? 'other_job' : 'outside_job_window') : null,
      attributed,
      hourly_rate: rate,
      rate_missing: rate == null && bounded > 0,
      burden_pct: burdenPct,
      base_cost: math.base,
      burden_amount: math.burden,
      total_cost: math.total,
    });
  }

  for (const h of args.helperLogs || []) {
    // Helper logs are already job-scoped rows with their own hours; the only
    // bounding rule that applies is the shop exclusion.
    const raw = round2(Number(h.hours_worked) || 0);
    const isShop = h.is_shop_ticket === true;
    const bounded = isShop ? 0 : raw;
    const excluded = round2(Math.max(0, raw - bounded));
    const profile: HelperProfileLike | null = Array.isArray(h.profiles)
      ? h.profiles[0] ?? null
      : h.profiles || null;
    const rate =
      profile?.hourly_rate != null && Number(profile.hourly_rate) > 0
        ? Number(profile.hourly_rate)
        : null;
    const math = laborLine(bounded, rate ?? 0, burdenPct);
    lines.push({
      id: h.id,
      source: 'helper',
      worker_name: profile?.full_name || 'Unknown',
      role: profile?.role ?? null,
      date: h.log_date ?? null,
      span_start: h.started_at ?? null,
      span_end: h.completed_at ?? null,
      raw_hours: raw,
      bounded_hours: bounded,
      excluded_hours: excluded,
      excluded_reason: excluded > 0 ? 'shop' : null,
      // A helper_work_log is already a job-scoped row — it names this job.
      attributed: false,
      hourly_rate: rate,
      rate_missing: rate == null && bounded > 0,
      burden_pct: burdenPct,
      base_cost: math.base,
      burden_amount: math.burden,
      total_cost: math.total,
    });
  }

  const attributedLines = lines.filter((l) => l.attributed);
  const totals: LaborBreakdownTotals = {
    bounded_hours: round2(lines.reduce((s, l) => s + l.bounded_hours, 0)),
    base: round2(lines.reduce((s, l) => s + l.base_cost, 0)),
    burden: round2(lines.reduce((s, l) => s + l.burden_amount, 0)),
    total: round2(lines.reduce((s, l) => s + l.total_cost, 0)),
    any_rate_missing: lines.some((l) => l.rate_missing),
    line_count: lines.length,
    linked_hours: round2(
      lines.filter((l) => !l.attributed).reduce((s, l) => s + l.bounded_hours, 0)
    ),
    attributed_hours: round2(attributedLines.reduce((s, l) => s + l.bounded_hours, 0)),
    attributed_total: round2(attributedLines.reduce((s, l) => s + l.total_cost, 0)),
    attributed_line_count: attributedLines.length,
  };

  return { burden_pct: burdenPct, lines, totals };
}
