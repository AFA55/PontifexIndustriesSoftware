/**
 * WHOSE HOURS BELONG TO THIS JOB?
 *
 * A `timecards` row is one PERSON'S DAY. It is not a job record, and no amount
 * of inference turns it into one. Both the admin Daily Progress panel and the
 * printed work ticket need "how many hours went into this job on this day", and
 * both were getting it wrong in opposite directions:
 *
 *   • the work ticket filtered on `timecards.job_order_id`, which only 34 of
 *     251 production cards carry — so it printed 0.00 hours against real work
 *     days, on the sheet the office files;
 *   • a first attempt to widen that in the progress panel pulled in any card
 *     from anyone on the crew, and billed 62 cards 73 times: 666 hours shown
 *     against 565 real, 101 invented. On one job a single day showed 28.19
 *     crew-hours of which 18.36 were simultaneously counted on two other jobs.
 *
 * So the rule lives here, once, and both callers use it. A card counts against
 * a job in exactly three cases, all provable:
 *
 *   1. the card is explicitly linked to that job (`job_order_id` matches), or
 *   2. the card has NO link and the office placed that person on this job — and
 *      only this job — that day (`job_daily_assignments`), or
 *   3. the card has NO link, the office placed nobody, AND that person touched
 *      only this one job that day — so every hour can only have gone here.
 *
 * A card linked to a DIFFERENT job is skipped outright: those hours are already
 * that job's. Anything else is genuinely unknowable, and the day is reported as
 * `split` so the caller can say "we can't attribute this" instead of printing a
 * guess with the authority of a measurement.
 *
 * "Touched" is read from `daily_job_logs` AND `helper_work_logs` together —
 * helpers file only the latter, and leaving them out is how the double-counting
 * got through the first review.
 *
 * WHY THE ASSIGNMENT OUTRANKS THE LOG (founder, Aug 14). Dante was at AM King
 * Wednesday and Thursday. The ticket printed Thursday only. His Wednesday card
 * carried 10.37 hours and no job link, and rule 3 threw it away — because that
 * morning he had also closed out the PREVIOUS job, Southern Basements, from the
 * truck. Five minutes of paperwork for Monday's job outvoted a ten-hour day.
 * The office's own placement for that date is the better evidence, so it is
 * consulted first; the filed log is the fallback, not the arbiter.
 *
 * The date universe is widened here too, deliberately. Both callers used to
 * pass only the dates that HAVE logs, so a day the crew worked and never filed
 * a ticket for could not be found no matter how the rule read — the hours were
 * excluded by the question, not by the answer.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * A QUERY THAT DIED MUST NEVER LOOK LIKE A JOB NOBODY WORKED.
 *
 * Every read below used to be `const { data } = await …`, with `error`
 * discarded. The `select` string is a CALLER-SUPPLIED parameter — the
 * completion-summary route passes a 15-column literal — so renaming or dropping
 * any one of those columns makes PostgREST answer 42703, `data` comes back
 * null, `cards` is `[]`, and the route returns **200** with zero hours. The
 * screen then reads "No hours could be tied to this job" on a job the crew
 * worked all week, and the office writes an invoice from it. That is exactly
 * the failure this whole module exists to stop, one layer down: a dead query
 * presenting as an empty result.
 *
 * So a failed read THROWS. All four callers wrap their handler in try/catch and
 * answer 500, which is the honest answer — "we could not read the hours", not
 * "there were none".
 */
export class TimecardAttributionQueryError extends Error {
  constructor(
    /** Which read failed, in plain words, e.g. 'linked timecards'. */
    readonly step: string,
    readonly pgError: { message?: string; code?: string; details?: string; hint?: string } | null
  ) {
    super(
      `attributableTimecards: the ${step} query failed — ` +
        `${pgError?.message ?? 'unknown error'}${pgError?.code ? ` [${pgError.code}]` : ''}`
    );
    this.name = 'TimecardAttributionQueryError';
  }
}

/** Rows, or a loud throw. Never a silent `[]` standing in for a dead query. */
function rowsOrThrow(
  result: { data: unknown; error: unknown },
  step: string
): any[] {
  if (result.error) {
    // Logged as well as thrown: the route's catch prints the message, but the
    // PostgREST `details`/`hint` (which name the offending column) only exist
    // on the error object itself.
    console.error(`[attributableTimecards] ${step} query failed`, result.error);
    throw new TimecardAttributionQueryError(step, result.error as any);
  }
  return ((result.data as any[]) ?? []);
}

export const TIMECARD_ATTRIBUTION_SELECT =
  'id, user_id, date, clock_in_time, clock_out_time, lunch_duration_minutes, ' +
  'break_minutes, net_hours, total_hours, is_shop_hours, is_shop_time, work_location, job_order_id';

export interface AttributedClockCards {
  /** Cards that provably belong to this job. */
  cards: any[];
  /** Dates where someone's hours could NOT be attributed (they split the day). */
  splitDates: Set<string>;
  /**
   * Ids of the cards in `cards` that carry NO `job_order_id` — they are here
   * because the office's placement (or a single-job day) says so, not because
   * anyone tagged them. Callers that put a number on screen the office might
   * BILL from must label these differently from the linked ones: an attributed
   * hour is inferred, a linked hour is recorded, and a screen that blurs the
   * two is how a guess acquires the authority of a measurement.
   */
  attributedIds: Set<string>;
}

