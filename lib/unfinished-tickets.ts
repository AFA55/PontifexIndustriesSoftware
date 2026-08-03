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

  if (role === 'operator') {
    let q = supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name')
      .eq('assigned_to', userId)
      .lte('scheduled_date', today)
      .or(`scheduled_date.eq.${today},end_date.gte.${today}`)
      .not('dispatched_at', 'is', null)
      .is('work_completed_at', null)
      .not('status', 'in', statusNotInList(OPERATOR_EXCLUDED_STATUSES));
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data: candidateJobs } = await q;

    const jobs = (candidateJobs ?? []) as UnfinishedTicketJob[];
    if (jobs.length === 0) return { blockType: 'incomplete_tickets_warning', jobs: [] };

    const { data: todaysLogs } = await supabaseAdmin
      .from('daily_job_logs')
      // day_completed_at is what separates a REAL submission from a draft /
      // day-note skeleton row — selecting only job_order_id was the bug.
      .select('job_order_id, day_completed_at')
      .eq('operator_id', userId)
      .eq('log_date', today)
      .in('job_order_id', jobs.map((j) => j.id));

    return {
      blockType: 'incomplete_tickets_warning',
      jobs: operatorUnfinishedJobs(jobs, (todaysLogs ?? []) as OperatorDailyLogRow[]),
    };
  }

  if (role === 'apprentice') {
    // Mirror of the operator gate, minus parked/terminal states: a job parked to
    // Pending (on_hold) must NOT count as an outstanding helper ticket.
    let q = supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name')
      .eq('helper_assigned_to', userId)
      .lte('scheduled_date', today)
      .or(`scheduled_date.eq.${today},end_date.gte.${today}`)
      .not('dispatched_at', 'is', null)
      .not('status', 'in', statusNotInList(HELPER_EXCLUDED_STATUSES));
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data: helperJobs } = await q;

    const jobs = (helperJobs ?? []) as UnfinishedTicketJob[];
    if (jobs.length === 0) return { blockType: 'helper_work_log_warning', jobs: [] };

    const { data: workLogs } = await supabaseAdmin
      .from('helper_work_logs')
      // completed_at / work_description separate a real log from the empty
      // "start" row /api/helper-work-log inserts on start_now.
      .select('job_order_id, completed_at, work_description')
      .eq('helper_id', userId)
      .eq('log_date', today)
      .in('job_order_id', jobs.map((j) => j.id));

    return {
      blockType: 'helper_work_log_warning',
      jobs: helperUnfinishedJobs(jobs, (workLogs ?? []) as HelperWorkLogRow[]),
    };
  }

  return null;
}
