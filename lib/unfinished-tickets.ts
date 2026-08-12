/**
 * "Has this worker handled today's ticket?" — the single source of truth behind
 * the clock-out warning (founder Jul 20 / Aug 2026: WARN with a choice, never wall).
 *
 * WHY THIS EXISTS
 * ---------------
 * The clock-out gate used to treat "an operator has ANY daily_job_logs row for
 * (me, this job, today)" as "ticket done". That is wrong: two other flows insert
 * SKELETON rows on that same unique key long before the ticket is finished —
 *   1. work-performed draft autosave  (/api/job-orders/[id]/work-performed-draft PUT)
 *   2. the day-note upsert            (/api/job-orders/[id]/work-items POST)
 * — so merely OPENING the work-performed page and abandoning it silenced the
 * warning forever. `lib/day-complete-auth.ts` already documents those rows as
 * non-authoritative; this module makes the clock-out gate agree.
 *
 * A ticket counts as HANDLED for today ONLY when the operator's daily log for
 * today carries `day_completed_at` (set exclusively by the day-complete
 * submission in /api/job-orders/[id]/daily-log).
 *
 * The helper (apprentice) branch had the same class of bug: any
 * helper_work_logs row satisfied it, and /api/helper-work-log creates one with
 * an EMPTY description the moment a helper presses "start" (start_now). A
 * helper log counts as handled only once they either completed it
 * (`completed_at`) or actually wrote what they did (`work_description`).
 *
 * The pure predicates are exported (and unit-tested) so the DB shape and the
 * decision stay separable.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { canBeCrewMember } from '@/lib/rbac';

export type ClockOutWarningType = 'incomplete_tickets_warning' | 'helper_work_log_warning';

/**
 * Job statuses that CANNOT owe a ticket today.
 *
 * `on_hold` = the job was parked to Pending (the "site not ready" flow). It is
 * excluded for BOTH roles: the same-day sequence gate
 * (app/api/job-orders/[id]/status/route.ts) already treats a parked job as
 * satisfied, and without this a parked multi-day job would warn — and fire a
 * bell reminder — on EVERY clock-out until its end_date passed. (Before the
 * day_completed_at fix, a leftover draft skeleton row masked this.)
 *
 * ⚠️ This list is only HALF the rule, and the other half is easy to miss. The
 * OVERDUE gate in the same status route kept its own inline status list, and it
 * did NOT exclude on_hold — so a parked job stayed silent here while returning
 * a hard 409 there. JOB-2026-521763 (BWC Contracting) parked on Aug 5 meant
 * Nate could not start ANY job for a week, and could not clear it either: the
 * error told him to finish a job nobody was allowed to work. Fixed Aug 12. If
 * you add a status here, check that gate too.
 */
export const OPERATOR_EXCLUDED_STATUSES = [
  'cancelled',
  'completed',
  'pending_completion',
  'on_hold',
] as const;

export const HELPER_EXCLUDED_STATUSES = [
  'cancelled',
  'on_hold',
  'pending_completion',
  'completed',
] as const;

/** PostgREST `not.in` list literal: ["a","b"] → '("a","b")'. */
export function statusNotInList(statuses: readonly string[]): string {
  return `(${statuses.map((s) => `"${s}"`).join(',')})`;
}

/** Minimal job shape surfaced to the operator in the warning modal. */
export interface UnfinishedTicketJob {
  id: string;
  job_number: string;
  customer_name: string;
}

/** The columns of daily_job_logs the decision depends on. */
export interface OperatorDailyLogRow {
  job_order_id: string;
  day_completed_at: string | null;
}

/** The columns of helper_work_logs the decision depends on. */
export interface HelperWorkLogRow {
  job_order_id: string;
  completed_at: string | null;
  work_description: string | null;
}

/**
 * Operator: the ticket is handled only when the day was actually submitted.
 * Draft-autosave / day-note skeleton rows have day_completed_at = NULL and
 * therefore do NOT satisfy the gate.
 */
export function isOperatorTicketHandled(log: OperatorDailyLogRow | null | undefined): boolean {
  return !!log && log.day_completed_at != null;
}

/**
 * Helper: handled once they completed the log OR wrote a real description.
 * A bare "start" row (empty description, no completed_at) does NOT satisfy it.
 */
