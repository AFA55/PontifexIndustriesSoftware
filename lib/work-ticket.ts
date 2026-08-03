/**
 * lib/work-ticket.ts — pure grouping/total math for the printed WORK TICKET.
 *
 * The founder's paper ticket (Patriot's carbon-copy form) needs work performed
 * separated BY DAY and, within a day, BY OPERATOR — plus a per-day
 * Date/Start/End/Lunch/Total row and a grand TOTAL TIME for a whole week.
 *
 * Everything here is pure (no supabase, no Date.now() except an injectable
 * default) so the rules are unit-tested in lib/work-ticket.test.ts. The API
 * route (/api/admin/jobs/[id]/work-ticket) does the fetching and feeds rows in;
 * the print page only renders what comes back.
 *
 * DATE DISCIPLINE: every calendar date here is a bare 'YYYY-MM-DD' compared as
 * a STRING (lexicographic == chronological for ISO dates). Timestamps are only
 * converted to a date via lib/dates' toLocalYMD — never toISOString().
 */

import { mondayOf, weekDatesFrom, toLocalYMD } from './dates';
import { round2 } from './labor-cost';
import type { WorkItemLike } from './work-items-format';

// ── Modes & ranges ──────────────────────────────────────────────────────────

export type TicketMode = 'day' | 'week';

export interface TicketRange {
  /** inclusive bare 'YYYY-MM-DD' */
  from: string;
  /** inclusive bare 'YYYY-MM-DD' */
  to: string;
}

/**
 * The date window a ticket covers.
 *  - day  → just the anchor date
 *  - week → the Mon–Sun week containing the anchor (lib/dates.mondayOf)
 */
export function ticketRange(mode: TicketMode, anchorYMD: string): TicketRange {
  if (mode === 'week') {
    const days = weekDatesFrom(mondayOf(anchorYMD));
    return { from: days[0], to: days[days.length - 1] };
  }
  return { from: anchorYMD, to: anchorYMD };
}

/** Inclusive bare-date membership test (string compare — ISO dates sort right). */
export function inRange(ymd: string | null | undefined, range: TicketRange): boolean {
  return !!ymd && ymd >= range.from && ymd <= range.to;
}

/**
 * The date the office most likely wants pre-selected.
 * Day mode  → today when the crew worked today, otherwise the LAST worked day.
 * Week mode → same anchor (the caller turns it into a Mon–Sun range); this way
 *             a job that finished last week opens on the week it was worked
 *             instead of an empty current week.
 * Falls back to `today` when nothing has been worked yet.
 */
export function defaultAnchorDate(datesWorked: string[], today: string): string {
  if (datesWorked.includes(today)) return today;
  const past = datesWorked.filter((d) => d <= today);
  if (past.length > 0) return past[past.length - 1];
  return datesWorked.length > 0 ? datesWorked[0] : today;
}

// ── Crew roles ──────────────────────────────────────────────────────────────

export type CrewRole = 'lead' | 'operator' | 'helper' | 'crew';

/** Printed label next to each person's name on the ticket. */
export const CREW_ROLE_LABEL: Record<CrewRole, string> = {
  lead: 'Lead',
  operator: 'Operator',
  helper: 'Helper',
  crew: 'Crew',
};

const ROLE_RANK: Record<CrewRole, number> = { lead: 0, operator: 1, helper: 2, crew: 3 };

export interface CrewRoleSource {
  assigned_to?: string | null;
  helper_assigned_to?: string | null;
  /** job_crew rows (role 'operator' | 'helper'). */
  crew?: Array<{ user_id: string; role?: string | null }> | null;
}

/**
 * user_id → printed role. `job_orders.assigned_to` is the LEAD and always wins;
 * `helper_assigned_to` is a helper; job_crew fills in the rest. Anyone who shows
 * up only in timecards/logs is labelled 'crew' by the day builder.
 */
export function resolveCrewRoles(src: CrewRoleSource): Map<string, CrewRole> {
  const roles = new Map<string, CrewRole>();
  for (const row of src.crew || []) {
    if (!row?.user_id) continue;
    const r = String(row.role || '').toLowerCase();
    roles.set(row.user_id, r === 'helper' ? 'helper' : r === 'operator' ? 'operator' : 'crew');
  }
  if (src.helper_assigned_to) roles.set(src.helper_assigned_to, 'helper');
  // The lead is set LAST so a stale job_crew row can never demote them.
  if (src.assigned_to) roles.set(src.assigned_to, 'lead');
  return roles;
}

// ── Source row shapes (mirror the DB columns the route selects) ─────────────

