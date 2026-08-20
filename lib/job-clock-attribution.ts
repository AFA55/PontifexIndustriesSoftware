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
import { DEFAULT_TENANT_TZ } from '@/lib/reminder-timing';
import {
  jobCloseOnDate,
  jobStartOnDate,
  splitClockDayAtJobStarts,
  type JobDaySegment,
} from '@/lib/job-day-boundary';
import { resolveDayJobs, type JobDayEvidence } from '@/lib/timecard-job-rules';

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
   * `user_id|YYYY-MM-DD` — WHOSE day was split, not merely which date it fell
   * on. Same judgement as `splitDates`, one level finer.
   *
   * The date-level set cannot say which of the crew on a two-man day was the
   * ambiguous one, and the printed ticket has to: a mark against the wrong man's
   * blank Total is a new false statement in place of the one it was added to
   * fix. Populated at exactly the two places `splitDates` is, from the card
   * whose owner and date are both already in hand, so the two can never drift.
   */
  splitPersonDays: Set<string>;
  /**
   * Ids of the cards in `cards` that carry NO `job_order_id` — they are here
   * because the office's placement (or a single-job day) says so, not because
   * anyone tagged them. Callers that put a number on screen the office might
   * BILL from must label these differently from the linked ones: an attributed
   * hour is inferred, a linked hour is recorded, and a screen that blurs the
   * two is how a guess acquires the authority of a measurement.
   */
  attributedIds: Set<string>;
  /**
   * `user_id|YYYY-MM-DD` keys the office's own ledger places on OTHER jobs and
   * NOT on this one — the days these people provably spent somewhere else.
   *
   * The card rule above already uses this to DROP a card. It is returned as
   * well because a card is not the only way a day's hours reach a screen: a
   * `daily_job_logs` row filed on such a day carries an `hours_worked` figure
   * that some callers fall back to when no card was attributed, and that
   * fallback is how a day spent entirely elsewhere printed 0.09 hours against
   * JOB-2026-277097 (see lib/work-ticket.ts, `offJobPersonDays`).
   *
   * Derived from data these queries already hold, so it costs nothing and
   * cannot drift from the card rule it mirrors.
   */
  offJobPersonDays: Set<string>;
  /**
   * THE DAY DIVIDED AT THE IN-ROUTE PRESSES — card id → the stretch of that
   * card that belongs to THIS job.
   *
   * Populated only for a person-day the crew was provably on TWO OR MORE jobs
   * and EVERY one of them recorded a start on that date
   * (lib/job-day-boundary.ts). Three consequences for the caller, and all three
   * matter on a sheet the office invoices from:
   *
   *   • the card's own `net_hours`/`total_hours` describe the WHOLE day and are
   *     no longer this job's figure — use `hours` off the segment;
   *   • the card's clock-in/clock-out are not this job's start and end — use the
   *     segment's, which are the person's clock-in (first job) or the press, and
   *     the next press or their clock-out;
   *   • the figure is INFERRED from the presses rather than read off a tagged
   *     card, and has to print as such.
   *
   * A card carrying ANOTHER job's `job_order_id` appears in `cards` when, and
   * only when, it is in here: that is the Aug 19 case. Conrade's and Axel's
   * single cards are both tagged NC&E, and Sterling's share of the day exists
   * nowhere else — which is why Sterling printed 0.04 h, the length of a daily
   * log's open session, against three and a half hours of work.
   */
  boundarySegments: Map<string, JobDaySegment>;
  /**
   * Ids of the cards in `boundarySegments` — the same judgement as a set, for
   * callers that only need "is this one of them" (e.g. the helper
   * double-count guard, which takes a set of inferred card ids).
   */
  boundaryIds: Set<string>;
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
  tenantId?: string | null,
  /**
   * The zone a boundary timestamp's calendar date is read in — see guard (a) in
   * lib/job-day-boundary.ts. Defaults to the platform default, matching
   * `jobHoursForCard`; a multi-zone tenant should pass its own.
   */
  timeZone: string = DEFAULT_TENANT_TZ
): Promise<AttributedClockCards> {
  const splitDates = new Set<string>();
  const splitPersonDays = new Set<string>();
  const attributedIds = new Set<string>();
  const offJobPersonDays = new Set<string>();
  const boundarySegments = new Map<string, JobDaySegment>();
  const boundaryIds = new Set<string>();

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
  // A card TAGGED with this job proves the job ran that day, so it widens the
  // question too. Without this, a day whose only tagged card belongs to the
  // operator would never be searched for the helper's UNTAGGED card sitting
  // beside it — the day would print half its crew. The linked query above has
  // no date filter, so these dates cost nothing to collect.
  for (const c of cards) if (c?.date) dateSet.add(c.date);
  for (const a of ownAssignments) {
    // Empty skeleton rows hold a date open on the board — nobody was placed.
    if (!a.operator_id && !a.helper_id) continue;
    if (a.assignment_date) dateSet.add(a.assignment_date);
    if (a.operator_id) userSet.add(a.operator_id);
    if (a.helper_id) userSet.add(a.helper_id);
  }
  userIds = Array.from(userSet);
  dates = Array.from(dateSet);

  if (userIds.length === 0 || dates.length === 0) {
    return {
      cards,
      splitDates,
      splitPersonDays,
      attributedIds,
      offJobPersonDays,
      boundarySegments,
      boundaryIds,
    };
  }

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
    // `day_sequence` is the office's own order for the day. It is read ONLY by
    // the boundary split, and there only when a press is missing somewhere on
    // the day (rule 7 in lib/job-day-boundary.ts) — a fully-pressed day never
    // consults it, so a board that disagrees with the stamps cannot move a day
    // that already resolves. Verified against information_schema: PostgREST
    // rejects the WHOLE select on one bad column name and the page then reads
    // as empty rather than broken.
    .select('assignment_date, operator_id, helper_id, job_order_id, day_sequence')
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
  // job|date → the board's `day_sequence` for that job that day. Person-agnostic
  // because the sequence describes the JOB's place in the day, and a job appears
  // on one board row per date. `min` on the off-chance two rows disagree: the
  // lower number is the earlier slot, and the split only ever compares them.
  //
  // A SKELETON ROW SUPPLIES NOTHING. Rows with no operator and no helper hold a
  // date open on the board — the same rows the date-widening above skips, for
  // the same reason: they are not the office saying anybody was anywhere. Axel's
  // Aug 12 is why it matters. Leifeng is in his day only through his frozen
  // clock-in tag (`always_counts`), the board row for Leifeng that day places
  // NOBODY, and borrowing its `day_sequence: 2` would have ordered his day off
  // an empty row and moved 3.65 h onto a job the founder says he never went to.
  const daySequence = new Map<string, number>();
  for (const a of allAssignments) {
    if (!a.assignment_date || !a.job_order_id) continue;
    place(a.operator_id, a.assignment_date, a.job_order_id);
    place(a.helper_id, a.assignment_date, a.job_order_id);
    if (!a.operator_id && !a.helper_id) continue;
    if (typeof a.day_sequence === 'number' && Number.isFinite(a.day_sequence)) {
      const sk = `${a.job_order_id}|${a.assignment_date}`;
      const prior = daySequence.get(sk);
      if (prior == null || a.day_sequence < prior) daySequence.set(sk, a.day_sequence);
    }
  }

  // The office placed these people somewhere, and it was not here. Recorded
  // once, so the card rule below and every hours fallback downstream read the
  // SAME judgement instead of each re-deriving it from the ledger.
  for (const [key, jobs] of placed) {
    if (jobs.size > 0 && !jobs.has(jobId)) offJobPersonDays.add(key);
  }

  // ── THE IN-ROUTE PRESS IS THE JOB BOUNDARY ────────────────────────────────
  //
  // Everything above answers "does this whole card belong to this job". On a
  // day the crew ran two jobs the honest answer is "part of it does", and until
  // now there was no way to say that: the card went entirely to whichever job
  // it was tagged with, and the second job fell back to its DAILY LOG's
  // `hours_worked` — the length of the closeout session. That is how Sterling
  // printed 0.04 h against three and a half hours of work on Aug 19, and it is
  // the same defect as the 0.09 h phantom, one surface over.
  //
  // The day's jobs come from the SAME authority ladder the card rule uses, so
  // the two can never disagree about where someone was:
  //   1. the office's placement ledger, when it placed them anywhere that day;
  //   2. otherwise the jobs they filed paperwork on;
  //   3. plus, always, the job their own card is TAGGED with — a recorded fact
  //      that no ledger outranks (real: Zack's Aug 14 card names
  //      JOB-2026-424813 while the board placed him on JOB-2026-675188).
  //
  // Rung 1 is what keeps the closeout phantoms dead. On 8/12 Dante FILED
  // JOB-2026-277097's paperwork from another job's truck; the board placed him
  // only on JOB-2026-914932, so 277097 is not one of that day's jobs and cannot
  // be handed a boundary — never mind the 10.37-hour card it would have taken.
  await resolveBoundarySegments({
    jobId,
    timeZone,
    tenantId,
    cardPool: [...cards, ...byCrew],
    placed,
    touched,
    daySequence,
    boundarySegments,
    boundaryIds,
  });

  const seen = new Set(cards.map((c) => c.id));
  for (const t of byCrew) {
    if (seen.has(t.id)) continue;
    // A card whose day divides at the presses carries a stretch that is ours,
    // whatever job its tag names. The segment — not the card — is the figure.
    const hasBoundary = boundarySegments.has(t.id);
    // Already another job's hours, unless part of the day is provably here.
    if (t.job_order_id && t.job_order_id !== jobId && !hasBoundary) continue;
    if (!t.job_order_id && !hasBoundary) {
      const key = `${t.user_id}|${t.date}`;
      const placedThatDay = placed.get(key);
      if (placedThatDay && placedThatDay.size > 0) {
        // The office said where this person was. That outranks whatever
        // paperwork they happened to file from the truck that morning.
        if (placedThatDay.size > 1) {
          if (placedThatDay.has(jobId)) {
            splitDates.add(t.date);
            splitPersonDays.add(key);
          }
          continue;
        }
        if (!placedThatDay.has(jobId)) continue;
      } else {
        const jobsThatDay = touched.get(key);
        if (!jobsThatDay || jobsThatDay.size !== 1 || !jobsThatDay.has(jobId)) {
          if (jobsThatDay && jobsThatDay.size > 1) {
            splitDates.add(t.date);
            // Only when THIS job is one of the two — otherwise the day was
            // ambiguous somewhere else entirely and says nothing about here.
            if (jobsThatDay.has(jobId)) splitPersonDays.add(key);
          }
          continue;
        }
      }
    }
    seen.add(t.id);
    if (!t.job_order_id) attributedIds.add(t.id);
    cards.push(t);
  }

  await backfillShopFlags(from, cards, tenantId);

  return {
    cards,
    splitDates,
    splitPersonDays,
    attributedIds,
    offJobPersonDays,
    boundarySegments,
    boundaryIds,
  };
}

