/**
 * lib/work-ticket.ts — pure grouping/total math for the printed WORK TICKET.
 *
 * THE SHEET HAS TWO COLUMNS (founder, Aug 19): work performed on one side —
 * cut types, quantities, depths, totals, added up across the WHOLE ticket, not
 * broken down by day — and on the other, every person's times for every day
 * plus the grand TOTAL TIME. The per-day/per-operator model below still exists
 * and still does the attribution work; what changed is that its measurements
 * are rolled up (aggregateWorkPerformed) instead of printed day by day, and its
 * day list must be COMPLETE rather than a by-product of who filed paperwork.
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

export type TicketMode = 'day' | 'week' | 'job';

export interface TicketRange {
  /** inclusive bare 'YYYY-MM-DD' */
  from: string;
  /** inclusive bare 'YYYY-MM-DD' */
  to: string;
}

/** The first→last window a list of bare dates spans, or null when empty. */
export function spanOf(dates: string[]): TicketRange | null {
  const clean = dates.filter(Boolean).slice().sort();
  if (clean.length === 0) return null;
  return { from: clean[0], to: clean[clean.length - 1] };
}

/**
 * The date window a ticket covers.
 *  - job  → EVERY day the crew was on this job (the `jobSpan` the caller
 *           computed from the ledger + the cards + the filed paperwork)
 *  - day  → just the anchor date
 *  - week → the Mon–Sun week containing the anchor (lib/dates.mondayOf)
 *
 * WHY 'job' EXISTS AND IS THE DEFAULT (founder, Aug 19). "Aiden and Javi were
 * there Monday and Tuesday and right now it's only showing me the time they
 * were there Tuesday." Nothing was missing from the data: all four clock cards
 * were attributable and both days were on the job. The sheet was in DAY mode on
 * an anchor of the last worked day, so it printed one of the two days and the
 * other simply was not asked for. A ticket whose whole purpose is answering
 * "who was where and when" cannot open on a window that hides days — so the
 * default window is the job, and day/week remain for the office deliberately
 * printing one day's ticket or one payroll week.
 */
