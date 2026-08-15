/**
 * DOES THIS JOB OCCUPY THIS DAY?
 *
 * A multi-day job is stored as a span — a start date and an end date — and
 * every screen that asks "what is on today" answered it with
 * `start <= today <= end`. A span does not skip weekends, so a job running
 * Monday to Friday next week sat on the board on Saturday and Sunday, was
 * counted in Jobs Today, and consumed a capacity slot on days nobody works.
 *
 * On Saturday Aug 15 that put ELEVEN jobs against a ten-slot day — "FULL 11/10"
 * — when three crews were working. The office reads that number to decide
 * whether it can take another call, so an inflated one costs real work.
 *
 * The answer was already in the data and simply never read. Every one of those
 * jobs carries `scheduling_flexibility.can_work_weekends = false`, set on the
 * schedule form, because Patriot does not work weekends unless a job says
 * otherwise. Same for `can_work_fridays`.
 *
 * DEFAULTS, and why they lean this way:
 *   • weekends → NOT worked unless the job explicitly says it can be
 *   • Fridays  → worked unless the job explicitly says it cannot
 * A job that starts ON a weekend day is always shown: somebody deliberately put
 * it there, and hiding a job the office scheduled would be worse than showing
 * one it did not.
 */

export interface JobSpan {
  scheduled_date?: string | null;
  end_date?: string | null;
  scheduling_flexibility?: {
    can_work_weekends?: boolean | null;
    can_work_fridays?: boolean | null;
  } | null;
}

/** 0 = Sunday … 6 = Saturday, read from a bare 'YYYY-MM-DD' in LOCAL time. */
function dayOfWeek(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getDay();
}

export function isWeekendDay(ymd: string): boolean {
  const dow = dayOfWeek(ymd);
  return dow === 0 || dow === 6;
}

export function isFriday(ymd: string): boolean {
  return dayOfWeek(ymd) === 5;
}

/**
 * Can this job be worked on this calendar day, given its own rules?
 * Answers only the DAY-OF-WEEK question — the caller still checks the span.
 */
export function jobCanWorkOn(job: JobSpan, ymd: string): boolean {
  // A job scheduled to START on this day is on this day, whatever the rules
  // say. Someone put it there on purpose.
  if (job.scheduled_date === ymd) return true;

  const flex = job.scheduling_flexibility ?? undefined;

  if (isWeekendDay(ymd)) return flex?.can_work_weekends === true;
  // Fridays are worked by default; only an explicit `false` removes them.
  if (isFriday(ymd)) return flex?.can_work_fridays !== false;
  return true;
}

/**
 * The whole question: does this job occupy `ymd`?
 * Span first, then the day-of-week rules above.
 */
export function jobRunsOn(job: JobSpan, ymd: string): boolean {
  const start = job.scheduled_date;
  if (!start || start > ymd) return false;
  const end = job.end_date;
  if (end && end < ymd) return false;
  return jobCanWorkOn(job, ymd);
}

/**
 * Working days between two dates for a job, honouring its own rules —
 * the basis for "this job needs N more days" rather than a hand-typed end date.
 */
export function countWorkingDays(job: JobSpan, fromYMD: string, toYMD: string): number {
  if (!fromYMD || !toYMD || fromYMD > toYMD) return 0;
  let count = 0;
  const [y, m, d] = fromYMD.split('-').map(Number);
  const cursor = new Date(y, (m || 1) - 1, d || 1);
  for (let guard = 0; guard < 3650; guard++) {
    const ymd = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (ymd > toYMD) break;
    if (jobCanWorkOn(job, ymd)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/**
 * The end date a job of `workingDays` length reaches, starting at `startYMD`
 * and skipping the days it cannot be worked.
 *
 * THE POINT (founder, Aug 15): "instead of end dates we were going to put how
 * many days are left in it… let's make them input how many days they had on the
 * job instead of end date, and based on what days they say we can work will
 * determine when we have the job finishing." A hand-typed end date drifts the
 * moment a day is lost to weather or a crew is pulled — and Pratt's said Aug 17
 * on a job with thirty days left in it, which is why it vanished from next
 * week's board.
 */
export function endDateForWorkingDays(
  job: JobSpan,
  startYMD: string,
  workingDays: number
): string {
  if (!startYMD || workingDays <= 0) return startYMD;
  const [y, m, d] = startYMD.split('-').map(Number);
  const cursor = new Date(y, (m || 1) - 1, d || 1);
  let remaining = workingDays;
  let last = startYMD;

  for (let guard = 0; guard < 3650 && remaining > 0; guard++) {
    const ymd = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (jobCanWorkOn(job, ymd)) {
      remaining--;
      last = ymd;
    }
    if (remaining > 0) cursor.setDate(cursor.getDate() + 1);
  }
  return last;
}
