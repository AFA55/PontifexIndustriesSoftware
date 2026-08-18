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

import { dateInTz, DEFAULT_TENANT_TZ } from './reminder-timing';

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
  /** `job_orders.status`. Optional — omitted, the booked-span guard never fires. */
  status?: string | null;
  /**
   * The last day the OFFICE BOOKED this job for, bare 'YYYY-MM-DD'. Build it
   * with `bookedEndDateOf(scheduled_end_date, end_date, scheduled_date)` — the
   * LATEST of the three, not the first non-null. Optional, and only ever
   * consulted when there is no `work_completed_at` — see `bookedSpanEndDay`.
   */
  booked_end_date?: string | null;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A FINISHED JOB WITH NO RECORDED END MUST NOT STAY OPEN FOREVER.
 *
 * `work_completed_at` is NULL on 7 of the 16 completed production jobs
 * (audited Aug 17 2026) — including JOB-2026-277097, which the office marked
 * complete but which never got its closing stamp. Everywhere below, a missing
 * completion timestamp degrades the window's end to the CARD's own end, which
 * is not a bound at all: the window silently runs to the end of time. Any card
 * that survives attribution on a later day then books in FULL against a job
 * that finished days earlier. Dante's Wednesday was one office-board gap away
 * from exactly that — 10.37 hours onto a two-day job that ended Tuesday.
 *
 * So when the office has already declared the job COMPLETE and the timestamp is
 * missing, the job's booked span supplies the end instead. That is the office's
 * own record of when the job ran — the same class of evidence as the placement
 * ledger, which this codebase already lets outrank a filed log.
 *
 * DELIBERATELY NARROW, because the opposite error is worse. A job still running
 * routinely overruns its booked end (5 of 107 production assignments and 6 of
 * 60 daily logs sit past it), and zeroing those would delete real work. So the
 * fallback fires ONLY on `status = 'completed'`: a job that is not finished has
 * a booked end that is a PLAN, not a record, and is left alone. Verified
 * against production before shipping — across all 7 completed-with-no-timestamp
 * jobs, zero timecards and zero assignments fall after the booked end, so this
 * changes no existing figure. It is a guard against the next one.
 *
 * Returns null (no guard) whenever a real completion timestamp exists — that
 * case is already handled by the interval intersection.
 */
/**
 * The office's booked END for a job, out of the three columns that can carry
 * one — `scheduled_end_date`, `end_date`, `scheduled_date`.
 *
 * TAKE THE LATEST, NOT THE FIRST NON-NULL. First-non-null was safe against
 * today's data (audited Aug 17 2026: no row has `scheduled_end_date` earlier
 * than its `end_date`, and the only two rows missing both are not completed),
 * but it is safe by luck. A multi-day job completed with ONLY `scheduled_date`
 * populated — the start day — would hand `bookedSpanEndDay` a one-day window
 * and zero out every later day of real, paid work. The MAX can only ever widen
 * the window, and a window that is too wide merely declines to guard; a window
 * that is too narrow deletes hours off an invoice.
 *
 * Non-YMD and null candidates are ignored. Returns null when none survive, in
 * which case the guard does not fire at all.
 */
export function bookedEndDateOf(
  ...candidates: (string | null | undefined)[]
): string | null {
  let latest: string | null = null;
  for (const c of candidates) {
    if (typeof c !== 'string' || !YMD_RE.test(c)) continue;
    if (!latest || c > latest) latest = c;
  }
  return latest;
}

export function bookedSpanEndDay(job: JobWindow): string | null {
  if (job.work_completed_at) return null;
  if (String(job.status || '').toLowerCase() !== 'completed') return null;
  const booked = job.booked_end_date;
  return typeof booked === 'string' && YMD_RE.test(booked) ? booked : null;
}

