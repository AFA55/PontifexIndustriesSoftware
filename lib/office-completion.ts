/**
 * When the office closes a job, how long does the operator keep writing?
 *
 * ── The rule (founder, Aug 2026) ─────────────────────────────────────────────
 * "Read-only after he submits his current day."
 *
 * Management can close a job the operator never closed — but closing it must
 * not cost us the work record, because collecting that record is the entire
 * point of the ticket. So:
 *
 *   • Office hasn't closed it        → he writes freely.
 *   • Office closed it, today's log
 *     NOT yet submitted              → he can still finish the day he is on.
 *   • Office closed it, today's log
 *     already submitted              → read-only.
 *
 * The middle case is the one that matters. An operator halfway through entering
 * a day's footage when the office closes the job must not lose it — he gets to
 * finish that day and submit, and only then does the ticket lock.
 *
 * The job stays on his schedule for the days he worked either way, so he can
 * always look back at what he did.
 */

/**
 * Who may close a job on the office's behalf.
 *
 * Supervisors are included on the founder's instruction — they are on site and
 * usually the first to know a job actually finished. Operators are NOT: the
 * whole point is that this is the path for when the operator didn't do it.
 *
 * The API route imports this list, and so does every surface that decides
 * whether to draw the button, so a role can never be permitted in one place and
 * refused in the other. The route also runs the full `officeCloseAffordance()`
 * below before it writes — role AND state — so a hand-rolled POST cannot reach
 * a job the buttons would never have offered.
 */
export const OFFICE_CLOSE_ROLES = [
  'admin',
  'super_admin',
  'operations_manager',
  'supervisor',
] as const;

export function canOfficeClose(role?: string | null): boolean {
  return (OFFICE_CLOSE_ROLES as readonly string[]).includes(role || '');
}

/** What, if anything, the office-close control should offer on a given job. */
export type OfficeCloseAffordance = 'close' | 'reopen' | 'none';

export interface OfficeCloseSubject {
  /** job_orders.status */
  status?: string | null;
  /** job_orders.office_completed_at */
  officeCompletedAt?: string | null;
  /** job_orders.completion_signed_at — the operator's own sign-off. */
  operatorCompletedAt?: string | null;
}

/**
 * WHY THIS IS A FUNCTION AND NOT AN INLINE `&&` PER PAGE.
 *
 * The control now lives on five surfaces (job detail, schedule board, Active
 * Jobs, Pending Jobs, Completed Jobs) and the POST route runs it too before it
 * writes. Drawing "Mark complete (office)" on a job that is
 * already finished is a false affordance — the button either does nothing or,
 * worse, invites someone to re-close work that was closed properly. The rule
 * has to be identical everywhere, so it is written once:
 *
 *   • the office already closed it        → offer REOPEN (the undo path)
 *   • the operator signed it off          → nothing; his close is the real one
 *   • it is finished/cancelled some other
 *     way (8 such jobs in production)     → nothing; "complete" is not the fix
 *   • the viewer cannot close jobs        → nothing
 *   • otherwise                           → offer CLOSE
 */
const ALREADY_SETTLED = new Set(['completed', 'cancelled', 'archived']);

export function officeCloseAffordance(
  job: OfficeCloseSubject,
  viewerRole?: string | null
): OfficeCloseAffordance {
  if (!canOfficeClose(viewerRole)) return 'none';
  if (job.officeCompletedAt) return 'reopen';
  if (job.operatorCompletedAt) return 'none';
  if (ALREADY_SETTLED.has((job.status || '').toLowerCase())) return 'none';
  return 'close';
}

export interface OfficeCompletionState {
  /** When the office closed the job, if they have. */
  officeCompletedAt?: string | null;
  /**
   * Has the operator already submitted his log for the day he is working?
   * i.e. daily_job_logs.day_completed_at is set for this operator + this date.
   */
  currentDaySubmitted?: boolean | null;
  /** A job the OPERATOR completed normally locks through the usual path. */
  operatorCompletedAt?: string | null;
}

export type OperatorAccess = 'editable' | 'finish_current_day' | 'read_only';

/**
 * What the operator may do with this ticket right now.
 *
 * `finish_current_day` still permits writes — it is `editable` with a warning
 * attached, so the UI can tell him to wrap up without taking the keyboard away
 * mid-entry.
 */
export function operatorAccess(state: OfficeCompletionState): OperatorAccess {
  const officeClosed = !!state.officeCompletedAt;
  if (!officeClosed) return 'editable';
  return state.currentDaySubmitted ? 'read_only' : 'finish_current_day';
}

/** Convenience: may the operator write to this ticket at all? */
export function canOperatorEdit(state: OfficeCompletionState): boolean {
  return operatorAccess(state) !== 'read_only';
}

/**
 * What to tell the operator. Returns null when there is nothing to say —
 * a banner that appears on every ticket stops being read.
 */
export function operatorNotice(
  state: OfficeCompletionState,
  reason?: string | null
): { tone: 'warning' | 'locked'; title: string; body: string } | null {
  const access = operatorAccess(state);
  if (access === 'editable') return null;

  const because = reason?.trim() ? ` Reason given: ${reason.trim()}` : '';

  if (access === 'finish_current_day') {
    return {
      tone: 'warning',
      title: 'The office marked this job complete',
      body:
        `Finish the day you're on and submit it — your ticket stays open until you do.` +
        `${because}`,
    };
  }

  return {
    tone: 'locked',
    title: 'This job is closed',
    body:
      `The office marked it complete and your work for the day is submitted, so the ticket is now read-only. ` +
      `It stays on your schedule for the days you were here.${because}`,
  };
}