export interface TicketTimecardRow {
  id: string;
  user_id: string;
  date: string | null;
  clock_in_time: string | null;
  clock_out_time: string | null;
  lunch_duration_minutes?: number | null;
  break_minutes?: number | null;
  net_hours?: number | null;
  total_hours?: number | null;
  is_shop_hours?: boolean | null;
  is_shop_time?: boolean | null;
  work_location?: string | null;
}

/**
 * Shop time is never job labor — `boundedJobHours` (lib/labor-cost.ts) zeroes
 * these cards, so the customer's ticket must not bill them either. A shop card
 * CAN carry a job_order_id (the crew loaded for this job at the yard).
 */
export function isShopCard(tc: TicketTimecardRow): boolean {
  return (
    tc.is_shop_hours === true ||
    tc.is_shop_time === true ||
    String(tc.work_location || '').trim().toLowerCase() === 'shop'
  );
}

export interface TicketDailyLog {
  id: string;
  operator_id: string | null;
  log_date: string | null;
  day_number?: number | null;
  hours_worked?: number | null;
  work_performed?: unknown;
  notes?: string | null;
}

export interface TicketWorkItem extends WorkItemLike {
  id: string;
  operator_id?: string | null;
  daily_log_id?: string | null;
  created_at?: string | null;
  accessibility_rating?: number | null;
  accessibility_description?: string | null;
}

export interface TicketHelperLog {
  helper_id: string;
  log_date: string | null;
  work_description?: string | null;
  hours_worked?: number | null;
}

// ── Work-item → calendar date ───────────────────────────────────────────────

/**
 * `work_items` has NO date column — only `day_number`, an optional
 * `daily_log_id`, and `created_at`. Resolution order (most→least trustworthy):
 *   1. daily_log_id        → that log's log_date
 *   2. same operator + day_number → that log's log_date
 *   3. any log with the same day_number → its log_date
 *   4. created_at          → the LOCAL calendar date (never toISOString)
 * Returns null when nothing resolves (the caller drops the item rather than
 * printing it under a guessed day).
 */
export function resolveWorkItemDate(
  item: TicketWorkItem,
  logs: TicketDailyLog[]
): string | null {
  if (item.daily_log_id) {
    const byId = logs.find((l) => l.id === item.daily_log_id);
    if (byId?.log_date) return byId.log_date;
  }
  const day = item.day_number == null ? null : Number(item.day_number);
  if (day != null && Number.isFinite(day)) {
    const sameOp = logs.find(
      (l) => l.log_date && Number(l.day_number) === day && l.operator_id === (item.operator_id ?? null)
    );
    if (sameOp?.log_date) return sameOp.log_date;
    // Step 3 borrows a log that belongs to SOMEONE ELSE. `day_number` is
    // job-level on daily_job_logs but client-supplied on work_items, so on a
    // crew day the two can desync and this would date one operator's work off
    // another's log. Only allowed when the item has no operator of its own — a
    // blank line beats a wrong day on a customer-signed sheet.
    if (!item.operator_id) {
      const anyOp = logs.find((l) => l.log_date && Number(l.day_number) === day);
      if (anyOp?.log_date) return anyOp.log_date;
    }
  }
  if (item.created_at) {
    const d = new Date(item.created_at);
    if (!Number.isNaN(d.getTime())) return toLocalYMD(d);
  }
  return null;
}

/**
 * `daily_job_logs.work_performed` is a jsonb array written by the operator app
 * in a DIFFERENT shape than `work_items` rows (`{type, quantity, depth,
 * details}`). Normalize it to WorkItemLike so the SHARED formatter
 * (workItemDetailLine) renders it — we never re-implement measurement text.
 */
export function normalizeLoggedWork(raw: unknown): WorkItemLike[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const e = (entry || {}) as Record<string, any>;
      const depth = Number(e.depth);
      return {
        work_type: e.work_type || e.type || e.name || 'Work',
        quantity: e.quantity != null ? Number(e.quantity) : null,
        linear_feet_cut: e.linear_feet_cut != null ? Number(e.linear_feet_cut) : null,
        cut_depth_inches: Number.isFinite(depth) && depth > 0 ? depth : null,
        core_quantity: e.core_quantity != null ? Number(e.core_quantity) : null,
        core_size: e.core_size ?? null,
        core_depth_inches: e.core_depth_inches != null ? Number(e.core_depth_inches) : null,
        notes: typeof e.notes === 'string' ? e.notes : null,
        // The offline/localStorage payload names it `details`, the DB `details_json`.
        details_json: e.details_json ?? e.details ?? null,
      } as WorkItemLike;
    })
    .filter((w) => w.work_type);
}