export function ticketRange(
  mode: TicketMode,
  anchorYMD: string,
  jobSpan?: TicketRange | null
): TicketRange {
  if (mode === 'job') return jobSpan ?? { from: anchorYMD, to: anchorYMD };
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
  /** The day the work was done, stamped at write time. Beats every inference below. */
  work_date?: string | null;
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
  // The row's own date, stamped when it was written. Everything below this is
  // inference that existed only because work_items had no date of their own —
  // kept for rows written before the column existed, and for the ones the
  // backfill could only place approximately.
  if (item.work_date) return item.work_date;

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
  /**
   * This person DID submit measurements, and the printed sheet is deliberately
   * not showing them because the lead measured the whole scope. Without this
   * the sheet prints ruled blank lines under their name, which reads as "they
   * filed nothing" — the opposite of the truth.
   */
  measurements_by_lead?: boolean;
  /**
   * The date this person's paperwork for this job was FILED, when that is not
   * the day they were on the job. Set when a closeout filed from another job's
   * day was folded onto their last real day here (see `offJobPersonDays`), so
   * the sheet can say the measurements arrived later instead of implying they
   * were all cut on the day they print under.
   */
  work_filed_on?: string | null;
  /**
   * `work_filed_on` describes SOME of this block's bullets, not all of them.
   *
   * Set when the fold landed on a day that had filed rows of its own, or when a
   * SECOND off-job day folded in behind the first. Either way the stamped date
   * is not true of every line printed here — JOB-2026-631148's Aug 4 block has
   * four bullets, two genuinely filed that day and two folded from Aug 5. The
   * sheet must under-claim rather than assert something untrue about recorded
   * rows, so the printed line becomes "Additional measurements filed at closeout
   * on …".
   */
  work_filed_on_partial?: boolean;
  /**
   * This person-day is a CLOSEOUT filed from somewhere else, kept only because
   * there was no on-job day in the printed range to fold it onto. It carries
   * the work but never hours — the office must not read it as a day worked.
   */
  filed_off_job?: boolean;
  /**
   * SOME OR ALL OF THESE HOURS WERE INFERRED, NOT READ OFF A TAGGED CARD.
   *
   * `attributableTimecards` counts a card against this job either because the
   * card names the job (`job_order_id`) or because the office's own placement
   * puts the person here and only here that day. The second kind is a
   * judgement, and the founder hand-writes invoices off this sheet, so the two
   * must not print identically: an attributed hour is inferred, a linked hour
   * is recorded, and a sheet that blurs them hands a guess the authority of a
   * measurement. Set when ANY card feeding this row carried no job tag.
   *
   * Real on JOB-2026-793440 — Monday's two cards carry no `job_order_id` at
   * all and are on the sheet purely because the board placed the crew there.
   */
  hours_attributed?: boolean;
  /**
   * THE BOARD PUT THEM HERE AND NOTHING ELSE DID.
   *
   * The office's per-day ledger placed this person on this job on this date,
   * and no clock card, log, work item or helper log for them reached the sheet.
   * The row still prints, with an empty Total: "who was where and when" is the
   * question this sheet answers, and "sent here, nothing clocked" is a real
   * answer to it — a far more useful one than the person silently disappearing
   * off a day the office knows they were sent to.
   */
  scheduled_only?: boolean;
  /**
   * THE DAY IS GENUINELY AMBIGUOUS — the board placed this person on this job
   * AND on another one that date, and their clock card carries no job tag.
   *
   * `attributableTimecards` drops such a card rather than guess, which is right;
   * what was wrong is that the drop left no trace, so the row printed under
   * `scheduled_only` — "no clock card was recorded" — about a man who clocked
   * 8.58 hours (Conrade, 8/06, JOB-2026-521763). A card exists and its hours are
   * real; what cannot be established is how they divide between the two jobs.
   * The sheet has to say that, not the opposite of it.
   *
   * Mutually exclusive with `scheduled_only` on the same row: both describe an
   * empty Total, and only this one is true when it is set.
   */
  hours_split?: boolean;
  /**
   * THIS DAY WAS SHARED, AND THE IN-ROUTE PRESS IS WHERE IT DIVIDED.
   *
   * The crew ran two or more jobs on one clock cycle and every one of them
   * recorded a start, so the day divides at those presses
   * (lib/job-day-boundary.ts). On such a row:
   *
   *   • In / Out are the SEGMENT's bounds, not the card's — the person's
   *     clock-in for the day's first job, this job's own press after that, and
   *     the next job's press or their clock-out at the far end. That is exactly
   *     what the founder asked the sheet to say: "NC&E, clock-in 07:03 →
   *     Sterling's in-route 14:05".
   *   • Total is that stretch, not the card's paid hours.
   *   • Lunch is BLANK. A card carries one lunch deduction and nothing records
   *     which of two jobs it fell in, so it is neither divided nor printed twice;
   *     it stays a fact about the day. The footnote says so.
   *
   * TWO BASES ON ONE SHEET, STATED RATHER THAN NORMALISED. A ¶ row's Total is
   * the GROSS clocked stretch, lunch included — which is the BILLABLE figure
   * (founder, Aug 17: "lunch is deducted for employees and still considered
   * billable hours"). An ordinary row's Total is `net_hours ?? total_hours`, the
   * PAID figure with lunch already off. On the seven jobs divided today every
   * printed row happens to be a ¶ row, so no sheet mixes them yet; the first job
   * with one shared day and one ordinary day will. The ¶ footnote therefore
   * names both bases outright. Normalising instead — re-deriving every ordinary
   * row as a gross span — would change the printed hours on every job the office
   * has already invoiced from, which is a far larger and separate decision than
   * this fix. Task #10 in BILLABLE_HOURS_AND_SHOP_TICKETS.md is where it belongs.
   *
   * Marked on the printed sheet for the same reason `hours_attributed` is: the
   * figure is derived from the presses rather than read off a tagged card, and
   * the founder writes invoices from it.
   */
  hours_boundary?: boolean;
  /**
   * TRUE when this row's day was ordered by the SCHEDULE BOARD rather than by
   * the crew's own In Route presses — `divided_by_board`, rule 7's second
   * branch in lib/job-day-boundary.ts. Always accompanied by `hours_boundary`;
   * the sheet prints `‖` instead of `¶` on these rows.
   *
   * WHY IT EARNS ITS OWN MARK, WHICH IS A REAL COST ON AN ALREADY-CROWDED SHEET.
   * The `¶` footnote makes a specific factual claim — In/Out come "from clock-in
   * or the In Route press" — and on a board-ordered day that sentence is not
   * supported: at least one job on the day recorded no press at all. The two
   * ways to keep the sheet honest were to blur `¶`'s wording until it covered
   * both, or to add the next mark in the classic footnote sequence
   * (* † ‡ § ¶ ‖) and leave `¶` saying exactly what it has always said.
   * Blurring loses the thing Amanda most needs before she bills: whether the
   * division came from what the crew stamped or from what the office scheduled.
   *
   * IT IS THE WIDE FLAG ON PURPOSE — see `divided_by_board`. It was briefly the
   * narrow one (close-divided days only), which left the other board-ordered
   * shape printing `¶` and claiming a press that was never recorded.
   */
  hours_boundary_board?: boolean;
  /**
   * TRUE when a boundary on this row's day was drawn at a job's CLOSE rather
   * than at an In Route press — rule 6. A strict subset of
   * `hours_boundary_board`, and NOT separately marked: it selects the extra
   * sentence in the `‖` footnote that names a sign-off as the line, because
   * that names the stamp an admin has to correct. Keon's and Axel's Aug 11 are
   * the only close-divided person-days in production.
   */
  hours_boundary_close?: boolean;
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
  /**
   * WHOSE MEASUREMENTS GO ON THE PRINTED TICKET (founder, Aug 14).
   *
   * 'lead'     — only the day's lead. Everyone else keeps their name, role and
   *              hours on the sheet, but contributes no quantities.
   * 'everyone' — every crew member's own entries, summed. The screen view.
   *
   * WHY. On a crew day the lead walks the job at the end and measures the
   * WHOLE scope — that is the number. The other operators also log what they
   * personally cut, which is genuinely useful on screen but is the same footage
   * counted a second time. Pratt at 474 Oconee Business Pkwy, Westminster:
   * Conrade (lead) logged 700 + 400 and Devin logged 200 + 300 + 400, and the
   * ticket printed 3,200 LF. Only Conrade's figures describe the job.
   *
   * "I don't need to see what the helper input for these tickets, just who they
   * are with. It's nice to see online what they did, but when I'm printing
   * tickets I want to see what the operator says — they're in charge of the
   * entire scope."
   */
  quantitiesFrom?: 'lead' | 'everyone';
  /**
   * date (YYYY-MM-DD) → the user_id leading that day, from the per-day crew
   * ledger. The office reassigns leads mid-job, so a job-level lead is not
   * enough. Falls back to whoever `roles` marks 'lead'.
   */
  leadByDate?: Map<string, string>;
  /**
   * DAYS THIS CREW PROVABLY SPENT ON ANOTHER JOB — `user_id|YYYY-MM-DD` keys
   * straight out of `attributableTimecards` (the office's own placement ledger).
   *
   * WHY (founder, Aug 17, running payroll). Dante's printed Southern Basements
   * ticket read 10.13 + 10.64 + **0.09** = 20.86 for the week. The 0.09 sat on
   * WEDNESDAY, a day his timecard says he was at AM King from start to finish.
   *
   * It was never a rounding artefact or a window clip. His clock card for that
   * day was correctly excluded — the ledger placed him at AM King, so the card
   * rule dropped it. What got through was the DAILY LOG: at 07:00 Wednesday, in
   * the truck, he closed out Monday–Tuesday's Southern Basements job. The app
   * timed that five-minute closeout session and wrote
   * `daily_job_logs.hours_worked = 0.09` on a row dated Wednesday. Step 2 below
   * then used it as the day's hours, because no card had claimed the day — and
   * in doing so invented a Wednesday work block on a job he never visited.
   *
   * Five minutes of paperwork is not five minutes of job labor, and the day it
   * was typed is not a day worked. So on these person-days:
   *   • the log's `hours_worked` NEVER becomes the day's hours, and neither
   *     does a helper log's — nothing recorded says they worked here;
   *   • the day does not survive as a work block. Its WORK is folded onto the
   *     person's last real day on this job inside the printed range, stamped
   *     `work_filed_on` so the sheet says when it actually arrived.
   *
   * The fold matters as much as the drop. On JOB-2026-277097 that Wednesday
   * closeout is the ONLY record of what was cut — all three `work_items` and
   * the log's `work_performed` copy carry Wednesday's date. Deleting the day
   * outright would have removed the whole job's scope from the sheet the office
   * hand-writes the invoice from: a blank ticket instead of a wrong one, which
   * is the worse of the two failures. When there is no on-job day in range to
   * fold onto, the day is kept with NO hours and `filed_off_job` set, so the
   * measurements survive and the sheet still refuses to call it a day worked.
   *
   * A card LINKED to this job outranks the ledger and is untouched: step 1 runs
   * first, and a person-day it gave hours to is never treated as off-job. That
   * is real production data — Zack's Aug 14 card carries JOB-2026-424813's id
   * while the board placed him on JOB-2026-675188.
   */
  offJobPersonDays?: Set<string>;
  /**
   * EVERY PERSON-DAY THE OFFICE'S OWN BOARD PLACED ON **THIS** JOB —
   * `user_id|YYYY-MM-DD` keys straight out of `job_daily_assignments`
   * (operator_id AND helper_id; the board writes both).
   *
   * WHY (founder, Aug 19, on JOB-2026-793440). "We need to get this fully
   * functional and correct so we don't have issues trying to figure out who was
   * where and when." Until now a day only existed on the sheet if a card, a
   * log, a work item or a helper log landed on it — every one of which is
   * something the CREW has to do. A day the board sent two men to and neither
   * clocked in could not appear, so the sheet answered "who was where and when"
   * only for the days the crew remembered to file.
   *
   * These seed a row with no hours. They never invent hours: steps 1, 2 and 4
   * are the only things that ever set `hours`, and a seeded day nobody clocked
   * prints an empty Total and `scheduled_only`.
   *
   * This is THIS job's ledger only, so a seed can never collide with
   * `offJobPersonDays` (which holds keys placed on OTHER jobs and not here).
   */
  scheduledPersonDays?: Set<string>;
  /**
   * `user_id|YYYY-MM-DD` keys from `attributableTimecards.splitPersonDays` —
   * days whose clock card was DROPPED because the office placed the person on
   * this job and another one, with nothing on the card to divide it. Drives
   * `hours_split`; see that field for why the distinction has to print.
   */
  splitPersonDays?: Set<string>;
  /**
   * Card ids from `attributableTimecards.attributedIds` — the cards that carry
   * NO `job_order_id` and are counted here because the office's placement (or a
   * single-job day) says so. Drives `hours_attributed`. See that field.
   */
  attributedCardIds?: Set<string>;
  /**
   * `attributableTimecards.boundarySegments` — card id → the stretch of that
   * card belonging to THIS job, for the person-days that divide at the in-route
   * presses. When a card is in here its segment REPLACES the card's own
   * clock-in, clock-out and hours on the sheet; see `hours_boundary`.
   *
   * This is the fix for the Aug 19 defect. Conrade and Axel each clocked ONE
   * card tagged NC&E and worked NC&E then Sterling; Sterling's printed figure
   * was 0.04 h — the 1 min 45 s its daily log sat open — because the card was
   * another job's and the log was all that was left. Sterling's real share is
   * the 14:05 press to the 17:38 clock-out.
   */
  boundarySegments?: Map<
    string,
    {
      start: string;
      end: string;
      hours: number;
      divided_by_board?: boolean;
      divided_by_close?: boolean;
    }
  >;
  /**
   * Today, local, bare 'YYYY-MM-DD'. Only used to keep a FUTURE scheduled day
   * off the sheet: the board holds next week's placements, and a printed ticket
   * asserting a man was on a job he has not been to yet is a lie the office
   * would file. Omit and no future filter is applied.
   */
  todayYMD?: string;
}

