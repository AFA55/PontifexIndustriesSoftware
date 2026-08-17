/**
 * lib/completed-job-days.ts — pairing WORK PERFORMED with THE HOURS IT TOOK,
 * one day at a time, for the Completed Job Ticket screen.
 *
 * WHY THIS SHAPE (founder, Aug 17 2026): "having work performed on one side and
 * their times on the other side, to be able to read data better." He writes
 * invoices BY HAND off this screen. Today the page shows a flat timecard table
 * in one section and a scope-percentage widget in another, so pricing one day's
 * cutting means scrolling between two places and holding the numbers in your
 * head. A day is the unit he bills, so a day is the unit this returns: what was
 * done, and who was on the clock while it was done, side by side.
 *
 * ATTRIBUTED vs CLOCKED. `hours` entries carry `attributed`. An attributed hour
 * came from a day card with no job link that the office's own placement ties to
 * this job (see lib/job-clock-attribution.ts); a clocked hour came from a card
 * tagged with this job. The screen must keep them visually distinct — this is
 * the number an invoice gets written from, and an inferred hour must never wear
 * the authority of a recorded one.
 *
 * Pure: no DB, no `new Date()` beyond formatting-free arithmetic, so every rule
 * here is unit-tested in completed-job-days.test.ts.
 */

import { summarizeWorkItem, type WorkItemLike } from './work-items-format';
import {
  cardSpanHours,
  dropHelperDoubleCountedCards,
  jobHoursForCard,
  paidCardHours as paidHoursRule,
  type JobWindow,
} from './labor-cost';

export interface DayLogLike {
  id?: string | null;
  operator_id?: string | null;
  log_date?: string | null;
  day_number?: number | null;
  hours_worked?: number | null;
  work_performed?: unknown;
  notes?: string | null;
}

export interface DayTimecardLike {
  id: string;
  user_id?: string | null;
  date?: string | null;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  net_hours?: number | null;
  total_hours?: number | null;
  regular_hours?: number | null;
  overtime_hours?: number | null;
  night_shift_premium_hours?: number | null;
  is_shop_hours?: boolean | null;
  is_shop_time?: boolean | null;
  work_location?: string | null;
}

export interface DayHelperLogLike {
  id: string;
  helper_id?: string | null;
  log_date?: string | null;
  hours_worked?: number | null;
  work_description?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  /** Shop tickets are never job labor — same rule the cost path applies. */
  is_shop_ticket?: boolean | null;
}

export interface CompletedDayWork {
  /** Who filed it. '' when the author is unknown. */
  operator_name: string;
  /** One printable line. Never blank. */
  text: string;
  /** 'log' = what the operator wrote; 'item' = a measured work item. */
  kind: 'log' | 'item';
}

export interface CompletedDayHours {
  /** Stable React key. */
  key: string;
  worker_name: string;
  clock_in: string | null;
  clock_out: string | null;
  /** The person's PAID hours for that day (lunch-adjusted). */
  hours: number;
  /**
   * Of `hours`, the part this JOB can be charged — the card clipped to the
   * job's on-site window (attributed cards on a day the window doesn't cover
   * keep their whole day; see `jobHoursForCard`). Equal to `hours` unless the
   * person was on site for only part of their day. This is the figure the Labor
   * Cost breakdown costs, so the two screens quote the same number.
   */
  job_hours: number;
  regular_hours: number | null;
  overtime_hours: number | null;
  night_hours: number | null;
  /** TRUE = inferred from the office's placement, not clocked against this job. */
  attributed: boolean;
  source: 'timecard' | 'helper';
  /** Shop time is never job labor; shown at 0 with the reason. */
  shop: boolean;
}