function toMs(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * The calendar day an instant falls on IN THE TENANT'S TIMEZONE — never UTC.
 *
 * A UTC day is not the day anybody worked: the server runs UTC, so a 22:00 EDT
 * clock-in is "tomorrow" there. Every day comparison below is made in this
 * representation so both sides mean the same thing as `timecards.date`, which
 * is the LOCAL payroll day.
 */
function dayInTz(ms: number, timeZone: string): string {
  return dateInTz(new Date(ms), timeZone) as string;
}

export interface PaidHoursCard {
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  /** Lunch-deducted payroll hours. */
  net_hours?: number | null;
  total_hours?: number | null;
}

/**
 * The hours this card's owner was actually PAID for — the ceiling on what any
 * job can be charged. `null` means NOT YET KNOWN, which is not the same as zero
 * and must never be used as a cap.
 *
 * TAKE THE SMALLER OF `net_hours` AND `total_hours`, AND DO NOT "SIMPLIFY" THIS
 * TO EITHER COLUMN ALONE. The two are written by different paths and NEITHER is
 * reliably the lunch-adjusted one. Across all 298 production timecards (audited
 * Aug 17 2026) they disagree on 18 rows, in BOTH directions:
 *
 *   • 14 rows where `total_hours` is the stale one, high by up to 10.93h
 *     (Keontre Aug 5: net 7.47, gross 7.97, total 8.01);
 *   • 4 rows where `net_hours` is the stale one, high by 0.50h — and on two of
 *     those (Jun 9) `net_hours` equals the raw clock span exactly, meaning no
 *     lunch was deducted at all, while `total_hours` correctly took the 30
 *     minutes off.
 *
 * So the rule is not "net is right and total is stale". It is: whichever value
 * is SMALLER is the one that actually got its deduction applied. `min()` picks
 * correctly on all 18 disagreeing rows, in both directions, and can only ever
 * lower a figure — never raise one — on a screen the office invoices from.
 *
 * TWO NULL TRAPS, both of which shipped as bugs and are pinned by tests:
 *
 *   1. `Number(null) === 0`, and 0 passes a `>= 0` filter, so mapping BEFORE
 *      discarding nulls turns a missing column into a zero cap that wins the
 *      `min()`. A card with net 5.5 and total NULL then books 0.00h.
 *   2. An OPEN card (never clocked out) has NOT had its payroll columns written
 *      yet: production writes `net_hours = 0.00` and leaves `total_hours` NULL
 *      on every one of the 9 open cards. Zero there means "not computed", not
 *      "worked nothing" — capping at it makes a live job read 0.00h / $0 while
 *      the operator is still on site. A zero on an open card is therefore
 *      dropped, not believed. A zero on a CLOSED card is a real payroll figure
 *      and is honoured.
 */
export function paidCardHours(card: PaidHoursCard): number | null {
  const isOpen = !card.clock_out_time;
  const candidates = [card.net_hours, card.total_hours]
    .filter((v) => v != null)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .filter((n) => !(isOpen && n === 0));
  return candidates.length > 0 ? round2(Math.min(...candidates)) : null;
}

/**
 * The card's own clocked span in hours. An open card runs to `now`, capped by
 * the 16h forgotten-clock-out guard — the same end `boundedJobHours` uses, so
 * the "raw" figure a screen shows beside bounded hours can never be smaller
 * than the bounded one it explains.
 */
export function cardSpanHours(card: PaidHoursCard, now: Date = new Date()): number {
  const clockIn = toMs(card.clock_in_time);
  if (clockIn == null) return 0;
  const clockOut = toMs(card.clock_out_time);
  const end =
    clockOut != null
      ? clockOut
      : Math.min(now.getTime(), clockIn + MAX_DAILY_LOG_HOURS * 3600000);
  return round2(Math.max(0, (end - clockIn) / 3600000));
}

/**
 * Does this card's DAY fall inside the job's on-site window?
 *
 * This is the guard on skipping the window clip for an ATTRIBUTED card.
 * `work_started_at`/`work_completed_at` hold ONE visit, so on a multi-day job
 * they cover one day and intersecting another day's card against them yields
 * 0.00h — the day the office is trying to bill vanishes (JOB-2026-124747: card
 * Aug 5, window Aug 6 only). But when the card IS on a day the window covers,
 * the window is real measured evidence about that day and skipping it lets the
 * more speculative evidence class carry the more generous bound. Production,
 * before this guard: JOB-2026-343888 booked 18.27 crew-hours against a 4.87h
 * single-day window its own daily log agreed with, while a LINKED card on
 * JOB-2026-929434 was clipped from 9.76h to 0.61h. So: clip whenever the
 * evidence exists, skip only for the genuine other-day case.
 *
 * ONE DAY PER CARD, BY PRECEDENCE — NEVER A UNION OF TWO REPRESENTATIONS.
 *
 * This test used to add BOTH `card.date` AND the UTC day of `clock_in_time` to
 * a set and return "inside" if EITHER landed in range. "Inside" is the answer
 * that APPLIES the clip, so the union could only ever clip MORE — and for an
 * evening card the two representations disagree by a day. A 22:00–06:00 night
 * card dated 2026-08-14 (UTC day 2026-08-15) against an Aug 15 08:00–16:00
 * window tested "inside" via the UTC day alone, and the clip against a window
 * its hours never touched returned 0.00h of 8.00 paid — an entire night's work
 * gone, labelled "off job", with nothing on screen explaining why.
 *
 * So: `card.date` ALONE when it carries one. It is the payroll day of record,
 * the day the office is billing, and all 298 production cards agree with the
 * LOCAL date (297 with UTC). The clock-in timestamp is the FALLBACK for a card
 * with no date, and it is read in the TENANT'S timezone, because a UTC day is
 * not a day anybody worked. Both window bounds are converted the same way, so
 * the comparison is local-day against local-day throughout.
 *
 * `timeZone` defaults to the platform default (`DEFAULT_TENANT_TZ`, Patriot's).
 * Callers that know the tenant's zone should pass it; see lib/tenant-timezone.ts.
 */
export function cardDayIsInsideJobWindow(
  card: PaidHoursCard & { date?: string | null },
  job: JobWindow,
  timeZone: string = DEFAULT_TENANT_TZ
): boolean {
  const startMs = toMs(job.work_started_at) ?? toMs(job.route_started_at);
  const endMs = toMs(job.work_completed_at);
  // A completed job with no closing stamp still has an end: its booked span.
  const endDay = endMs != null ? dayInTz(endMs, timeZone) : bookedSpanEndDay(job);
  if (startMs == null && endDay == null) return false; // no window to clip against

  const cardDay = cardPayrollDay(card, timeZone);
  if (cardDay == null) return false;

  const startDay = startMs != null ? dayInTz(startMs, timeZone) : null;
  if (startDay && cardDay < startDay) return false;
  if (endDay && cardDay > endDay) return false;
  return true;
}

/**
 * The ONE day a card belongs to: its `date` column (the payroll day of record)
 * when it holds a real YYYY-MM-DD, else the tenant-local day of its clock-in.
 * Exported so the rule is testable on its own and so nothing re-derives it.
 */
export function cardPayrollDay(
  card: PaidHoursCard & { date?: string | null },
  timeZone: string = DEFAULT_TENANT_TZ
): string | null {
  if (typeof card.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(card.date)) return card.date;
  const clockIn = toMs(card.clock_in_time);
  return clockIn != null ? dayInTz(clockIn, timeZone) : null;
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

/**
 * THE hours one card contributes to one job — the whole rule, in one call, for
 * every screen that puts a job-hour figure in front of the office.
 *
 * `boundedJobHours` is the intersection math; this adds the two policy layers
 * that sit on top of it and that used to live only in the cost path:
 *   • the paid-hours cap (`paidCardHours`), so a job can never be charged more
 *     than its owner was paid, and an OPEN card's not-yet-written 0.00 is not
 *     mistaken for a cap of zero;
 *   • the attributed-card window skip, which applies ONLY when the card's day
 *     falls outside the job's on-site window (see `cardDayIsInsideJobWindow`).
 *
 * It lives here, pure and shared, because the Completed Job Ticket's hours
 * panel and the Labor Cost breakdown beside it are read together while an
 * invoice is being written. When the clip rule lived in the cost path alone,
 * tightening it made the ticket say 18.27h next to a cost built on 9.74h.
 */
export function jobHoursForCard(
  // Deliberately looser than `BoundableCard`: the row shapes on the day-panel
  // path declare these columns OPTIONAL (`string | null | undefined`), and
  // widening here is safer than casting at each call site.
  card: PaidHoursCard & {
    date?: string | null;
    is_shop_hours?: boolean | null;
    is_shop_time?: boolean | null;
    work_location?: string | null;
  },
  job: JobWindow,
  attributed: boolean,
  now: Date = new Date(),
  /** Zone the card's day is read in when it has no `date` column, and the zone
   *  the window's own days are derived in. Defaults to the platform default. */
  timeZone: string = DEFAULT_TENANT_TZ
): number {
  // THE JOB WAS OVER. A card dated after the last day a COMPLETED job was
  // booked for contributes nothing to it, linked or attributed alike — see
  // `bookedSpanEndDay` for why this fires only when the closing timestamp is
  // missing, and only on a job the office has already marked complete.
  const bookedEnd = bookedSpanEndDay(job);
  if (bookedEnd) {
    const cardDay = cardPayrollDay(card, timeZone);
    if (cardDay && cardDay > bookedEnd) return 0;
  }

  const clipToWindow = !attributed || cardDayIsInsideJobWindow(card, job, timeZone);
  const window: JobWindow = clipToWindow
    ? job
    : { work_started_at: null, route_started_at: null, work_completed_at: null };
  const bounded: BoundableCard = {
    clock_in_time: card.clock_in_time ?? null,
    clock_out_time: card.clock_out_time ?? null,
    total_hours: paidCardHours(card),
    is_shop_hours: card.is_shop_hours,
    is_shop_time: card.is_shop_time,
    work_location: card.work_location,
  };
  return boundedJobHours(bounded, window, now);
}

/**
 * DON'T BILL THE SAME PERSON-DAY TWICE.
 *
 * A helper's hours can arrive by two roads — their own `helper_work_logs` row
 * for this job, and their clock card. Today every production
 * `helper_work_logs.hours_worked` is NULL, so the helper line contributes 0 and
 * the card is the only real source; the day that column starts being written,
 * attributing the card ON TOP of it doubles the helper's hours.
 *
 * The recorded helper log wins and the INFERRED card stands down. A card
 * explicitly LINKED to this job is never dropped — that is a recorded fact, not
 * an inference, and two recorded facts about the same day are a data problem to
 * surface, not one to silently resolve here.
 *
 * Lives in this pure module (not next to the query that first needed it) so the
 * P&L route, the completion-summary route and the day-by-day builder all apply
 * the same guard instead of one of the three growing it and the others not.
 * Idempotent — applying it twice changes nothing.
 */
export interface HelperDayClaim {
  helper_id?: string | null;
  log_date?: string | null;
  hours_worked?: number | null;
}
export function dropHelperDoubleCountedCards<
  T extends { id: string; user_id?: string | null; date?: string | null }
>(cards: T[], attributedIds: Set<string>, helperLogs: HelperDayClaim[] | null | undefined): T[] {
  const claimed = new Set(
    (helperLogs || [])
      .filter((h) => h.helper_id && h.log_date && Number(h.hours_worked) > 0)
      .map((h) => `${h.helper_id}|${h.log_date}`)
  );
  if (claimed.size === 0) return cards;
  return cards.filter(
    (c) => !(attributedIds.has(c.id) && claimed.has(`${c.user_id}|${c.date}`))
  );
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
