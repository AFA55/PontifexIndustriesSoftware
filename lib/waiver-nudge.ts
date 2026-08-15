/**
 * THE MANUAL WAIVER NUDGE — who it goes to, how often, and what the office is
 * told about a waiver that was never signed.
 *
 * FOUNDER (Aug 15): "Once job is complete and the utility waiver wasn't signed,
 * just say NOT SIGNED instead of Outstanding, because there's no point getting
 * it now. But create a button where, if the job is ACTIVE and they haven't
 * gotten it signed, admin or PMs and supervisors can send notifications to them
 * to get that waiver signed — just make it a button in job view."
 *
 * Two halves, both pure so they can be tested without a database:
 *
 * 1. WHAT THE ROW SAYS. An alarm nobody can act on is worse than no alarm — it
 *    teaches people to ignore the ones that matter. On a closed job the waiver
 *    is a fact to record, not a task to chase, so it goes neutral and loses the
 *    button. While the job is live it stays a warning AND gains the button.
 *
 * 2. WHO GETS NUDGED. A job is crewed through THREE independent paths and this
 *    codebase has shipped four production bugs in one week from reading only
 *    the first:
 *      • `job_orders.assigned_to` / `helper_assigned_to` — the job-level slots
 *      • `job_crew`                                       — extra crew via "+"
 *      • `job_daily_assignments`                          — the per-day board
 *    Javier's Simpsonville job (Aug 15) was crewed ENTIRELY through the per-day
 *    board: both slots null, one ledger row. Reading the slots alone would send
 *    this nudge to nobody while the button reported success.
 *
 * The wording itself is NOT here — it lives in lib/waiver-chase, so the manual
 * nudge and the cron say exactly the same thing.
 */

/** How long one press covers. A second press inside the window is a no-op. */
export const WAIVER_NUDGE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Statuses where chasing the signature is pointless. `cancelled` joins
 * `completed` because there is even less to gain from a waiver on work that
 * never happened. Everything else — including `pending_completion`, where the
 * crew may still be on site awaiting office review — counts as live, which is
 * also the set the cron chases.
 */
const CLOSED_STATUSES = new Set(['completed', 'cancelled']);

export function isWaiverChaseClosed(jobStatus: string | null | undefined): boolean {
  return CLOSED_STATUSES.has(String(jobStatus ?? '').toLowerCase());
}

export type WaiverRowState =
  /** Signed — show the document. */
  | 'signed'
  /** Job is over and it never came back. Record it, do not alarm about it. */
  | 'not_signed_closed'
  /** Job is live and the signature is still missing — chase it. */
  | 'outstanding';

/** The exact words each state puts on the Signed Documents row. */
export const WAIVER_STATE_LABEL: Record<WaiverRowState, string> = {
  signed: 'Signed',
  not_signed_closed: 'Not signed',
  outstanding: 'Outstanding',
};

export function waiverRowState(input: {
  signed: boolean;
  jobStatus: string | null | undefined;
}): WaiverRowState {
  if (input.signed) return 'signed';
  return isWaiverChaseClosed(input.jobStatus) ? 'not_signed_closed' : 'outstanding';
}

/** The nudge button only exists where pressing it would accomplish something. */
export function canNudgeWaiver(input: {
  requireWaiver: boolean | null | undefined;
  signed: boolean | null | undefined;
  jobStatus: string | null | undefined;
}): boolean {
  return !!input.requireWaiver && !input.signed && !isWaiverChaseClosed(input.jobStatus);
}

/**
 * One dedup slot per job per hour, shared by every recipient so the whole crew
 * moves together. Bucketed on absolute time rather than on "last sent at" so
 * two admins pressing the button at once cannot both win.
 */
export function waiverNudgeDedupKey(
  jobId: string,
  nowMs: number,
  windowMs: number = WAIVER_NUDGE_WINDOW_MS,
): string {
  const bucket = Math.floor(nowMs / windowMs);
  return `waiver_nudge:${jobId}:${bucket}`;
}

export interface WaiverNudgeJobSlots {
  assigned_to?: string | null;
  helper_assigned_to?: string | null;
}
export interface WaiverNudgeCrewRow {
  user_id?: string | null;
}
export interface WaiverNudgeDailyRow {
  operator_id?: string | null;
  helper_id?: string | null;
  /** 'YYYY-MM-DD'. Bare date string from the DB — never parsed into a Date. */
  assignment_date?: string | null;
}

/**
 * The per-day ledger rows that describe TODAY'S crew.
 *
 * A five-day job has five ledger rows and the crew rotates between them. The
 * founder asked for "the CURRENT crew", so notifying everyone who ever held a
 * day on the job would text people who finished with it on Monday — precisely
 * the kind of noise that makes a legal reminder get ignored.
 *
 * Rule: today's rows if today has any; otherwise the NEAREST UPCOMING day (the
 * button also lives on jobs that are scheduled but have not started). Only if
 * the whole ledger is in the past does it fall back to the most recent day.
 *
 * Comparison is string-on-string over 'YYYY-MM-DD', which sorts correctly and
 * never touches `new Date()` — the timezone bug this codebase keeps re-earning.
 */
export function currentDailyAssignments(
  rows: WaiverNudgeDailyRow[] | null | undefined,
  todayYMD: string,
): WaiverNudgeDailyRow[] {
  const all = (rows ?? []).filter(Boolean);
  // A row with no date cannot be placed on a day; it is still a real
  // assignment, so it is always kept rather than silently dropped.
  const undated = all.filter((r) => !r.assignment_date);
  const dated = all.filter((r) => !!r.assignment_date);
  if (dated.length === 0) return undated;

  const today = dated.filter((r) => r.assignment_date === todayYMD);
  if (today.length > 0) return [...today, ...undated];

  const future = dated.filter((r) => (r.assignment_date as string) > todayYMD);
  if (future.length > 0) {
    const soonest = future.reduce(
      (min, r) => ((r.assignment_date as string) < min ? (r.assignment_date as string) : min),
      future[0].assignment_date as string,
    );
    return [...future.filter((r) => r.assignment_date === soonest), ...undated];
  }

  const latest = dated.reduce(
    (max, r) => ((r.assignment_date as string) > max ? (r.assignment_date as string) : max),
    dated[0].assignment_date as string,
  );
  return [...dated.filter((r) => r.assignment_date === latest), ...undated];
}

/**
 * Every person currently on the job, from all three assignment paths,
 * de-duplicated and in a stable order (slots → job_crew → per-day ledger).
 *
 * Order matters only for readability of the "notified X, Y" message; the set is
 * what counts. Falsy ids are dropped, so a cleared helper slot notifies nobody
 * rather than blowing up a `.in()` query with a null.
 */
export function resolveWaiverNudgeRecipients(
  job: WaiverNudgeJobSlots | null | undefined,
  crew: WaiverNudgeCrewRow[] = [],
  daily: WaiverNudgeDailyRow[] = [],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | null | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  add(job?.assigned_to);
  add(job?.helper_assigned_to);
  for (const c of crew ?? []) add(c?.user_id);
  for (const d of daily ?? []) {
    add(d?.operator_id);
    add(d?.helper_id);
  }
  return out;
}

/**
 * What the button says back. A press that quietly does nothing is the failure
 * mode this codebase keeps producing, so "already sent" is a first-class
 * outcome with its own sentence rather than a silent success.
 */
export function waiverNudgeSummary(input: {
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
  return 'Nobody is assigned to this job yet, so there was nobody to remind.';
}
