/**
 * The terminal choice at the end of an operator's day: "Done for Today" vs
 * "Job Complete" — and, crucially, whether that choice is allowed to change
 * what KIND of job this is without anyone saying so out loud.
 *
 * ── WHY THIS EXISTS (founder, Aug 17 2026) ───────────────────────────────────
 * "Some operators get confused when they see Done for Day or Job Complete."
 *
 * The two controls were siblings: same size, same shape, stacked, with the
 * consequence living in a label you had to already understand. Five of the six
 * day-closeouts between Aug 14 and Aug 17 left their job un-advanced —
 * scheduled / assigned / on_hold with the day closed out — because the crew
 * pressed the amber one. David Schadt finished a job on site, pressed "Done for
 * Today", and the job sat as not-complete; he never reached the customer
 * signature either, because that step only exists on the completion path.
 *
 * The compounding damage is the part that matters. "Done for Today" writes
 * `is_multi_day: true` and `status: 'scheduled'`. On a job the office booked
 * for ONE day that single tap silently converts it into a multi-day job:
 * it overruns its `end_date`, drops out of the operator's day list (that query
 * needs `end_date >= today`), reschedules itself indefinitely, never completes,
 * and never reaches invoicing. JOB-2026-160762 went that way and had to be
 * rescued by hand.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * A job may only continue to tomorrow WITHOUT being asked when the office
 * actually booked a day after today. That is the whole test:
 *
 *     today < the last day the office booked   →  frictionless, expected
 *     anything else                            →  confirm, naming the cost
 *
 * "Anything else" is exactly the two damaging cases:
 *   • a one-day booking (start === end)      → the silent conversion
 *   • the last booked day, or past it        → the silent overrun
 *
 * The rule is deliberately derived from the OFFICE's booking (scheduled_date /
 * scheduled_end_date), never from `job_orders.is_multi_day`. That flag is the
 * thing this bug corrupts, so trusting it would let one wrong tap authorise the
 * next one. When the dates are unknown, we ask — confirming is the safe
 * direction, and a question costs one tap.
 *
 * Both the day-complete UI and POST /api/job-orders/[id]/daily-log evaluate
 * this same function, so the client can ask up front and the server can still
 * refuse a request that never went through the question.
 */

import { formatDay } from './dates';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Accept only a bare 'YYYY-MM-DD'. Anything else is "unknown", not a guess. */
function ymd(value: unknown): string | null {
  return typeof value === 'string' && YMD.test(value) ? value : null;
}

export interface CloseoutBooking {
  /** Local calendar date of the closeout, 'YYYY-MM-DD' (tenant tz on the server). */
  today: string;
  /** job_orders.scheduled_date — the day the office booked the crew to start. */
  scheduledDate?: string | null;
  /** job_orders.scheduled_end_date, falling back to the legacy end_date. */
  scheduledEndDate?: string | null;
}

export interface ContinueConfirmCopy {
  /** The fact the crew may not have known. */
  title: string;
  /** What choosing "coming back" actually does. */
  body: string;
  confirmLabel: string;
  cancelLabel: string;
}

export interface CloseoutPlan {
  /** The office booked a span longer than one day. */
  officeBookedMultiDay: boolean;
  /** There is still a booked day AFTER today. Continuing is expected here. */
  withinBookedSpan: boolean;
  /** Continuing would extend the job past what the office booked → ask first. */
  requiresContinueConfirmation: boolean;
  /** Which outcome leads the screen. Finishing is the common one. */
  primaryAction: 'finish' | 'continue';
  /** Last day the office booked, if known. */
  bookedEndDate: string | null;
  /** Null exactly when no confirmation is required. */
  confirm: ContinueConfirmCopy | null;
}

const CONFIRM_LABEL = 'Yes — we are coming back tomorrow';
const CANCEL_LABEL = 'No — take me back';

/**
 * Decide how the end-of-day screen should behave for this job, today.
 *
 * Pure: no clock, no DB, no timezone maths. The caller supplies `today` already
 * resolved to the right calendar (tenant timezone on the server, device-local
 * in the browser) so this can never re-introduce the UTC off-by-one.
 */
