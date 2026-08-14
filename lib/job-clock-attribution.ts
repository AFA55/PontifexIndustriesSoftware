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

export const TIMECARD_ATTRIBUTION_SELECT =
  'id, user_id, date, clock_in_time, clock_out_time, lunch_duration_minutes, ' +
  'break_minutes, net_hours, total_hours, is_shop_hours, is_shop_time, work_location, job_order_id';

export interface AttributedClockCards {
  /** Cards that provably belong to this job. */
  cards: any[];
  /** Dates where someone's hours could NOT be attributed (they split the day). */
  splitDates: Set<string>;
}

/**
 * Resolve the clock cards attributable to `jobId`.
 *
 * @param userIds everyone who might have worked it (log authors + crew slots)
 * @param dates   the days the job ran
 * @param select  column list; defaults to TIMECARD_ATTRIBUTION_SELECT.
 *                MUST include `job_order_id`, `user_id` and `date`.
 */
export async function attributableTimecards(
  jobId: string,
  userIds: string[],
  dates: string[],
  select: string = TIMECARD_ATTRIBUTION_SELECT
): Promise<AttributedClockCards> {
  const splitDates = new Set<string>();

  // Cards explicitly tagged with this job are the job's, full stop.
  const { data: linked } = await supabaseAdmin
    .from('timecards')
    .select(select)
    .eq('job_order_id', jobId)
    .order('clock_in_time', { ascending: true });

  const cards: any[] = (linked as any[]) ?? [];

  // WIDEN THE QUESTION FIRST. The caller only knows the days that produced a
  // log; a day worked and never filed is exactly the day we are looking for.
  // The office's per-day crew ledger supplies it.
  const { data: ownAssignments } = await supabaseAdmin
    .from('job_daily_assignments')
    .select('assignment_date, operator_id, helper_id')
    .eq('job_order_id', jobId);

  const userSet = new Set(userIds);
  const dateSet = new Set(dates);
  for (const a of (ownAssignments as any[]) ?? []) {
    // Empty skeleton rows hold a date open on the board — nobody was placed.
    if (!a.operator_id && !a.helper_id) continue;
    if (a.assignment_date) dateSet.add(a.assignment_date);
    if (a.operator_id) userSet.add(a.operator_id);
    if (a.helper_id) userSet.add(a.helper_id);
  }
  userIds = Array.from(userSet);
  dates = Array.from(dateSet);

  if (userIds.length === 0 || dates.length === 0) return { cards, splitDates };

  const [{ data: byCrew }, { data: opLogs }, { data: helpLogs }, { data: allAssignments }] = await Promise.all([
    supabaseAdmin
      .from('timecards')
      .select(select)
      .in('user_id', userIds)
      .in('date', dates)
      .order('clock_in_time', { ascending: true }),
    supabaseAdmin
      .from('daily_job_logs')
      .select('operator_id, log_date, job_order_id')
      .in('operator_id', userIds)
      .in('log_date', dates),
    supabaseAdmin
      .from('helper_work_logs')
      .select('helper_id, log_date, job_order_id')
      .in('helper_id', userIds)
      .in('log_date', dates),
    // Every job these people were placed on across these days — needed to tell
    // "the office put them here" from "the office put them in two places".
    supabaseAdmin
      .from('job_daily_assignments')
      .select('assignment_date, operator_id, helper_id, job_order_id')
      .in('assignment_date', dates),
  ]);

  // person|date → the set of jobs they filed work on that day.
  const touched = new Map<string, Set<string>>();
  const note = (uid?: string | null, d?: string | null, jid?: string | null) => {
    if (!uid || !d || !jid) return;
    const k = `${uid}|${d}`;
    const s = touched.get(k) ?? new Set<string>();
    s.add(jid);
    touched.set(k, s);
  };
  for (const r of (opLogs as any[]) ?? []) note(r.operator_id, r.log_date, r.job_order_id);
  for (const r of (helpLogs as any[]) ?? []) note(r.helper_id, r.log_date, r.job_order_id);

  // person|date → the set of jobs the OFFICE placed them on that day.
  const placed = new Map<string, Set<string>>();
  const place = (uid: string | null | undefined, d: string, jid: string) => {
    if (!uid) return;
    const k = `${uid}|${d}`;
    const s = placed.get(k) ?? new Set<string>();
    s.add(jid);
    placed.set(k, s);
  };
  for (const a of (allAssignments as any[]) ?? []) {
    if (!a.assignment_date || !a.job_order_id) continue;
    place(a.operator_id, a.assignment_date, a.job_order_id);
    place(a.helper_id, a.assignment_date, a.job_order_id);
  }

  const seen = new Set(cards.map((c) => c.id));
  for (const t of ((byCrew as any[]) ?? [])) {
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
    cards.push(t);
  }

  return { cards, splitDates };
}