const MEASUREMENT_KEYS = [
  'linear_feet_cut',
  'cut_depth_inches',
  'core_quantity',
  'core_size',
  'core_depth_inches',
  'details_json',
] as const;

const typeKey = (v: unknown): string => String(v || '').trim().toLowerCase();

/**
 * Back-fill measurements a `work_items` row is missing from the matching entry
 * in the daily log's `work_performed` copy (matched on work_type). Never
 * overwrites a value the row already has, and never adds a line — this only
 * makes an existing line more complete.
 *
 * AMBIGUITY GUARD: matching is by work_type alone, so two "Core Drilling" rows
 * on one person-day would both inherit the FIRST log entry's size/depth — an
 * INVENTED measurement on a customer-signed document. When a type appears more
 * than once on either side, that type is skipped entirely and the row prints
 * exactly what it stored.
 */
export function enrichFromLoggedWork<T extends WorkItemLike>(
  items: T[],
  logged: WorkItemLike[]
): T[] {
  if (logged.length === 0) return items;

  const loggedCount = new Map<string, number>();
  const byType = new Map<string, WorkItemLike>();
  for (const l of logged) {
    const key = typeKey(l.work_type);
    if (!key) continue;
    loggedCount.set(key, (loggedCount.get(key) || 0) + 1);
    if (!byType.has(key)) byType.set(key, l);
  }
  const itemCount = new Map<string, number>();
  for (const i of items) {
    const key = typeKey(i.work_type);
    if (key) itemCount.set(key, (itemCount.get(key) || 0) + 1);
  }

  return items.map((item) => {
    const key = typeKey(item.work_type);
    // Unambiguous only when exactly one row and exactly one log entry of the type.
    if (!key || itemCount.get(key) !== 1 || loggedCount.get(key) !== 1) return item;
    const match = byType.get(key);
    if (!match) return item;
    const patch: Record<string, unknown> = {};
    for (const key of MEASUREMENT_KEYS) {
      const current = (item as Record<string, unknown>)[key];
      const incoming = (match as Record<string, unknown>)[key];
      const empty = current == null || current === 0 || current === '';
      if (empty && incoming != null && incoming !== 0 && incoming !== '') patch[key] = incoming;
    }
    return Object.keys(patch).length > 0 ? { ...item, ...patch } : item;
  });
}

/**
 * The printed measurement text for one work line. Delegates to the SHARED
 * formatter and only adds a fallback the formatter can't express: an item that
 * carries a depth but no linear feet / holes (e.g. a wall-saw row logged as
 * `quantity` + `depth`) still tells the office how deep the cut was.
 */
export function ticketWorkDetail(
  item: WorkItemLike,
  format: (i: WorkItemLike) => string
): string {
  const detail = format(item);
  if (detail) return detail;
  const depth = num(item.cut_depth_inches) || num(item.core_depth_inches);
  return depth > 0 ? `${depth}" deep` : '';
}

// ── Per-day / per-operator assembly ─────────────────────────────────────────

export interface TicketPersonDay {
  user_id: string;
  name: string;
  role: CrewRole;
  /** ISO timestamps — earliest clock-in / latest clock-out across the day's cards. */
  clock_in: string | null;
  clock_out: string | null;
  /** Summed lunch minutes for the day (lunch_duration_minutes, else break_minutes). */
  lunch_minutes: number | null;
  /** Summed paid hours for the day (timecard net/total, else the daily log). */
  hours: number | null;
  /** Structured operator submissions for this person on this date. */
  work_items: TicketWorkItem[];
  /** daily_job_logs.work_performed — ONLY when this person filed no work_items. */
  logged_work: WorkItemLike[];
  /** Free-text day note off daily_job_logs (internal — office use). */
  log_note: string | null;
  /** helper_work_logs.work_description for helpers (internal — office use). */
  helper_note: string | null;
}

export interface TicketDay {
  date: string;
  people: TicketPersonDay[];
  /** Sum of every person's hours that day (grand TOTAL TIME rolls these up). */
  total_hours: number;
}

export interface BuildTicketDaysInput {
  range: TicketRange;
  timecards: TicketTimecardRow[];
  logs: TicketDailyLog[];
  workItems: TicketWorkItem[];
  helperLogs?: TicketHelperLog[];
  /** user_id → printed role (resolveCrewRoles). */
  roles: Map<string, CrewRole>;
  /** user_id → full name. */
  names: Map<string, string | null>;
  /** Fallback owner for work_items with a null operator_id (usually the lead). */
  fallbackOperatorId?: string | null;
}

