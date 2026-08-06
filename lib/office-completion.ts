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