/**
 * Fill `boundarySegments` for every card whose person-day divides at the
 * in-route presses and whose division gives a stretch to THIS job.
 *
 * Two reads, both tenant-scoped like everything else here, both narrowed to the
 * job/date pairs that a multi-job person-day actually needs — a single-job day
 * can never produce a boundary, so the common case costs nothing:
 *   • `job_orders` start stamps (the whole-job press; right for a one-day job
 *     and for day 1 of a multi-day one) AND its `work_completed_at`;
 *   • `daily_job_logs` per-DAY start stamps (the only source that can be right
 *     on day 5 — and the one whose stale copies guard (a) exists to reject)
 *     AND its per-day `day_completed_at`.
 *
 * THE CLOSES ARE READ BECAUSE A PRESS IS NOT ALWAYS THERE. Rule 6 in
 * lib/job-day-boundary.ts uses the PRECEDING job's same-day close as the
 * boundary when the job after it has no usable press — Keon's Aug 11, where
 * Leifeng was day 2 and carried only an Aug 10 copy. Both close columns feed
 * `jobCloseOnDate`, which applies the same day-guard as the presses; neither is
 * ever used to end its own job's segment, which rule 5 forbids.
 *
 * A failed read THROWS, like every other read in this module: a dead query must
 * never present as "this day did not divide", which is indistinguishable on
 * screen from the bug being fixed.
 */
