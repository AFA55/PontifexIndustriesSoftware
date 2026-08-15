/**
 * "THEY FINISHED, BUT NOBODY PRESSED DONE" — the close-out nudge.
 *
 * FOUNDER (Aug 15), looking at a job whose work was plainly finished: "this is
 * an example of something that the PM should have known — they haven't
 * completed their job. That job is done but the operator hasn't pressed submit
 * or completed job. We should have a button that sends a notification to them
 * to complete their job."
 *
 * The screen ALREADY tells the office this ("Day 3 — in progress · Work logged;
 * day not wrapped up yet"). What it never offered was a way to act on it, so
 * the PM's only move was to find the operator's phone number. This is the
 * missing verb.
 *
 * WHAT COUNTS AS UNWRAPPED. A day has work logged against it but its daily log
 * has no `day_completed_at`. Verified against production on Aug 15: six such
 * days across four live jobs, and in every one the log ROW existed — so the
 * signal is the missing timestamp, not a missing row. A rule written around
 * "no log row" would have found nothing and reported all-clear.
 *
 * WHO IT GOES TO, and why it is not the same answer as the waiver nudge: the
 * person who has to press the button is the person who DID THE WORK on the day
 * that was left open — not whoever happens to hold the job today. On a job
 * where the crew rotated, nagging today's operator about Tuesday is both
 * useless and the kind of misdirected alert that trains people to swipe alerts
 * away. Today's crew is the fallback, for the case where the day's work has no
 * operator recorded at all.
 *
 * Everything here is pure so it can be tested without a database.
 */

/** How long one press covers. A second press inside the window is a no-op. */
export const CLOSEOUT_NUDGE_WINDOW_MS = 60 * 60 * 1000;

/** Chasing a close-out on a finished or abandoned job accomplishes nothing. */
const CLOSED_STATUSES = new Set(['completed', 'cancelled']);

export function isCloseoutClosed(jobStatus: string | null | undefined): boolean {
  return CLOSED_STATUSES.has(String(jobStatus ?? '').toLowerCase());
}

export interface WorkDayRow {
  /** 'YYYY-MM-DD' — the bare date column. Never parsed into a Date. */
  work_date?: string | null;
  day_number?: number | null;
  operator_id?: string | null;
}

export interface DailyLogRow {
  /** 'YYYY-MM-DD'. */
  log_date?: string | null;
  day_number?: number | null;
  day_completed_at?: string | null;
  operator_id?: string | null;
}

export interface OpenDay {
  /** 'YYYY-MM-DD' when known, else null for work filed without a date. */
  date: string | null;
  day_number: number | null;
  /** Everyone who logged work or held the log on that day. */
  operator_ids: string[];
}

/**
 * The days that were worked but never wrapped up, oldest first.
 *
 * Matching is by DATE where both sides have one, falling back to `day_number`.
 * Day numbers are a calendar POSITION on this job (a migration named exactly
 * that), so two sources can disagree about the number while agreeing about the
 * day — the date is the more trustworthy key and is tried first.
 *
 * A day whose log carries `day_completed_at` is finished and never appears
 * here, even if more work items were filed against it afterwards.
 */
