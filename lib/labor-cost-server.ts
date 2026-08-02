/**
 * lib/labor-cost-server.ts — server-side labor-cost aggregation built on the
 * pure math in lib/labor-cost.ts. This is the ONE place that turns a job's
 * timecards + helper logs + wages + tenant burden % into a labor breakdown.
 *
 * Consumers:
 *  - GET /api/admin/job-pnl/[id]        → returns the breakdown to the UI
 *    (job P&L page, completed-jobs modal, completed-job-tickets page all
 *    render labor from that API — no more per-screen hardcoded rates).
 *  - /api/admin/invoices (+ /preview)   → uses the totals for the T&M labor
 *    line when wages are set.
 *
 * Server-only: imports supabaseAdmin. Never import from client components.
 */

import { supabaseAdmin } from './supabase-admin';
import {
  boundedJobHours,
  laborLine,
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
  /** Hours actually attributable to THIS job (bounded; shop-flagged → 0). */
  bounded_hours: number;
  /** raw_hours − bounded_hours (≥ 0). */
  excluded_hours: number;
  /** Why hours were excluded, when they were. */
  excluded_reason: 'shop' | 'outside_job_window' | null;
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
}

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
}): LaborBreakdown {
  const { job, burdenPct } = args;
  const now = args.now ?? new Date();
  const lines: LaborBreakdownLine[] = [];

  for (const t of args.timecards || []) {
    const bounded = boundedJobHours(t, job, now);
    const isShop =
      t.is_shop_hours === true ||
      t.is_shop_time === true ||
      (typeof t.work_location === 'string' && t.work_location.toLowerCase() === 'shop');
    // raw = the card's own paid hours (lunch-adjusted), else its clocked span.
    const spanHours =
      t.clock_in_time && t.clock_out_time
        ? Math.max(0, (new Date(t.clock_out_time).getTime() - new Date(t.clock_in_time).getTime()) / 3600000)
        : 0;
    // Open cards (no clock-out, no total yet) have no span/paid hours — show
    // the bounded figure as the raw too rather than a nonsensical 0 < bounded.
    const raw = round2(
      Math.max(t.total_hours != null ? Number(t.total_hours) || 0 : spanHours, bounded)
    );
    const excluded = round2(Math.max(0, raw - bounded));
    const rate = t.hourly_rate != null && Number(t.hourly_rate) > 0 ? Number(t.hourly_rate) : null;
    const math = laborLine(bounded, rate ?? 0, burdenPct);
    lines.push({
      id: t.id,
      source: 'timecard',
      worker_name: t.full_name || 'Unknown',
      role: t.role ?? null,
      date: t.date ?? null,
      span_start: t.clock_in_time ?? null,
      span_end: t.clock_out_time ?? null,
      raw_hours: raw,
      bounded_hours: bounded,
      excluded_hours: excluded,
      excluded_reason: excluded > 0 ? (isShop ? 'shop' : 'outside_job_window') : null,
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
      hourly_rate: rate,
      rate_missing: rate == null && bounded > 0,
      burden_pct: burdenPct,
      base_cost: math.base,
      burden_amount: math.burden,
      total_cost: math.total,
    });
  }

  const totals: LaborBreakdownTotals = {
    bounded_hours: round2(lines.reduce((s, l) => s + l.bounded_hours, 0)),
    base: round2(lines.reduce((s, l) => s + l.base_cost, 0)),
    burden: round2(lines.reduce((s, l) => s + l.burden_amount, 0)),
    total: round2(lines.reduce((s, l) => s + l.total_cost, 0)),
    any_rate_missing: lines.some((l) => l.rate_missing),
    line_count: lines.length,
  };

  return { burden_pct: burdenPct, lines, totals };
}

/**
 * Fetch-and-assemble variant for callers that don't already hold the rows
 * (invoice generation). Tenant-scoped when tenantId is provided. Returns null
 * only when the job can't be found.
 */
export async function computeJobLaborBreakdown(
  jobId: string,
  tenantId: string | null
): Promise<LaborBreakdown | null> {
  let jobQuery = supabaseAdmin
    .from('job_orders')
    .select('id, tenant_id, work_started_at, route_started_at, work_completed_at')
    .eq('id', jobId);
  if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
  const { data: job, error: jobError } = await jobQuery.maybeSingle();
  if (jobError || !job) return null;

  const [{ data: timecards }, { data: helperLogs }, burdenPct] = await Promise.all([
    supabaseAdmin
      .from('timecards_with_users')
      .select('*')
      .eq('job_order_id', jobId)
      .order('clock_in_time', { ascending: true }),
    supabaseAdmin
      .from('helper_work_logs')
      .select(
        'id, log_date, hours_worked, started_at, completed_at, is_shop_ticket, profiles!helper_work_logs_helper_id_fkey (full_name, role, hourly_rate)'
      )
      .eq('job_order_id', jobId)
      .order('log_date', { ascending: true }),
    getTenantLaborBurdenPct((job as { tenant_id?: string | null }).tenant_id ?? tenantId),
  ]);

  return buildLaborBreakdown({
    job: job as unknown as JobWindow,
    timecards: (timecards || []) as unknown as TimecardRowLike[],
    helperLogs: (helperLogs || []) as unknown as HelperLogRowLike[],
    burdenPct,
  });
}