const UNASSIGNED = '__unassigned__';

function blankPerson(userId: string, input: BuildTicketDaysInput): TicketPersonDay {
  return {
    user_id: userId,
    name: input.names.get(userId) || (userId === UNASSIGNED ? 'Crew' : 'Crew member'),
    role: input.roles.get(userId) || 'crew',
    clock_in: null,
    clock_out: null,
    lunch_minutes: null,
    hours: null,
    work_items: [],
    logged_work: [],
    log_note: null,
    helper_note: null,
  };
}

/**
 * The core of the ticket: [{ date, people: [{ name, role, times, hours, work }] }].
 *
 * Multiple timecards for one person on one day (a re-clock-in after a bad
 * clock-out — real in prod) collapse into ONE row: earliest in, latest out,
 * summed lunch, summed hours. That is what the paper day block has room for.
 */
export function buildTicketDays(input: BuildTicketDaysInput): TicketDay[] {
  const { range } = input;
  const byDate = new Map<string, Map<string, TicketPersonDay>>();

  const bucket = (date: string, userId: string): TicketPersonDay => {
    let day = byDate.get(date);
    if (!day) {
      day = new Map();
      byDate.set(date, day);
    }
    let person = day.get(userId);
    if (!person) {
      person = blankPerson(userId, input);
      day.set(userId, person);
    }
    return person;
  };

  // 1. Clock times — the payroll truth for Start / End / Lunch / Total.
  for (const tc of input.timecards) {
    if (!inRange(tc.date, range) || !tc.user_id) continue;
    if (isShopCard(tc)) continue; // shop time is not job labor — never bill it here
    const p = bucket(tc.date as string, tc.user_id);
    if (tc.clock_in_time && (!p.clock_in || tc.clock_in_time < p.clock_in)) p.clock_in = tc.clock_in_time;
    if (tc.clock_out_time && (!p.clock_out || tc.clock_out_time > p.clock_out)) p.clock_out = tc.clock_out_time;
    const lunch = tc.lunch_duration_minutes ?? tc.break_minutes;
    if (lunch != null && Number.isFinite(Number(lunch))) {
      p.lunch_minutes = (p.lunch_minutes ?? 0) + Number(lunch);
    }
    const hrs = tc.net_hours ?? tc.total_hours;
    if (hrs != null && Number.isFinite(Number(hrs))) {
      p.hours = round2((p.hours ?? 0) + Number(hrs));
    }
  }

  // 2. Daily logs — the day note + an hours fallback when no card was clocked
  //    to this job (the crew clocked a general day card instead).
  for (const log of input.logs) {
    if (!inRange(log.log_date, range)) continue;
    const userId = log.operator_id || input.fallbackOperatorId || UNASSIGNED;
    const p = bucket(log.log_date as string, userId);
    if (log.notes && String(log.notes).trim()) p.log_note = String(log.notes).trim();
    if (p.hours == null && log.hours_worked != null && Number.isFinite(Number(log.hours_worked))) {
      p.hours = round2(Number(log.hours_worked));
    }
  }

  // 3. Work items — the measurements, attributed to the operator who filed them.
  for (const item of input.workItems) {
    const date = resolveWorkItemDate(item, input.logs);
    if (!inRange(date, range)) continue;
    const userId = item.operator_id || input.fallbackOperatorId || UNASSIGNED;
    bucket(date as string, userId).work_items.push(item);
  }

  // 4. Helper work logs — the light per-helper narrative.
  for (const hl of input.helperLogs || []) {
    if (!inRange(hl.log_date, range) || !hl.helper_id) continue;
    const p = bucket(hl.log_date as string, hl.helper_id);
    const text = (hl.work_description || '').trim();
    if (text) p.helper_note = text;
    if (p.hours == null && hl.hours_worked != null && Number.isFinite(Number(hl.hours_worked))) {
      p.hours = round2(Number(hl.hours_worked));
    }
  }

  // 5. Reconcile the daily log's work_performed copy with the work_items rows.
  //    They are two records of the SAME submission, so printing both would
  //    duplicate every cut. Instead:
  //      - no work_items → print the log copy
  //      - has work_items → keep them, but back-fill any measurement the log
  //        copy carries and the row lost (real prod case: the work_items row
  //        had only `quantity`, the log copy also had the 6" depth).
  for (const log of input.logs) {
    if (!inRange(log.log_date, range)) continue;
    const userId = log.operator_id || input.fallbackOperatorId || UNASSIGNED;
    const p = bucket(log.log_date as string, userId);
    const logged = normalizeLoggedWork(log.work_performed);
    if (p.work_items.length === 0) p.logged_work = logged;
    else p.work_items = enrichFromLoggedWork(p.work_items, logged);
  }

  return Array.from(byDate.keys())
    .sort()
    .map((date) => {
      const people = Array.from(byDate.get(date)!.values()).sort((a, b) => {
        const rank = ROLE_RANK[a.role] - ROLE_RANK[b.role];
        return rank !== 0 ? rank : a.name.localeCompare(b.name);
      });
      const total = people.reduce((s, p) => s + (p.hours ?? 0), 0);
      return { date, people, total_hours: round2(total) };
    });
}

