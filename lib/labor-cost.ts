/**
 * lib/labor-cost.ts — THE single source of truth for job-hours bounding and
 * labor-cost math. Pure functions only (no DB, no Date.now() except as an
 * injectable default) so every rule here is unit-testable.
 *
 * Why this exists (founder, Aug 1 2026):
 *  - A job showed 57 hours for ~a day's work: daily-log hours were written from
 *    a WHOLE timecard or a wall-clock fallback that crossed calendar days
 *    (verified prod row: 52.59h because job_orders.work_started_at survived
 *    from 2 days earlier).
 *  - Labor cost was invented per-screen from hardcoded rates ($75 / $125-187.5
 *    / $0 for the same job). Real cost = bounded hours × the operator's wage
 *    (profiles.hourly_rate) × (1 + tenant labor-burden %).
 *
 * ROUNDING RULES (payroll-grade, keep consistent everywhere):
 *  - Hours: rounded to 2 decimals per card/line (round2).
 *  - Money: rounded to 2 decimals AT THE LINE LEVEL (base, then burden from the
 *    rounded base, then total = base + burden). Grand totals are sums of the
 *    already-rounded lines re-rounded to 2dp — never re-derived from raw hours.
 *
 * LUNCH: v1 does NOT model lunch inside the interval intersection (the P&L
 * route costs cards off timecards.total_hours, which clock-out already
 * lunch-adjusts). We mirror that by CAPPING bounded hours at the card's
 * total_hours — job hours can never exceed the card's paid hours, so a
 * full-card intersection inherits the lunch deduction. A partial intersection
 * uses the raw span (slightly conservative-high); modelling lunch position
 * inside the span is a future refinement, documented here on purpose.
 */

/** Default labor burden % applied on top of raw wages (payroll taxes, comp, insurance). */
export const DEFAULT_LABOR_BURDEN_PCT = 25;

/**
 * Hard ceiling for a single daily-log day and for an OPEN (never clocked-out)
 * timecard's contribution. Nobody works more than 16h in one field day; beyond
 * that it's a forgotten clock-out / stale timestamp, not labor.
 */
export const MAX_DAILY_LOG_HOURS = 16;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface BoundableCard {
  clock_in_time: string | null;
  clock_out_time: string | null;
  /** Lunch-adjusted paid hours from clock-out; caps the bounded result. */
  total_hours: number | null;
  is_shop_hours?: boolean | null;
  is_shop_time?: boolean | null;
  work_location?: string | null;
}

export interface JobWindow {
  work_started_at: string | null;
  route_started_at: string | null;
  work_completed_at: string | null;
}

function toMs(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Bounded job hours for one timecard against one job.
 *
 * THE bounding rule:
 *   card span   = [clock_in, clock_out ?? min(now, clock_in + 16h)]
 *                 (the 16h guard keeps a forgotten open card from booking days)
 *   job window  = [work_started_at ?? route_started_at ?? clock_in,
 *                  work_completed_at ?? clock_out ?? cardEnd]
 *   hours       = max(0, overlap(card span, job window)) in hours
 *   then: shop-flagged card → 0 (shop time is never job labor);
 *         cap at total_hours when present (mirrors the lunch deduction);
 *         round to 2dp.
 *
 * A stale job window (e.g. work_started_at from 2 days earlier) can only WIDEN
 * the window — the card span still bounds the result, which is exactly the fix
 * for the 52.59h prod row. A clock-out hours after work_completed_at is cut at
 * work_completed_at (post-job time isn't job labor).
 */
export function boundedJobHours(
  card: BoundableCard,
  job: JobWindow,
  now: Date = new Date()
): number {
  // Shop-flagged cards contribute zero job hours, always.
  if (card.is_shop_hours === true || card.is_shop_time === true) return 0;
  if (typeof card.work_location === 'string' && card.work_location.toLowerCase() === 'shop') return 0;

  const clockIn = toMs(card.clock_in_time);
  if (clockIn == null) return 0;
  const clockOut = toMs(card.clock_out_time);

  // Open card guard: an un-clocked-out card ends at `now`, but never more than
  // MAX_DAILY_LOG_HOURS after clock-in (forgotten clock-outs must not book days).
  const openCap = clockIn + MAX_DAILY_LOG_HOURS * 3600000;
  const cardEnd = clockOut != null ? clockOut : Math.min(now.getTime(), openCap);
  if (cardEnd <= clockIn) return 0;

  const windowStart = toMs(job.work_started_at) ?? toMs(job.route_started_at) ?? clockIn;
  const windowEnd = toMs(job.work_completed_at) ?? clockOut ?? cardEnd;

  const overlapMs = Math.min(cardEnd, windowEnd) - Math.max(clockIn, windowStart);
  let hours = Math.max(0, overlapMs / 3600000);

  // Mirror the lunch deduction: job hours can never exceed the card's paid hours.
  const paid = card.total_hours;
  if (paid != null && Number.isFinite(Number(paid)) && Number(paid) >= 0) {
    hours = Math.min(hours, Number(paid));
  }

  return round2(hours);
}

export interface LaborLineMath {
  /** hours × rate × multiplier, rounded 2dp. */
  base: number;
  /** base × burdenPct/100, rounded 2dp (computed FROM the rounded base). */
  burden: number;
  /** base + burden (already-rounded parts; exact to the cent). */
  total: number;
}

/**
 * Money math for one labor line. Round at the LINE level:
 * base first, burden from the rounded base, total = sum of the two.
 * `multiplier` supports future OT/night premiums (1 = straight time).
 */
export function laborLine(
  hours: number,
  hourlyRate: number,
  burdenPct: number,
  multiplier = 1
): LaborLineMath {
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 0;
  const safeRate = Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : 0;
  const safePct = Number.isFinite(burdenPct) && burdenPct >= 0 ? burdenPct : 0;
  const base = round2(safeHours * safeRate * multiplier);
  const burden = round2(base * (safePct / 100));
  return { base, burden, total: round2(base + burden) };
}

/**
 * Cap helper for daily_job_logs.hours_worked: clamp to [0, maxPerDay], 2dp.
 * Used by the daily-log route's wall-clock fallback and by repair scripts.
 */
export function clampDailyLogHours(
  hours: number,
  maxPerDay: number = MAX_DAILY_LOG_HOURS
): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return round2(Math.min(hours, maxPerDay));
}