export function openWorkDays(
  workItems: WorkDayRow[] | null | undefined,
  logs: DailyLogRow[] | null | undefined,
): OpenDay[] {
  const logList = (logs ?? []).filter(Boolean);

  // Index the logs both ways so either key can answer.
  const logByDate = new Map<string, DailyLogRow>();
  const logByNumber = new Map<number, DailyLogRow>();
  for (const l of logList) {
    if (l.log_date) logByDate.set(l.log_date, l);
    if (typeof l.day_number === 'number') logByNumber.set(l.day_number, l);
  }

  const findLog = (date: string | null, num: number | null): DailyLogRow | undefined => {
    if (date && logByDate.has(date)) return logByDate.get(date);
    if (typeof num === 'number' && logByNumber.has(num)) return logByNumber.get(num);
    return undefined;
  };

  // COMPLETION IS A PROPERTY OF THE DAY, NOT OF ONE ROW.
  //
  // `daily_job_logs` holds one row PER OPERATOR per day. When a two-person crew
  // works, the lead presses Done for Today and gets a real `day_completed_at`;
  // the helper's row keeps 0.00 hours and a null timestamp forever. That is a
  // normal artifact of how the app writes, not an unwrapped day.
  //
  // Reading the flag off a single row therefore reports finished days as open.
  // Production on Aug 15 had four such job-days across three live jobs — every
  // one a mixed pair — so this would have told Devin Scroggs to go close out
  // Aug 11-13 on Pratt, two of which Conrade had already closed. A reminder
  // aimed at the wrong person for work already done is exactly the noise that
  // teaches a crew to ignore notifications.
  const completedDates = new Set<string>();
  const completedNums = new Set<number>();
  for (const l of logList) {
    if (!l.day_completed_at) continue;
    if (l.log_date) completedDates.add(l.log_date);
    if (typeof l.day_number === 'number') completedNums.add(l.day_number);
  }
  const dayIsDone = (date: string | null, num: number | null): boolean =>
    (!!date && completedDates.has(date)) ||
    (typeof num === 'number' && completedNums.has(num));

  // Group the work by the day it belongs to.
  const byKey = new Map<string, OpenDay>();
  const push = (date: string | null, num: number | null, operatorId: string | null | undefined) => {
    const key = date ?? (typeof num === 'number' ? `#${num}` : 'undated');
    const existing = byKey.get(key);
    const target = existing ?? { date, day_number: num, operator_ids: [] };
    if (!existing) byKey.set(key, target);
    // Keep whichever identifiers we learn; a later row may carry the one the
    // first row lacked.
    if (target.date === null && date) target.date = date;
    if (target.day_number === null && typeof num === 'number') target.day_number = num;
    if (operatorId && !target.operator_ids.includes(operatorId)) target.operator_ids.push(operatorId);
  };

  for (const w of (workItems ?? []).filter(Boolean)) {
    const date = w.work_date ?? null;
    const num = typeof w.day_number === 'number' ? w.day_number : null;
    // Wrapped up — nothing to chase.
    if (dayIsDone(date, num)) continue;
    const log = findLog(date, num);
    // Adopt the log's date when the work item has none. The job page holds work
    // items grouped by day NUMBER with no date at all, so without this the same
    // day buckets twice — once under its number, once under its date — and the
    // banner reads "2 days never wrapped up · Aug 12 and Day 3" for one day.
    const effDate = date ?? log?.log_date ?? null;
    push(effDate, num, w.operator_id);
    // The person who owns the log is on the hook too, even if the items were
    // filed under a helper.
    if (log?.operator_id) push(effDate, num, log.operator_id);
  }

  // A log that was opened and left open with NO work items against it is still
  // an unwrapped day — the crew started the day and never closed it.
  for (const l of logList) {
    const date = l.log_date ?? null;
    const num = typeof l.day_number === 'number' ? l.day_number : null;
    if (dayIsDone(date, num)) continue;
    if (!date && num === null) continue;
    push(date, num, l.operator_id);
  }

  // Oldest first: the day that has been open longest is the one to name.
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    if (a.date) return -1;
    if (b.date) return 1;
    return (a.day_number ?? 0) - (b.day_number ?? 0);
  });
}

/** The button only exists where pressing it would accomplish something. */
export function canNudgeCloseout(input: {
  jobStatus: string | null | undefined;
  openDays: OpenDay[] | null | undefined;
}): boolean {
  return !isCloseoutClosed(input.jobStatus) && (input.openDays?.length ?? 0) > 0;
}

/**
 * Who to tell. The operators on the open days, in order; today's crew only if
 * those days name nobody at all.
 */
export function closeoutRecipients(
  openDays: OpenDay[] | null | undefined,
  fallbackCrew: string[] = [],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | null | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const d of openDays ?? []) for (const id of d.operator_ids) add(id);
  if (out.length === 0) for (const id of fallbackCrew) add(id);
  return out;
}

/** How a day is named to a human. Dates are formatted by the caller. */
export function describeOpenDays(days: OpenDay[], formatDate: (ymd: string) => string): string {
  const labels = days.map((d) =>
    d.date ? formatDate(d.date) : d.day_number !== null ? `Day ${d.day_number}` : 'a logged day'
  );
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * What the crew is told. Deliberately not an accusation — the usual cause is a
 * phone that lost signal in a parking garage, not someone ignoring the app.
 */
export function closeoutNudgeMessage(input: {
  customerName?: string | null;
  daysLabel: string;
}): { title: string; message: string } {
  const customer = (input.customerName || 'this job').trim();
  const days = input.daysLabel ? ` for ${input.daysLabel}` : '';
  return {
    title: 'Finish your work ticket 📋',
    message:
      `Your work at ${customer}${days} is logged but the day was never wrapped up. ` +
      `Open the job and press Done for Today so the office can print the ticket.`,
  };
}

/**
 * One dedup slot per job per hour, shared by every recipient. Bucketed on
 * absolute time rather than "last sent at" so two admins pressing at once
 * cannot both win.
 */
export function closeoutNudgeDedupKey(
  jobId: string,
  nowMs: number,
  windowMs: number = CLOSEOUT_NUDGE_WINDOW_MS,
): string {
  return `closeout_nudge:${jobId}:${Math.floor(nowMs / windowMs)}`;
}

/** What the button says back. A press that silently does nothing is the bug. */
export function closeoutNudgeSummary(input: {
  notified: number;
  alreadyNotified: number;
  names?: string[];
}): string {
  const who = (input.names ?? []).filter(Boolean);
  const list = who.length > 0 ? ` (${who.join(', ')})` : '';
  if (input.notified > 0) {
    return `Reminder sent to ${input.notified} crew ${input.notified === 1 ? 'member' : 'members'}${list}.`;
  }
  if (input.alreadyNotified > 0) {
    return `Already reminded within the last hour — the crew has the notification${list}.`;
  }
  return 'Nobody is recorded on the open days, so there was nobody to remind.';
}