/** Grand TOTAL TIME across the printed range (week mode's headline number). */
export function grandTotalHours(days: TicketDay[]): number {
  return round2(days.reduce((s, d) => s + (d.total_hours || 0), 0));
}

/**
 * Every calendar date this job was actually worked, ascending — drives the
 * quick-pick chips and the default anchor date.
 */
export function datesWorked(
  timecards: TicketTimecardRow[],
  logs: TicketDailyLog[],
  workItems: TicketWorkItem[] = [],
  helperLogs: TicketHelperLog[] = []
): string[] {
  const set = new Set<string>();
  for (const tc of timecards) if (tc.date) set.add(tc.date);
  for (const l of logs) if (l.log_date) set.add(l.log_date);
  for (const hl of helperLogs) if (hl.log_date) set.add(hl.log_date);
  for (const wi of workItems) {
    const d = resolveWorkItemDate(wi, logs);
    if (d) set.add(d);
  }
  return Array.from(set).sort();
}

// ── Footage rollups (checklist items 7–8) ───────────────────────────────────

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Linear feet on one work item — structured cuts, then the flat column, then
 * the bare `quantity` when the work type means linear feet. That last step is
 * the SAME inference the printed work line uses (workTypeUnit), so the
 * description ("WALL SAW — 54 LF") and the "total footage cut" field can never
 * disagree with each other on the same sheet.
 */
export function workItemLinearFeet(item: WorkItemLike): number {
  const cuts = item.details_json?.cuts;
  if (Array.isArray(cuts) && cuts.length > 0) {
    return round2(cuts.reduce((s: number, c: any) => s + num(c?.linearFeet), 0));
  }
  if (num(item.linear_feet_cut) > 0) return round2(num(item.linear_feet_cut));
  if (workTypeUnit(item.work_type) === 'LF') return round2(num(item.quantity));
  return 0;
}

/** Cores drilled on one work item — structured holes, flat column, then a bare
 *  `quantity` on a coring type (mirrors workItemLinearFeet). */
export function workItemCores(item: WorkItemLike): number {
  const holes = item.details_json?.holes;
  if (Array.isArray(holes) && holes.length > 0) {
    return holes.reduce((s: number, h: any) => s + (num(h?.quantity) || 1), 0);
  }
  if (num(item.core_quantity) > 0) return num(item.core_quantity);
  if (workTypeUnit(item.work_type) === 'holes') return num(item.quantity);
  return 0;
}

/**
 * The unit a bare `quantity` carries, inferred from the work type — sawing is
 * measured in linear feet, coring in holes. Deliberately conservative:
 * demolition / removal / anything unrecognised returns null and the quantity
 * prints unlabelled rather than carrying a made-up unit onto a signed sheet.
 */
export function workTypeUnit(workType: string | null | undefined): string | null {
  const t = String(workType || '').toLowerCase();
  if (!t) return null;
  if (t.includes('core') || t.includes('drill')) return 'holes';
  if (t.includes('saw') || t.includes('cut')) return 'LF';
  return null;
}

/** Range totals for the "total footage cut" / "cores drilled" ticket fields. */
export function sumFootage(items: WorkItemLike[]): { linearFeet: number; cores: number } {
  let linearFeet = 0;
  let cores = 0;
  for (const item of items) {
    linearFeet += workItemLinearFeet(item);
    cores += workItemCores(item);
  }
  return { linearFeet: round2(linearFeet), cores };
}

/** Every work item (structured + normalized log entries) printed in the range. */
export function allPrintedWork(days: TicketDay[]): WorkItemLike[] {
  const out: WorkItemLike[] = [];
  for (const day of days) {
    for (const p of day.people) {
      out.push(...p.work_items, ...p.logged_work);
    }
  }
  return out;
}