export function isHelperLogHandled(log: HelperWorkLogRow | null | undefined): boolean {
  if (!log) return false;
  if (log.completed_at != null) return true;
  return (log.work_description ?? '').trim() !== '';
}

/** Jobs whose operator ticket is NOT handled today. */
export function operatorUnfinishedJobs<J extends { id: string }>(
  jobs: J[],
  logs: OperatorDailyLogRow[],
): J[] {
  const handled = new Set(logs.filter(isOperatorTicketHandled).map((l) => l.job_order_id));
  return jobs.filter((j) => !handled.has(j.id));
}

/** Jobs whose helper work log is NOT handled today. */
export function helperUnfinishedJobs<J extends { id: string }>(
  jobs: J[],
  logs: HelperWorkLogRow[],
): J[] {
  const handled = new Set(logs.filter(isHelperLogHandled).map((l) => l.job_order_id));
  return jobs.filter((j) => !handled.has(j.id));
}

export interface UnfinishedTicketsResult {
  blockType: ClockOutWarningType;
  jobs: UnfinishedTicketJob[];
}

/**
 * Today's unfinished tickets for an operator/apprentice.
 *
 * Returns `null` for every other role (they don't own field tickets) and an
 * empty `jobs` array when everything is handled.
 *
 * Tenant scoping: job_orders is filtered by tenant_id when the caller has one.
 * The LOG tables intentionally are NOT tenant-filtered — legacy rows exist with
 * a NULL tenant_id (see the "stamp tenant_id" comments in the daily-log and
 * work-items routes), and filtering them out would resurrect false warnings.
 * They're already scoped to the caller's own user id, which is tighter.
 *
 * @param today tenant-local YYYY-MM-DD (never toISOString — see lib/dates.ts)
 */