export interface CompletedJobDay {
  date: string;
  day_number: number | null;
  work: CompletedDayWork[];
  hours: CompletedDayHours[];
  /** Sum of `hours[].hours` (paid), 2dp. */
  total_hours: number;
  /** Sum of `hours[].job_hours` (billable to THIS job), 2dp. */
  total_job_hours: number;
  /** Any hours on this day that were attributed rather than clocked. */
  has_attributed_hours: boolean;
  /**
   * Somebody split this day across jobs, so their card could not be given to
   * anyone. The day is REPORTED as incomplete instead of quietly short.
   */
  unattributable: boolean;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * The hours this card's owner was PAID for, or — on a card still running — the
 * hours they are live for.
 *
 * NAMED `paidOrLiveCardHours`, NOT `paidCardHours`. It used to carry the same
 * exported name as the rule in lib/labor-cost.ts, in a different module, with a
 * different return type (`number` vs `number | null`). Two exported functions
 * with one name across two modules is the exact shape that produced the earlier
 * null-cap bug this file's history documents: an import lands on whichever copy
 * the editor auto-completed, and nothing in the type system objects.
 *
 * THE RULE ITSELF IS `paidCardHours` IN lib/labor-cost.ts and is deliberately
 * not restated here. This file used to carry its own copy, whose comment
 * promised it was "the same rule as `paidHours` in lib/labor-cost-server.ts"
 * while quietly differing: it ran `.map(Number)` BEFORE discarding nulls, and
 * `Number(null) === 0` passes a `>= 0` filter, so a NULL `total_hours` became a
 * zero candidate and won the `min()`. `paidCardHours(net: 5.5, total: null)`
 * returned 0 while the labor-cost modal beside it returned 5.5. It was harmless
 * only because every NULL-`total_hours` row in production also has
 * `net_hours = 0`; the first mid-shift card with real net hours would have put
 * 0.00h on the Work-Performed panel next to the truth in the cost modal. Two
 * screens the office bills from cannot own two copies of one rule.
 *
 * An OPEN card has no paid figure yet (production writes `net_hours = 0.00` and
 * leaves `total_hours` NULL until clock-out), so it falls back to its live
 * clocked span under the same 16h forgotten-clock-out guard the cost path uses.
 */
export function paidOrLiveCardHours(t: DayTimecardLike, now: Date = new Date()): number {
  const paid = paidHoursRule(t);
  return paid != null ? round2(paid) : cardSpanHours(t, now);
}

/** Shop time is never job labor. All THREE flags, not just the one the
 *  `timecards_with_users` view happens to expose. */
export function isShopCard(t: DayTimecardLike): boolean {
  return (
    t.is_shop_hours === true ||
    t.is_shop_time === true ||
    (typeof t.work_location === 'string' && t.work_location.toLowerCase() === 'shop')
  );
}

/**
 * `daily_job_logs.work_performed` is TEXT in production but has historically
 * also held JSON. Render whatever is there as lines rather than dropping it —
 * a note the operator typed and the office never sees is the same class of bug
 * as the missing hours.
 */
export function workPerformedLines(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return workPerformedLines(JSON.parse(trimmed));
      } catch {
        return [trimmed];
      }
    }
    return trimmed
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw.flatMap((r) => workPerformedLines(r));
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const direct = o.description ?? o.text ?? o.work ?? o.summary ?? o.name;
    if (typeof direct === 'string' && direct.trim()) return [direct.trim()];
    return Object.entries(o)
      .filter(([, v]) => v != null && v !== '' && v !== false)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`);
  }
  const s = String(raw).trim();
  return s ? [s] : [];
}

export interface BuildCompletedJobDaysInput {
  logs: DayLogLike[];
  workItems: (WorkItemLike & { work_date?: string | null; day_number?: number | null; operator_id?: string | null; daily_log_id?: string | null })[];
  timecards: DayTimecardLike[];
  helperLogs: DayHelperLogLike[];
  /** user_id → display name. */
  names: Map<string, string | null>;
  /** Card ids that reached this job by attribution rather than a job link. */
  attributedIds?: Set<string>;
  /** Dates nobody's card could be attributed on. */
  splitDates?: Set<string>;
  /** Injectable clock — only reached by OPEN cards, whose hours are still running. */
  now?: Date;
  /**
   * The job's on-site window, used to compute each line's `job_hours`. Omit and
   * job hours equal paid hours (no window to clip against) — which is what this
   * screen showed before the two figures were separated.
   */
  job?: JobWindow;
}

/**
 * Every day this job produced evidence for — a log, a work item, a clock card,
 * or a helper log — with the work and the hours side by side, ascending by date.
 *
 * A day with hours and no filed log still appears (that is exactly the day the
 * office is trying to price), and so does a day with a log and no hours.
 */
export function buildCompletedJobDays(input: BuildCompletedJobDaysInput): CompletedJobDay[] {
  const attributedIds = input.attributedIds ?? new Set<string>();
  const splitDates = input.splitDates ?? new Set<string>();
  const now = input.now ?? new Date();
  const jobWindow: JobWindow | null = input.job ?? null;
  // The same person-day must not arrive twice — once as a helper's own log row
  // and once as their inferred day card. Shared guard, see lib/labor-cost.ts.
  const timecards = dropHelperDoubleCountedCards(
    input.timecards,
    attributedIds,
    input.helperLogs
  );
  const nameOf = (id?: string | null): string =>
    (id ? input.names.get(id) ?? null : null) || '';

  const days = new Map<string, CompletedJobDay>();
  const dayFor = (date: string): CompletedJobDay => {
    const existing = days.get(date);
    if (existing) return existing;
    const created: CompletedJobDay = {
      date,
      day_number: null,
      work: [],
      hours: [],
      total_hours: 0,
      total_job_hours: 0,
      has_attributed_hours: false,
      unattributable: splitDates.has(date),
    };
    days.set(date, created);
    return created;
  };

  // Day numbers come from the log the operator filed; a work item's own
  // day_number is the fallback for days where no log exists.
  for (const log of input.logs) {
    if (!log.log_date) continue;
    const day = dayFor(log.log_date);
    if (day.day_number == null && log.day_number != null) day.day_number = log.day_number;
    const author = nameOf(log.operator_id);
    for (const text of workPerformedLines(log.work_performed)) {
      day.work.push({ operator_name: author, text, kind: 'log' });
    }
    const note = (log.notes ?? '').trim();
    if (note) day.work.push({ operator_name: author, text: note, kind: 'log' });
  }

  // Work items are dated by `work_date`; older rows only carry a `daily_log_id`,
  // so fall back to the date of the log they hang off rather than dropping them.
  const logDateById = new Map<string, string>();
  for (const l of input.logs) if (l.id && l.log_date) logDateById.set(String(l.id), l.log_date);
  for (const item of input.workItems) {
    const date =
      item.work_date ||
      (item.daily_log_id ? logDateById.get(String(item.daily_log_id)) : null) ||
      null;
    if (!date) continue;
    const day = dayFor(date);
    if (day.day_number == null && item.day_number != null) day.day_number = item.day_number;
    const text = summarizeWorkItem(item).trim();
    if (text) day.work.push({ operator_name: nameOf(item.operator_id), text, kind: 'item' });
  }

  for (const t of timecards) {
    if (!t.date) continue;
    const day = dayFor(t.date);
    const shop = isShopCard(t);
    const attributed = attributedIds.has(t.id);
    const hours = shop ? 0 : paidOrLiveCardHours(t, now);
    // Billable to THIS job. Without a window there is nothing to clip against,
    // so job hours are the paid day — the behaviour before the split.
    const jobHours = jobWindow ? Math.min(hours, jobHoursForCard(t, jobWindow, attributed, now)) : hours;
    day.hours.push({
      key: `tc-${t.id}`,
      worker_name: nameOf(t.user_id) || 'Unknown',
      clock_in: t.clock_in_time ?? null,
      clock_out: t.clock_out_time ?? null,
      hours,
      job_hours: jobHours,
      regular_hours: t.regular_hours != null ? round2(num(t.regular_hours)) : null,
      overtime_hours: t.overtime_hours != null ? round2(num(t.overtime_hours)) : null,
      night_hours:
        t.night_shift_premium_hours != null ? round2(num(t.night_shift_premium_hours)) : null,
      attributed,
      source: 'timecard',
      shop,
    });
    if (attributed && hours > 0) day.has_attributed_hours = true;
  }

  for (const h of input.helperLogs) {
    if (!h.log_date) continue;
    const day = dayFor(h.log_date);
    // `is_shop_ticket` was hardcoded false here while the cost path
    // (lib/labor-cost-server.ts) zeroed it — so a helper's shop hours would
    // have been shown as job hours on the ticket and excluded from the cost
    // beside it. Shop time is never job labor, on either screen.
    const shop = h.is_shop_ticket === true;
    const hours = shop ? 0 : round2(num(h.hours_worked));
    day.hours.push({
      key: `hl-${h.id}`,
      worker_name: nameOf(h.helper_id) || 'Helper',
      clock_in: h.started_at ?? null,
      clock_out: h.completed_at ?? null,
      hours,
      // A helper_work_logs row is already job-scoped — its hours ARE job hours.
      job_hours: hours,
      regular_hours: null,
      overtime_hours: null,
      night_hours: null,
      // A helper_work_logs row names this job — it is recorded, not inferred.
      attributed: false,
      source: 'helper',
      shop,
    });
    const desc = (h.work_description ?? '').trim();
    if (desc) day.work.push({ operator_name: nameOf(h.helper_id), text: desc, kind: 'log' });
  }

  for (const day of days.values()) {
    // Clocked hours read first; within a group, earliest clock-in first. The
    // recorded evidence leads and the inferred follows, on every day.
    day.hours.sort((a, b) => {
      if (a.attributed !== b.attributed) return a.attributed ? 1 : -1;
      return (a.clock_in || '').localeCompare(b.clock_in || '');
    });
    day.total_hours = round2(day.hours.reduce((s, h) => s + h.hours, 0));
    day.total_job_hours = round2(day.hours.reduce((s, h) => s + h.job_hours, 0));
  }

  return Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Grand total of PAID hours across every day, 2dp. */
export function totalDayHours(days: CompletedJobDay[]): number {
  return round2(days.reduce((s, d) => s + d.total_hours, 0));
}

/**
 * Grand total of hours billable to THIS job, 2dp — the figure the Labor Cost
 * breakdown costs. Differs from `totalDayHours` when someone's paid day was
 * longer than the time the job was on site.
 */
export function totalJobHours(days: CompletedJobDay[]): number {
  return round2(days.reduce((s, d) => s + d.total_job_hours, 0));
}

/** Of the billable total, the part that rests on attribution. */
export function attributedDayHours(days: CompletedJobDay[]): number {
  return round2(
    days.reduce(
      (s, d) => s + d.hours.filter((h) => h.attributed).reduce((x, h) => x + h.job_hours, 0),
      0
    )
  );
}