/**
 * Resolve the clock cards attributable to `jobId`.
 *
 * @param userIds everyone who might have worked it (log authors + crew slots)
 * @param dates   the days the job ran
 * @param select  column list; defaults to TIMECARD_ATTRIBUTION_SELECT.
 *                MUST include `job_order_id`, `user_id` and `date`.
 * @param from    table or view to read cards from. `timecards` by default; the
 *                P&L/labor path passes `timecards_with_users` because it needs
 *                the joined `full_name` + `hourly_rate` on the same row. Both
 *                carry `id`, `user_id`, `date` and `job_order_id`, which is
 *                everything the rule below reads.
 * @param tenantId OPTIONAL and additive — every query below is scoped to it
 *                when given. It is a parameter rather than a hard requirement
 *                because the printed work ticket calls this too and predates
 *                it. `supabaseAdmin` BYPASSES RLS, so nothing else stops a
 *                cross-tenant row from reaching a labor cost; today a `user_id`
 *                belongs to exactly one tenant and `job_daily_assignments` was
 *                being read across ALL tenants with no filter at all, which is
 *                one schema change away from being a leak. Callers that know
 *                their tenant should pass it.
 *
 * @throws TimecardAttributionQueryError if ANY read fails. Never returns an
 *         empty result to stand in for a query that died — see the class note.
 */
export async function attributableTimecards(
  jobId: string,
  userIds: string[],
  dates: string[],
  select: string = TIMECARD_ATTRIBUTION_SELECT,
  from: 'timecards' | 'timecards_with_users' = 'timecards',
  tenantId?: string | null
): Promise<AttributedClockCards> {
  const splitDates = new Set<string>();
  const attributedIds = new Set<string>();

  // Each query is hoisted and the tenant filter applied with a plain `if`.
  // A generic `scoped(q)` helper reads better but its type parameter is
  // self-referential (`T extends { eq(...): T }`), which tips the Supabase
  // builder's already-deep generics over TS's inference budget — TS2589,
  // repo-wide. This is the shape the rest of the codebase uses; keep it.
  let linkedQuery = supabaseAdmin.from(from).select(select).eq('job_order_id', jobId);
  if (tenantId) linkedQuery = linkedQuery.eq('tenant_id', tenantId);
  // Cards explicitly tagged with this job are the job's, full stop.
  const cards: any[] = rowsOrThrow(
    await linkedQuery.order('clock_in_time', { ascending: true }),
    'linked timecards'
  );

  // WIDEN THE QUESTION FIRST. The caller only knows the days that produced a
  // log; a day worked and never filed is exactly the day we are looking for.
  // The office's per-day crew ledger supplies it.
  let ownAssignmentsQuery = supabaseAdmin
    .from('job_daily_assignments')
    .select('assignment_date, operator_id, helper_id')
    .eq('job_order_id', jobId);
  if (tenantId) ownAssignmentsQuery = ownAssignmentsQuery.eq('tenant_id', tenantId);
  const ownAssignments = rowsOrThrow(await ownAssignmentsQuery, "this job's daily assignments");

  const userSet = new Set(userIds);
  const dateSet = new Set(dates);
  for (const a of ownAssignments) {
    // Empty skeleton rows hold a date open on the board — nobody was placed.
    if (!a.operator_id && !a.helper_id) continue;
    if (a.assignment_date) dateSet.add(a.assignment_date);
    if (a.operator_id) userSet.add(a.operator_id);
    if (a.helper_id) userSet.add(a.helper_id);
  }
  userIds = Array.from(userSet);
  dates = Array.from(dateSet);

  if (userIds.length === 0 || dates.length === 0) return { cards, splitDates, attributedIds };

  let byCrewQuery = supabaseAdmin.from(from).select(select).in('user_id', userIds).in('date', dates);
  if (tenantId) byCrewQuery = byCrewQuery.eq('tenant_id', tenantId);

  let opLogsQuery = supabaseAdmin
    .from('daily_job_logs')
    .select('operator_id, log_date, job_order_id')
    .in('operator_id', userIds)
    .in('log_date', dates);
  if (tenantId) opLogsQuery = opLogsQuery.eq('tenant_id', tenantId);

  let helpLogsQuery = supabaseAdmin
    .from('helper_work_logs')
    .select('helper_id, log_date, job_order_id')
    .in('helper_id', userIds)
    .in('log_date', dates);
  if (tenantId) helpLogsQuery = helpLogsQuery.eq('tenant_id', tenantId);

  // Every job these people were placed on across these days — needed to tell
  // "the office put them here" from "the office put them in two places". This
  // one read the whole table, every tenant, with no filter at all.
  let allAssignmentsQuery = supabaseAdmin
    .from('job_daily_assignments')
    .select('assignment_date, operator_id, helper_id, job_order_id')
    .in('assignment_date', dates);
  if (tenantId) allAssignmentsQuery = allAssignmentsQuery.eq('tenant_id', tenantId);

  const [byCrewRes, opLogsRes, helpLogsRes, allAssignmentsRes] = await Promise.all([
    byCrewQuery.order('clock_in_time', { ascending: true }),
    opLogsQuery,
    helpLogsQuery,
    allAssignmentsQuery,
  ]);
  const byCrew = rowsOrThrow(byCrewRes, 'crew timecards');
  const opLogs = rowsOrThrow(opLogsRes, 'operator daily logs');
  const helpLogs = rowsOrThrow(helpLogsRes, 'helper work logs');
  const allAssignments = rowsOrThrow(allAssignmentsRes, 'daily assignments across jobs');

  // person|date → the set of jobs they filed work on that day.
  const touched = new Map<string, Set<string>>();
  const note = (uid?: string | null, d?: string | null, jid?: string | null) => {
    if (!uid || !d || !jid) return;
    const k = `${uid}|${d}`;
    const s = touched.get(k) ?? new Set<string>();
    s.add(jid);
    touched.set(k, s);
  };
  for (const r of opLogs) note(r.operator_id, r.log_date, r.job_order_id);
  for (const r of helpLogs) note(r.helper_id, r.log_date, r.job_order_id);

  // person|date → the set of jobs the OFFICE placed them on that day.
  const placed = new Map<string, Set<string>>();
  const place = (uid: string | null | undefined, d: string, jid: string) => {
    if (!uid) return;
    const k = `${uid}|${d}`;
    const s = placed.get(k) ?? new Set<string>();
    s.add(jid);
    placed.set(k, s);
  };
  for (const a of allAssignments) {
    if (!a.assignment_date || !a.job_order_id) continue;
    place(a.operator_id, a.assignment_date, a.job_order_id);
    place(a.helper_id, a.assignment_date, a.job_order_id);
  }

  const seen = new Set(cards.map((c) => c.id));
  for (const t of byCrew) {
    if (seen.has(t.id)) continue;
    // Already another job's hours.
    if (t.job_order_id && t.job_order_id !== jobId) continue;
    if (!t.job_order_id) {
      const key = `${t.user_id}|${t.date}`;
      const placedThatDay = placed.get(key);
      if (placedThatDay && placedThatDay.size > 0) {
        // The office said where this person was. That outranks whatever
        // paperwork they happened to file from the truck that morning.
        if (placedThatDay.size > 1) {
          if (placedThatDay.has(jobId)) splitDates.add(t.date);
          continue;
        }
        if (!placedThatDay.has(jobId)) continue;
      } else {
        const jobsThatDay = touched.get(key);
        if (!jobsThatDay || jobsThatDay.size !== 1 || !jobsThatDay.has(jobId)) {
          if (jobsThatDay && jobsThatDay.size > 1) splitDates.add(t.date);
          continue;
        }
      }
    }
    seen.add(t.id);
    if (!t.job_order_id) attributedIds.add(t.id);
    cards.push(t);
  }

  await backfillShopFlags(from, cards, tenantId);

  return { cards, splitDates, attributedIds };
}

