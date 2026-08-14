/**
 * "IF HE HASN'T SUBMITTED A TICKET FOR THURSDAY, TELL HIM THURSDAY MORNING."
 *
 * A day only exists in this system because somebody tapped "day complete". Skip
 * the tap and the day is not late — it is GONE. Dante was at AM King Wednesday
 * and Thursday, tapped once on Thursday, and Wednesday disappeared from the
 * ticket, from Daily Progress, and from the day count. Aiden lost Aug 4 on
 * Parkk the same way, 9.89 hours on the clock and no ticket.
 *
 * The day-number and attribution fixes let the office SEE those days. This is
 * what stops them happening: the crew gets told, the next morning, that
 * yesterday's ticket is still open.
 *
 * WHO GETS ASKED. Only the person who can actually file it — the lead operator
 * named on that day's assignment. Helpers file helper_work_logs and are blocked
 * from day-complete by design ("Only the lead completes the ticket"), so
 * reminding them is asking for something they cannot do.
 *
 * WHAT COUNTS AS A MISSED DAY. The office placed them on the job AND they
 * clocked in that day AND no daily log exists for that person on that job for
 * that date. All three, or it is a guess: a placement alone is a plan (Aiden is
 * on the board for a Saturday he never worked), and a clock-in alone says
 * nothing about which job.
 *
 * WHY IT LOOKS BACK A WEEK, not one day. Payroll runs Saturday through Friday
 * and the crew does not work weekends. A Friday miss discovered Monday is still
 * worth chasing — it is inside the same pay week, so the ticket can still be
 * filed before the week closes. Each missed day is asked about exactly once
 * (the dedup key carries the date), so a week of silence is a week of distinct
 * nudges, not the same nudge seven times.
 */

/** How far back a missed ticket is still worth chasing. */
export const MISSING_TICKET_LOOKBACK_DAYS = 7;

/** Tenant-local wall clock for the nudge — after the 7:05 clock-in reminder. */
export const MISSING_TICKET_TIME = '07:15';

export interface MissedDay {
  userId: string;
  jobOrderId: string;
  /** YYYY-MM-DD, tenant-local. */
  date: string;
  jobNumber: string | null;
  customerName: string | null;
}

export interface MissedDayInputs {
  /** Every named lead placement in the window: job + operator + date. */
  placements: Array<{ job_order_id: string; operator_id: string | null; assignment_date: string }>;
  /** "userId|date" for every day the person was actually on the clock. */
  clockedIn: Set<string>;
  /** "jobId|userId|date" for every daily log already filed. */
  filed: Set<string>;
  /** jobId → identifying labels for the message. */
  jobs: Map<string, { job_number: string | null; customer_name: string | null }>;
}

/**
 * The missed days, deduped. A person placed on the same job twice in a day
 * (a re-assignment) is one missed day, not two nudges.
 */
export function findMissedTickets(input: MissedDayInputs): MissedDay[] {
  const out = new Map<string, MissedDay>();

  for (const p of input.placements) {
    if (!p.operator_id || !p.assignment_date || !p.job_order_id) continue;

    // Placed, but were they there? A plan is not attendance.
    if (!input.clockedIn.has(`${p.operator_id}|${p.assignment_date}`)) continue;

    // Already filed — nothing to chase.
    if (input.filed.has(`${p.job_order_id}|${p.operator_id}|${p.assignment_date}`)) continue;

    const key = `${p.job_order_id}|${p.operator_id}|${p.assignment_date}`;
    if (out.has(key)) continue;

    const job = input.jobs.get(p.job_order_id);
    out.set(key, {
      userId: p.operator_id,
      jobOrderId: p.job_order_id,
      date: p.assignment_date,
      jobNumber: job?.job_number ?? null,
      customerName: job?.customer_name ?? null,
    });
  }

  return Array.from(out.values()).sort((a, b) =>
    a.date === b.date ? a.userId.localeCompare(b.userId) : a.date.localeCompare(b.date)
  );
}

/**
 * The wording. Names the day and the job, because an operator who missed one
 * ticket has usually worked several jobs since and "your previous ticket" is
 * not enough to act on.
 */
export function missedTicketMessage(missed: MissedDay, dayLabel: string): { title: string; message: string } {
  const where = missed.customerName || missed.jobNumber || 'a job';
  return {
    title: `${dayLabel}'s ticket is still open`,
    message:
      `You worked ${where} on ${dayLabel} and the ticket was never submitted. ` +
      `Open it and finish it so the day is on record.`,
  };
}