const UNASSIGNED = '__unassigned__';

/**
 * Two day-notes that both belong on one printed block, joined rather than
 * chosen between. Used only by the off-job fold, where the target day and the
 * closeout each carry a note the office wrote and neither is a copy of the
 * other. Identical text collapses — a re-saved closeout should not print twice.
 */
function joinNotes(a: string | null, b: string | null): string | null {
  const parts = [a, b].map((s) => (s || '').trim()).filter(Boolean);
  const seen = new Set<string>();
  const unique = parts.filter((s) => (seen.has(s) ? false : (seen.add(s), true)));
  return unique.length > 0 ? unique.join(' · ') : null;
}

/**
 * Nothing has landed on this row: no card, no log, no measurement, no note.
 * Read in two places that must agree — the closeout fold's target selection
 * (step 5b) and the `scheduled_only` test (step 7). They used to disagree: a
 * board-seeded row with nothing on it was an eligible FOLD TARGET, so a
 * closeout's measurements could be re-dated onto a day nobody clocked, and the
 * arrival of those measurements then cleared the row's own `‡` — the sheet
 * quietly asserting the crew was here and cut this, on a day the only evidence
 * for is a line on the board.
 */
function isEmptyRow(p: TicketPersonDay): boolean {
  return (
    p.clock_in == null &&
    p.clock_out == null &&
    p.hours == null &&
    p.lunch_minutes == null &&
    p.work_items.length === 0 &&
    p.logged_work.length === 0 &&
    !p.log_note &&
    !p.helper_note
  );
}

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

  const dayKey = (userId: string, date: string) => `${userId}|${date}`;
  /** The office placed this person on another job that day. See `offJobPersonDays`. */
  const isOffJob = (userId: string, date: string) =>
    input.offJobPersonDays?.has(dayKey(userId, date)) === true;
  /**
   * Person-days a CLOCK CARD reached — the recorded fact that outranks the
   * ledger. Filled by step 1 only, so a linked card always wins the tie.
   *
   * With ONE deliberate exception: a SHOP card never lands here, because step 1
   * skips it before this line. Shop time is not job labour, so a shop card is no
   * evidence the person was on this job that day, and letting it protect an
   * off-job filing day would resurrect exactly the phantom hours the guard
   * exists to kill. A shop card is the one linked card that does not win.
   */
  const cardBacked = new Set<string>();

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

  // 0. THE BOARD'S OWN PLACEMENTS — a day exists because the office sent
  //    someone to it, not only because the crew filed something from it. See
  //    `scheduledPersonDays`. Seeded FIRST so every later step lands on the row
  //    rather than creating a second one, and seeded with nothing: a day only
  //    ever gets hours from a card (step 1) or a log (steps 2/4).
  const seededOnly = new Set<string>();
  for (const key of input.scheduledPersonDays ?? []) {
    const sep = key.lastIndexOf('|');
    if (sep <= 0) continue;
    const userId = key.slice(0, sep);
    const date = key.slice(sep + 1);
    if (!inRange(date, range)) continue;
    // Never print a day that has not happened yet.
    if (input.todayYMD && date > input.todayYMD) continue;
    bucket(date, userId);
    seededOnly.add(dayKey(userId, date));
  }

  // 1. Clock times — the payroll truth for Start / End / Lunch / Total.
  for (const tc of input.timecards) {
    if (!inRange(tc.date, range) || !tc.user_id) continue;
    // Shop time is not job labor — never bill it here, and (see `cardBacked`)
    // never let it vouch for a person being on this job that day either.
    if (isShopCard(tc)) continue;
    const p = bucket(tc.date as string, tc.user_id);
    // THE DAY DIVIDED AT THE PRESSES. When it did, the segment is this job's
    // whole truth about this card — its bounds and its hours both — and the
    // card's own figures describe a day that was spent on more than this job.
    const segment = input.boundarySegments?.get(tc.id);
    // An INFERRED hour must never print as a recorded one. See
    // `hours_attributed` — this is the only place the distinction is knowable.
    if (input.attributedCardIds?.has(tc.id)) p.hours_attributed = true;
    // A card got this far only by being linked to this job, attributed to it,
    // or divided into it at the presses — all of which outrank the placement
    // ledger for this person-day.
    cardBacked.add(dayKey(tc.user_id, tc.date as string));

    if (segment) {
      p.hours_boundary = true;
      // Rule 7: the day's order came from the board, not from the crew's own
      // presses. The row says so, because the two are not the same quality of
      // fact — and `divided_by_close` narrows it to "and a sign-off drew the
      // line", which is the stamp an admin would have to correct.
      if (segment.divided_by_board) p.hours_boundary_board = true;
      if (segment.divided_by_close) p.hours_boundary_close = true;
      if (!p.clock_in || segment.start < p.clock_in) p.clock_in = segment.start;
      if (!p.clock_out || segment.end > p.clock_out) p.clock_out = segment.end;
      // Lunch is deliberately NOT carried onto a divided row — see
      // `hours_boundary`. It belongs to the day and to neither job.
      if (Number.isFinite(Number(segment.hours))) {
        p.hours = round2((p.hours ?? 0) + Number(segment.hours));
      }
      continue;
    }

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
    // NOT on a day the office placed them elsewhere and no card ties them here.
    // `hours_worked` on such a row is the length of the CLOSEOUT SESSION, not of
    // a day's work — 0.09h for Dante's five minutes in the truck. See
    // `offJobPersonDays`.
    const offJob = isOffJob(userId, log.log_date as string) && !cardBacked.has(dayKey(userId, log.log_date as string));
    if (!offJob && p.hours == null && log.hours_worked != null && Number.isFinite(Number(log.hours_worked))) {
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
    // Same guard as the operator log above — a helper who filed this job's
    // paperwork from another job's day did not work here that day.
    const offJob = isOffJob(hl.helper_id, hl.log_date as string) && !cardBacked.has(dayKey(hl.helper_id, hl.log_date as string));
    if (!offJob && p.hours == null && hl.hours_worked != null && Number.isFinite(Number(hl.hours_worked))) {
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

  // 5b. OFF-JOB FILING DAYS — the phantom Wednesday.
  //
  //     A person-day that exists ONLY because someone filed this job's
  //     paperwork on a day the office had them somewhere else is not a day
  //     worked here, and the printed sheet must not carry it as one. Its hours
  //     are already gone (steps 2 and 4 refused the fallback); what remains is
  //     to stop the DAY itself from printing, without losing the work it
  //     carries. Full reasoning on `offJobPersonDays`.
  //
  //     The work moves to the person's last real day on this job at or before
  //     the filing date — the closest thing the sheet knows to when it was
  //     actually done — and the filing date rides along on `work_filed_on` so
  //     nothing is silently re-dated. With no such day in the printed range the
  //     block stays put, hours-less and flagged, because losing the only record
  //     of what was cut is worse than printing a labelled paperwork entry.
  //
  //     THE FOLD MUST NOT MAKE ANYONE A LEAD-WITH-WORK THEY WEREN'T.
  //
  //     Step 6 below blanks every non-lead's quantities on any day the LEAD
  //     filed work, and deliberately stands down when the lead filed nothing.
  //     Folding a closeout onto a day the lead had no work of his own flips that
  //     test — and step 6 would then erase a second crew member's genuine
  //     footage for that day, replacing distinct measurements with a
  //     "measured by lead" flag. On JOB-2026-277097 Dante is lead and filed
  //     nothing on 8/11 (all three rows carry 8/12), so the fold would have made
  //     him lead-with-work there; only the fact that nobody else filed on 8/11
  //     kept it from costing real footage off the invoice.
  //
  //     So days whose ONLY work arrived by fold are recorded here, and step 6
  //     treats them the way it treated them before the fold existed: as a lead
  //     who filed nothing, leaving the crew's own numbers alone.
  const foldOnlyWorkDays = new Set<string>();

  if (input.offJobPersonDays && input.offJobPersonDays.size > 0) {
    // Every person-day currently on the sheet that is NOT an off-job filing —
    // i.e. the days each person was really here.
    const onJobDates = new Map<string, string[]>();
    for (const [date, people] of byDate) {
      for (const [userId, person] of people) {
        if (isOffJob(userId, date) && !cardBacked.has(dayKey(userId, date))) continue;
        // A day the BOARD alone created, that collected nothing, is not a day
        // this person provably stood on this job — it is a plan. Folding a
        // closeout's measurements onto it would date real cuts to a day whose
        // only evidence is the schedule, and would strip that row's `‡` on the
        // way (step 7 reads emptiness, and the fold makes it non-empty). The
        // fold's whole point is landing on the last day the person was REALLY
        // here; a seeded blank is not one. See `isEmptyRow`.
        if (seededOnly.has(dayKey(userId, date)) && isEmptyRow(person)) continue;
        const list = onJobDates.get(userId) ?? [];
        list.push(date);
        onJobDates.set(userId, list);
      }
    }
    for (const list of onJobDates.values()) list.sort();

    for (const [date, people] of Array.from(byDate)) {
      for (const [userId, person] of Array.from(people)) {
        if (!isOffJob(userId, date) || cardBacked.has(dayKey(userId, date))) continue;

        // Latest real day on this job at or before the filing date. A closeout
        // describes work already done, so never fold it FORWARD onto a day the
        // work could not yet have happened on.
        const candidates = (onJobDates.get(userId) ?? []).filter((d) => d <= date);
        const targetDate = candidates.length > 0 ? candidates[candidates.length - 1] : null;
        const target = targetDate ? byDate.get(targetDate)?.get(userId) : null;

        if (!target) {
          // Nothing to fold onto — keep the work, refuse the day.
          person.hours = null;
          person.filed_off_job = true;
          continue;
        }

        // Whether the target day stood on its own measurements BEFORE the fold.
        // Read now, because the merge below is about to make it true either way,
        // and both the `work_filed_on` wording and step 6's lead test hang on
        // the answer.
        const targetHadOwnWork = target.work_items.length > 0 || target.logged_work.length > 0;
        const foldCarriesWork = person.work_items.length > 0 || person.logged_work.length > 0;

        target.work_items = [...target.work_items, ...person.work_items];
        // Step 5 leaves `logged_work` non-empty only when the person filed no
        // structured rows, so these two can never be the same submission twice.
        target.logged_work = [...target.logged_work, ...person.logged_work];
        // JOIN, never first-wins. Both notes are real and neither is a copy of
        // the other: on JOB-2026-631148 the 8/04 log already reads "Job
        // complete. Remote signature link sent to …", so keeping only the first
        // would drop "Final day. Job complete." off the printed sheet outright.
        // Every other line of this fold is additive; this one has to be too.
        target.log_note = joinNotes(target.log_note, person.log_note);
        target.helper_note = joinNotes(target.helper_note, person.helper_note);
        if (foldCarriesWork) {
          // The stamp must not over-claim. It is true of the WHOLE block only
          // when the block had nothing of its own and nothing else has folded
          // in; otherwise some bullets here really were filed on their own day,
          // and the sheet says "Additional …" instead. Keep the LATEST filing
          // date so a second fold is deterministic rather than
          // iteration-order-dependent.
          if (targetHadOwnWork || target.work_filed_on) target.work_filed_on_partial = true;
          if (!target.work_filed_on || date > target.work_filed_on) target.work_filed_on = date;
          if (!targetHadOwnWork && targetDate) {
            foldOnlyWorkDays.add(dayKey(userId, targetDate));
          }
        }

        people.delete(userId);
      }
      if (people.size === 0) byDate.delete(date);
    }
  }

  // 6. LEAD-ONLY MEASUREMENTS (print mode).
  //
  //    The lead measures the whole scope at the end of the day; everyone else's
  //    entries describe the same footage a second time. So on the printed sheet
  //    only the lead's quantities survive — every other person keeps their name,
  //    role, times and hours, because who was there matters, and loses only the
  //    numbers.
  //
  //    The fallback is the important half: if the lead filed nothing that day,
  //    the crew's entries stand. Blanking them would print a worked day as no
  //    work at all, which is a worse lie than the double count. Real case on
  //    this very job — 11 Aug, only Devin filed.
  if ((input.quantitiesFrom ?? 'lead') === 'lead') {
    for (const [date, people] of byDate) {
      const leadId =
        input.leadByDate?.get(date) ??
        Array.from(people.keys()).find((id) => input.roles.get(id) === 'lead');
      if (!leadId) continue;

      const lead = people.get(leadId);
      // Work that ARRIVED HERE BY FOLD does not make this a day the lead
      // measured the scope — it describes a different day, filed late. Counting
      // it would blank a second crew member's genuine footage for this day and
      // print the fold's scope in its place. See `foldOnlyWorkDays`.
      const leadHasOwnWork =
        !!lead &&
        (lead.work_items.length > 0 || lead.logged_work.length > 0) &&
        !foldOnlyWorkDays.has(dayKey(leadId, date));
      if (!leadHasOwnWork) continue;

      for (const [userId, person] of people) {
        if (userId === leadId) continue;
        // Only flag people who actually had something — someone who genuinely
        // filed nothing still gets ruled lines to write on.
        if (person.work_items.length > 0 || person.logged_work.length > 0) {
          person.measurements_by_lead = true;
        }
        person.work_items = [];
        person.logged_work = [];
      }
    }
  }

  // 7. WHY IS THIS TOTAL BLANK? Two different answers, and the sheet must not
  //    give the wrong one — the office reads a blank Total and goes looking for
  //    the card.
  //
  //      • `hours_split` — a card EXISTS and was dropped as unattributable,
  //        because the board had this person on this job and another one that
  //        day. Real, and worth 8.58 hours on JOB-2026-521763.
  //      • `scheduled_only` — the board created the row and nothing else ever
  //        touched it.
  //
  //    Split wins the tie: it is the more specific statement, and both cannot
  //    print against one Total. Read after every step above, because a seeded
  //    row that later collected a card, a log or a measurement is an ordinary
  //    worked day and must carry neither flag.
  for (const [date, people] of byDate) {
    for (const [userId, p] of people) {
      const key = dayKey(userId, date);
      if (p.hours == null && input.splitPersonDays?.has(key)) {
        p.hours_split = true;
        continue;
      }
      if (!seededOnly.has(key)) continue;
      if (isEmptyRow(p)) p.scheduled_only = true;
    }
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

/**
 * TOTAL WORK PERFORMED, by work type, across the whole printed range.
 *
 * WHY THIS EXISTS (founder, Aug 15). The project managers and admin write the
 * invoice BY HAND from this sheet — the system does not decide what to bill and
 * is not trying to. So the sheet's only job is to state, accurately and in one
 * place, what was done.
 *
 * The per-day blocks alone could not do that. His example: an operator misses a
 * day, then on the following day enters the running total for both — and the
 * sheet showed that work under one date, so a reader scanning day by day saw
 * "one day of work" on a two-day job and had to reconstruct the rest. The
 * per-day view answers "what happened when"; it cannot answer "what did we do
 * in total", because that depends on which day somebody happened to type it.
 *
 * So the total is computed once over everything printed, independently of how
 * it was split across days. Both views stay on the sheet — the days for the
 * story, this for the number that gets invoiced. Hours are deliberately NOT
 * mixed in here; they have their own section, because a figure that is
 * sometimes footage and sometimes time is the confusion this removes.
 */
export interface WorkTypeTotal {
  workType: string;
  quantity: number;
  /** 'LF' | 'holes' | null — null prints unlabelled rather than inventing one. */
  unit: string | null;
}

export function totalsByWorkType(items: WorkItemLike[]): WorkTypeTotal[] {
  const byType = new Map<string, WorkTypeTotal>();

  for (const item of items) {
    const raw = String(item.work_type || '').trim();
    if (!raw) continue;
    // Case-insensitive so "Wall Saw" and "WALL SAW" are one line, not two.
    const key = raw.toUpperCase();

    // Prefer the measured value over a bare quantity: a sawing row carries its
    // linear feet in details, and a coring row its hole count, and those are
    // the numbers the office bills from.
    const lf = workItemLinearFeet(item);
    const cores = workItemCores(item);
    const unit = workTypeUnit(raw);
    const qty = lf > 0 ? lf : cores > 0 ? cores : num(item.quantity);
    if (qty <= 0) continue;

    const existing = byType.get(key);
    if (existing) {
      existing.quantity = round2(existing.quantity + qty);
    } else {
      byType.set(key, { workType: key, quantity: round2(qty), unit });
    }
  }

  // Biggest first — the line the office is looking for is usually the big one.
  return Array.from(byType.values()).sort((a, b) => b.quantity - a.quantity);
}

/**
 * Every depth this work item records, in inches, ascending and de-duplicated.
 *
 * Depth is stored in five different places depending on which modal the crew
 * used, and the office prices a 12" cut differently from a 4" one — so all five
 * are read rather than the sheet quietly printing footage with no depth:
 *   • `cut_depth_inches` / `core_depth_inches` — the flat columns
 *   • `details_json.cuts[].cutDepth`           — sawing entries
 *   • `details_json.cuts[].areas[].depth`      — an L×W cut measures depth here
 *   • `details_json.holes[].depthInches`       — coring entries
 *   • `details_json.areas[].thickness|depth`   — demolition / removal entries
 */
export function workItemDepths(item: WorkItemLike): number[] {
  const out = new Set<number>();
  const add = (v: unknown) => {
    const x = num(v);
    if (x > 0) out.add(round2(x));
  };
  add(item.cut_depth_inches);
  add(item.core_depth_inches);
  const d = item.details_json;
  if (d && typeof d === 'object') {
    for (const c of Array.isArray(d.cuts) ? d.cuts : []) {
      add(c?.cutDepth);
      for (const a of Array.isArray(c?.areas) ? c.areas : []) add(a?.depth);
    }
    for (const h of Array.isArray(d.holes) ? d.holes : []) add(h?.depthInches);
    for (const a of Array.isArray(d.areas) ? d.areas : []) {
      add(a?.thickness);
      add(a?.depth);
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

/**
 * THE LEFT-HAND COLUMN OF THE PRINTED SHEET: what was done on this job, added
 * up across the whole ticket, with the depths.
 *
 * FOUNDER, TWICE (Aug 15, then Aug 19): "We don't need to see what they did
 * every day when we print ticket. We need to see work performed on one side,
 * and their times for each day and total times on another side."
 *
 * So the scope is stated ONCE. Which day a measurement happened to be typed on
 * is an accident of when the operator opened the app — a man who misses a day
 * and enters the running total the next morning made the per-day breakdown say
 * "one day of work" on a two-day job. Quantity, unit and depth are what the
 * invoice is written from, and they are all here in one block.
 *
 * `totalsByWorkType` is the same rollup without depths; this supersedes it for
 * the printed sheet and delegates the quantity rule to it so the two can never
 * disagree about a number on the same page.
 */
export interface WorkPerformedLine extends WorkTypeTotal {
  /** Distinct depths in inches, ascending. Empty when none was recorded. */
  depths: number[];
}

export function aggregateWorkPerformed(items: WorkItemLike[]): WorkPerformedLine[] {
  const depthsByType = new Map<string, Set<number>>();
  for (const item of items) {
    const key = String(item.work_type || '').trim().toUpperCase();
    if (!key) continue;
    const set = depthsByType.get(key) ?? new Set<number>();
    for (const d of workItemDepths(item)) set.add(d);
    depthsByType.set(key, set);
  }
  return totalsByWorkType(items).map((t) => ({
    ...t,
    depths: Array.from(depthsByType.get(t.workType) ?? []).sort((a, b) => a - b),
  }));
}

/**
 * The dates on which measurements printed here were actually FILED, when that
 * is not a day they were done — the closeout fold's stamp, lifted off the
 * person-days so it survives the move to an aggregated work column.
 *
 * The per-person blocks used to carry "Measurements filed at closeout on …"
 * next to the bullets they described. Those blocks are gone from the sheet, and
 * dropping the stamp with them would silently re-date the one thing the fold
 * exists to be honest about. It becomes a footnote under the work instead.
 */
export function closeoutFilingDates(days: TicketDay[]): string[] {
  const set = new Set<string>();
  for (const day of days) {
    for (const p of day.people) {
      if (p.work_filed_on) set.add(p.work_filed_on);
      // A block kept in place because there was no on-job day to fold onto is
      // the same fact stated a different way: this work arrived as paperwork.
      else if (p.filed_off_job) set.add(day.date);
    }
  }
  return Array.from(set).sort();
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