async function resolveBoundarySegments(args: {
  jobId: string;
  timeZone: string;
  tenantId?: string | null;
  cardPool: any[];
  placed: Map<string, Set<string>>;
  touched: Map<string, Set<string>>;
  /** `job|date` → the board's day_sequence. Orders a day a press cannot. */
  daySequence: Map<string, number>;
  boundarySegments: Map<string, JobDaySegment>;
  boundaryIds: Set<string>;
}): Promise<void> {
  const { jobId, timeZone, tenantId, cardPool, placed, touched, daySequence } = args;

  // person|date → every card that person clocked that day. One card per day on
  // 297 of 298 production person-days; the exception is a night shift, and each
  // of its cards divides on its own terms.
  const cardsByPersonDay = new Map<string, any[]>();
  const seenCards = new Set<string>();
  for (const c of cardPool) {
    if (!c?.id || !c.user_id || !c.date || seenCards.has(c.id)) continue;
    seenCards.add(c.id);
    const key = `${c.user_id}|${c.date}`;
    const list = cardsByPersonDay.get(key) ?? [];
    list.push(c);
    cardsByPersonDay.set(key, list);
  }
  if (cardsByPersonDay.size === 0) return;

  // person|date → the jobs that day, by the authority ladder documented above.
  //
  // The ladder itself lives in lib/timecard-job-rules.ts and is shared with the
  // TIMECARD, which lists a day's jobs rather than dividing them. One rule, two
  // callers, so the two documents can never disagree about where somebody was.
  //
  // `always_counts` preserves THIS path's rule exactly: a card carrying a job tag
  // is always one of that day's jobs, because the hours being divided are on that
  // very card (Zack, Aug 14). The timecard uses the default `'lowest'` instead —
  // the clock-in stamp is frozen before the office finishes the board, so for
  // PAYROLL it is the last rung, not the first. See that module's note.
  const dayJobs = new Map<string, Set<string>>();
  const personDayKeys = new Set<string>([
    ...placed.keys(),
    ...touched.keys(),
    ...cardsByPersonDay.keys(),
  ]);
  for (const key of personDayKeys) {
    const evidence: JobDayEvidence[] = [];
    for (const j of placed.get(key) ?? []) evidence.push({ jobId: j, source: 'day_ledger' });
    // `touched` already merges operator and helper logs; they share one rung, so
    // the distinction is immaterial to the split and is not reconstructed here.
    for (const j of touched.get(key) ?? []) evidence.push({ jobId: j, source: 'operator_log' });
    for (const c of cardsByPersonDay.get(key) ?? []) {
      if (c.job_order_id) evidence.push({ jobId: c.job_order_id, source: 'timecard' });
    }
    const { jobIds } = resolveDayJobs(evidence, { cardTagPolicy: 'always_counts' });
    if (jobIds.length > 0) dayJobs.set(key, new Set(jobIds));
  }

  // Only days that (a) have two or more jobs and (b) include THIS one.
  const candidates: Array<{ key: string; date: string; jobIds: string[] }> = [];
  const neededJobIds = new Set<string>();
  const neededDates = new Set<string>();
  for (const [key, jobs] of dayJobs) {
    if (jobs.size < 2 || !jobs.has(jobId)) continue;
    if (!cardsByPersonDay.has(key)) continue;
    const sep = key.lastIndexOf('|');
    const date = key.slice(sep + 1);
    if (!date) continue;
    candidates.push({ key, date, jobIds: Array.from(jobs) });
    for (const j of jobs) neededJobIds.add(j);
    neededDates.add(date);
  }
  if (candidates.length === 0) return;

  const jobIdList = Array.from(neededJobIds);
  const dateList = Array.from(neededDates);

  let jobStampQuery = supabaseAdmin
    .from('job_orders')
    // `work_completed_at` feeds `jobCloseOnDate` (rule 6) and NOTHING else here.
    // Column names verified against information_schema — one bad name and
    // PostgREST rejects the whole select, `rowsOrThrow` throws, and the route
    // answers 500 rather than quietly printing a day that did not divide.
    .select('id, route_started_at, in_route_at, work_started_at, work_completed_at')
    .in('id', jobIdList);
  if (tenantId) jobStampQuery = jobStampQuery.eq('tenant_id', tenantId);

  // Any operator's log for the job+date: the press belongs to the JOB that day,
  // not to whoever happened to file the paperwork. A helper never files one.
  let logStampQuery = supabaseAdmin
    .from('daily_job_logs')
    // `day_completed_at` is the per-DAY close — the one that draws Keon's Aug 11
    // boundary, since ISC's log closed at 15:04:36 and Leifeng never pressed.
    .select('job_order_id, log_date, route_started_at, work_started_at, day_completed_at')
    .in('job_order_id', jobIdList)
    .in('log_date', dateList);
  if (tenantId) logStampQuery = logStampQuery.eq('tenant_id', tenantId);

  const [jobStampRes, logStampRes] = await Promise.all([jobStampQuery, logStampQuery]);
  const jobStampRows = rowsOrThrow(jobStampRes, 'job start and close stamps');
  const logStampRows = rowsOrThrow(logStampRes, 'daily-log start and close stamps');

  const stampsByJob = new Map<string, any>();
  for (const r of jobStampRows) stampsByJob.set(r.id, r);
  const logsByJobDate = new Map<string, any[]>();
  for (const r of logStampRows) {
    if (!r.job_order_id || !r.log_date) continue;
    const k = `${r.job_order_id}|${r.log_date}`;
    const list = logsByJobDate.get(k) ?? [];
    list.push(r);
    logsByJobDate.set(k, list);
  }

  for (const { key, date, jobIds } of candidates) {
    const starts = jobIds.map((j) => {
      const logs = logsByJobDate.get(`${j}|${date}`) ?? [];
      const stamps = stampsByJob.get(j) ?? null;
      return {
        job_order_id: j,
        started_at: jobStartOnDate(date, logs, stamps, j, timeZone),
        // Rule 6's fallback and rule 7's ordering. Both are inert on a day where
        // every job pressed — which is every day that resolves today.
        completed_at: jobCloseOnDate(date, logs, stamps, j, timeZone),
        day_sequence: daySequence.get(`${j}|${date}`) ?? null,
      };
    });
    for (const card of cardsByPersonDay.get(key) ?? []) {
      const segments = splitClockDayAtJobStarts(card, starts);
      if (!segments) continue; // guard (b): a job with no press, or no day to divide
      const mine = segments.find((s) => s.job_order_id === jobId);
      if (!mine) continue;
      args.boundarySegments.set(card.id, mine);
      args.boundaryIds.add(card.id);
    }
  }
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