/**
 * THE VIEW CANNOT SEE TWO OF THE THREE SHOP FLAGS.
 *
 * `timecards_with_users` exposes `is_shop_hours` but NOT `is_shop_time` and NOT
 * `work_location` — and 8 production cards are flagged shop ONLY via
 * `work_location = 'shop'` (verified Aug 17 2026: 10 rows carry it, 2 of which
 * also set a boolean). Every consumer's shop test reads all three, so on the
 * view path those 8 cards would test as field work. None is attributable to a
 * job today, so nothing is mis-billed yet — but widening the card query is
 * exactly what makes them reachable, and shop time must never become job labor.
 *
 * Read the missing flags from the base table rather than altering the view: it
 * is a plain read on ids we already hold, needs no migration, and cannot change
 * what any other consumer of the view sees.
 */
async function backfillShopFlags(
  from: 'timecards' | 'timecards_with_users',
  cards: any[],
  tenantId?: string | null
): Promise<void> {
  if (from !== 'timecards_with_users' || cards.length === 0) return;
  const ids = cards.map((c) => c.id).filter(Boolean);
  if (ids.length === 0) return;
  // Tenant-scoped like every other read here. The ids already came from
  // tenant-scoped queries, so this is belt-and-braces — but `supabaseAdmin`
  // bypasses RLS and this path must not depend on an upstream query staying
  // correct. The filter costs nothing on an id-constrained read.
  let flagQuery = supabaseAdmin
    .from('timecards')
    .select('id, is_shop_time, work_location')
    .in('id', ids);
  if (tenantId) flagQuery = flagQuery.eq('tenant_id', tenantId);
  const flags = rowsOrThrow(await flagQuery, 'shop-flag backfill');
  const byId = new Map<string, { is_shop_time?: boolean | null; work_location?: string | null }>();
  for (const f of flags) byId.set(f.id, f);
  for (const c of cards) {
    const f = byId.get(c.id);
    if (!f) continue;
    c.is_shop_time = f.is_shop_time ?? null;
    c.work_location = f.work_location ?? null;
  }
}