export async function findUnfinishedTickets(opts: {
  userId: string;
  role: string;
  tenantId?: string | null;
  today: string;
}): Promise<UnfinishedTicketsResult | null> {
  const { userId, role, tenantId, today } = opts;

  // Anyone who can be put on a crew gets checked — and by SLOT, not by role.
  //
  // THE BUG (found Aug 9): this branched on the role alone. `role ===
  // 'apprentice'` queried `helper_assigned_to`, so Javier — an apprentice
  // dispatched as LEAD, which the founder asked for and the ticket already
  // supports — matched nothing and clocked out clean, never prompted for the
  // operator ticket he owed. Supervisors and operations managers fell through
  // to `return null`: no gate at all, so David and the founder could work a job
  // and file nothing with no warning to anyone.
  //
  // Operator slot is checked FIRST: it carries the heavier obligation (the full
  // work-performed ticket), and someone leading one job while helping on
  // another should be chased for the lead ticket.
  if (!canBeCrewMember(role)) return null;

  /**
   * WHICH SEAT WERE THEY IN **ON THIS DAY**?
   *
   * WHY (founder, Aug 9): "Saturday Javi was marked as operator so he should
   * have to fill operator ticket for Saturday. Software should know what days
   * they are listed as operator and what days they aren't."
   *
   * `job_orders.assigned_to` is a single value for the whole job, so on a
   * multi-day job it cannot answer that — the office swaps crew day to day, and
   * the board already knows because it overlays `job_daily_assignments`
   * (assignment_date + operator_id + helper_id, one row per job per day). This
   * gate was reading only the job-level column, so on any day the ledger
   * disagreed we would chase the wrong person, or the right person for the
   * wrong ticket.
   *
   * The ledger WINS for a day it has a row for; the job-level columns are the
   * fallback for days it doesn't (single-day jobs, mostly).
   */
  const dayLedger = new Map<string, { operatorId: string | null; helperId: string | null }>();
  {
    let lq = supabaseAdmin
      .from('job_daily_assignments')
      .select('job_order_id, operator_id, helper_id')
      .eq('assignment_date', today);
    if (tenantId) lq = lq.eq('tenant_id', tenantId);
    const { data: ledgerRows } = await lq;
    for (const r of ledgerRows ?? []) {
      dayLedger.set(r.job_order_id, { operatorId: r.operator_id, helperId: r.helper_id });
    }
  }

  /** This user's seat on a given job TODAY, ledger first. */
  const seatToday = (
    jobId: string,
    jobAssignedTo: string | null,
    jobHelperAssignedTo: string | null
  ): 'operator' | 'helper' | null => {
    const led = dayLedger.get(jobId);
    if (led) {
      // An explicit row for today is the whole truth for today — including when
      // it names somebody else, which means this person is simply not on it.
      if (led.operatorId === userId) return 'operator';
      if (led.helperId === userId) return 'helper';
      return null;
    }
    if (jobAssignedTo === userId) return 'operator';
    if (jobHelperAssignedTo === userId) return 'helper';
    return null;
  };

  // Candidate jobs: anything they hold a job-level slot on, PLUS anything the
  // day ledger puts them on today even when the job-level columns name somebody
  // else. Then each one is classified by the seat they actually hold TODAY.
  const ledgerJobIdsForUser = [...dayLedger.entries()]
    .filter(([, v]) => v.operatorId === userId || v.helperId === userId)
    .map(([jobId]) => jobId);

  const orParts = [`assigned_to.eq.${userId}`, `helper_assigned_to.eq.${userId}`];
  if (ledgerJobIdsForUser.length > 0) {
    orParts.push(`id.in.(${ledgerJobIdsForUser.join(',')})`);
  }

  let q = supabaseAdmin
    .from('job_orders')
    .select('id, job_number, customer_name, assigned_to, helper_assigned_to, work_completed_at, status')
    .or(orParts.join(','))
    .lte('scheduled_date', today)
    .or(`scheduled_date.eq.${today},end_date.gte.${today}`)
    .not('dispatched_at', 'is', null);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data: allCandidates } = await q;

  const rows = (allCandidates ?? []) as Array<
    UnfinishedTicketJob & {
      assigned_to: string | null;
      helper_assigned_to: string | null;
      work_completed_at: string | null;
      status: string | null;
    }
  >;

  const operatorJobs: UnfinishedTicketJob[] = [];
  const helperJobs: UnfinishedTicketJob[] = [];
  for (const r of rows) {
    const seat = seatToday(r.id, r.assigned_to, r.helper_assigned_to);
    if (!seat) continue;
    const slim: UnfinishedTicketJob = {
      id: r.id,
      job_number: r.job_number,
      customer_name: r.customer_name,
    };
    if (seat === 'operator') {
      // A finished job owes nothing, and the operator gate excludes more states
      // than the helper one does.
      if (r.work_completed_at) continue;
      if ((OPERATOR_EXCLUDED_STATUSES as readonly string[]).includes(String(r.status))) continue;
      operatorJobs.push(slim);
    } else {
      if ((HELPER_EXCLUDED_STATUSES as readonly string[]).includes(String(r.status))) continue;
      helperJobs.push(slim);
    }
  }

  // Operator seat first: it carries the heavier obligation (the full
  // work-performed ticket), so someone leading one job while helping on another
  // is chased for the lead ticket.
  if (operatorJobs.length > 0) {
    const { data: todaysLogs } = await supabaseAdmin
      .from('daily_job_logs')
      // day_completed_at is what separates a REAL submission from a draft /
      // day-note skeleton row — selecting only job_order_id was the bug.
      .select('job_order_id, day_completed_at')
      .eq('operator_id', userId)
      .eq('log_date', today)
      .in('job_order_id', operatorJobs.map((j) => j.id));

    return {
      blockType: 'incomplete_tickets_warning',
      jobs: operatorUnfinishedJobs(operatorJobs, (todaysLogs ?? []) as OperatorDailyLogRow[]),
    };
  }

  if (helperJobs.length === 0) return { blockType: 'helper_work_log_warning', jobs: [] };

  const { data: workLogs } = await supabaseAdmin
    .from('helper_work_logs')
    // completed_at / work_description separate a real log from the empty
    // "start" row /api/helper-work-log inserts on start_now.
    .select('job_order_id, completed_at, work_description')
    .eq('helper_id', userId)
    .eq('log_date', today)
    .in('job_order_id', helperJobs.map((j) => j.id));

  return {
    blockType: 'helper_work_log_warning',
    jobs: helperUnfinishedJobs(helperJobs, (workLogs ?? []) as HelperWorkLogRow[]),
  };
}