export function planDayCloseout(booking: CloseoutBooking): CloseoutPlan {
  const today = ymd(booking.today);
  const start = ymd(booking.scheduledDate);
  // A missing end date means the booking is one day long, not open-ended.
  const end = ymd(booking.scheduledEndDate) ?? start;

  const officeBookedMultiDay = !!(start && end && end > start);
  // Frictionless ONLY when the office booked a day that is still ahead of us.
  const withinBookedSpan = !!(officeBookedMultiDay && today && end && today < end);
  const requiresContinueConfirmation = !withinBookedSpan;

  return {
    officeBookedMultiDay,
    withinBookedSpan,
    requiresContinueConfirmation,
    primaryAction: withinBookedSpan ? 'continue' : 'finish',
    bookedEndDate: end,
    confirm: requiresContinueConfirmation
      ? continueConfirmCopy({ officeBookedMultiDay, bookedEndDate: end })
      : null,
  };
}

/**
 * What to put in front of the crew before a job changes shape.
 *
 * The consequence is spelled out in their terms — "it stays open", "the office
 * cannot bill it" — not in ours ("is_multi_day"). Two different situations get
 * two different sentences, because "booked for one day" and "booked through
 * Friday and it is Friday" are not the same mistake.
 */
export function continueConfirmCopy(opts: {
  officeBookedMultiDay: boolean;
  bookedEndDate: string | null;
}): ContinueConfirmCopy {
  if (opts.officeBookedMultiDay && opts.bookedEndDate) {
    return {
      title: `This job was booked through ${formatDay(opts.bookedEndDate)} — that was today.`,
      body:
        'Coming back tomorrow keeps the job open past the days the office booked. ' +
        'Only choose this if the crew really is returning. If the work is finished, ' +
        'go back and complete it so the office can bill it.',
      confirmLabel: CONFIRM_LABEL,
      cancelLabel: CANCEL_LABEL,
    };
  }

  return {
    title: 'This job was booked for one day.',
    body:
      'Coming back tomorrow turns it into a multi-day job and leaves it open. ' +
      'It will not be finished, and the office cannot bill it, until someone ' +
      'completes it. If the work is done, go back and complete it instead.',
    confirmLabel: CONFIRM_LABEL,
    cancelLabel: CANCEL_LABEL,
  };
}

/**
 * The reassurance shown on a frictionless "Done for Today" — the crew should
 * be able to see, on the button, that the office really did book another day.
 */
export function formatBookedThrough(bookedEndDate: string | null): string {
  return bookedEndDate
    ? `The office booked this job through ${formatDay(bookedEndDate)}.`
    : 'The job stays open and comes back to your list tomorrow.';
}

/** One sentence for the server's 409 — the same words the modal uses. */
export function continueConfirmMessage(copy: ContinueConfirmCopy): string {
  return `${copy.title} ${copy.body}`;
}

/** The error code the API returns when "Done for Today" arrives unconfirmed. */
export const CONTINUE_CONFIRMATION_REQUIRED = 'continue_next_day_confirmation_required';

/**
 * The job_orders write behind "Done for Today".
 *
 * Extracted so the exact fields are asserted in a test rather than reviewed by
 * eye. `is_multi_day: true` is the line that costs money when it is wrong,
 * which is why nothing may reach it without passing planDayCloseout first.
 * Timestamps are cleared so tomorrow's route/work start records itself fresh.
 */
export function continueNextDayJobUpdate() {
  return {
    is_multi_day: true,
    status: 'scheduled',
    route_started_at: null,
    work_started_at: null,
    route_start_latitude: null,
    route_start_longitude: null,
    work_start_latitude: null,
    work_start_longitude: null,
  };
}

/**
 * The job_orders write behind "Job Complete".
 *
 * `is_multi_day` is DERIVED here from the distinct days actually logged, so a
 * job that was wrongly converted earlier gets corrected the moment it is
 * completed properly. total_days_worked stays trigger-owned.
 *
 * Two callers apply it: the day-complete page's /status PATCH (the primary
 * path) and POST /api/job-orders/[id]/daily-log as the fallback when a signer
 * came in with the final log. That fallback is AWAITED — it was fire-and-
 * forget, which silently does nothing on Vercel once the response is sent.
 */
export function finalCompletionJobUpdate(opts: {
  nowIso: string;
  totalHours: number;
  distinctDays: number;
  signerName: string;
}) {
  return {
    status: 'completed',
    work_completed_at: opts.nowIso,
    total_hours_worked: Number(opts.totalHours.toFixed(2)),
    is_multi_day: opts.distinctDays > 1,
    completion_signer_name: opts.signerName,
  };
}
