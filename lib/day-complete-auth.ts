/**
 * Pure decision logic for who may submit the daily completion log
 * (/api/job-orders/[id]/daily-log POST — "Done for Today" / complete).
 *
 * One ticket, whole crew (Aug 2026): day-complete is LEAD-only among the crew.
 * Crew members (job_crew, ANY role — co-operator or helper) submit their own
 * work but never complete the ticket, even if they already hold a
 * daily_job_logs row (the work-items day-note upsert creates one — that row
 * must NOT become a completion ticket for them).
 *
 * The existing-log fallback stays ONLY for genuine ex-leads: someone who was
 * assigned_to when the work started, logged a day, and is no longer in any
 * slot NOR in job_crew (assignment edge cases predating the crew system).
 */

export type DayCompleteDecision =
  | { allowed: true }
  | { allowed: false; reason: 'crew_not_lead' | 'not_assigned' };

export function dayCompletePermission(opts: {
  /** job_orders.assigned_to === caller */
  isLead: boolean;
  /** job_orders.helper_assigned_to === caller (pre-existing allowance) */
  isHelperSlot: boolean;
  /** admin / super_admin / operations_manager */
  isAdmin: boolean;
  /** caller has a job_crew row on this job (any role) */
  isCrewMember: boolean;
  /** caller already has a daily_job_logs row on this job */
  hasExistingLog: boolean;
}): DayCompleteDecision {
  if (opts.isLead || opts.isHelperSlot || opts.isAdmin) return { allowed: true };
  // Crew membership DENIES regardless of existing logs — the crew flow gives
  // members log rows (day notes, drafts) that must not unlock completion.
  if (opts.isCrewMember) return { allowed: false, reason: 'crew_not_lead' };
  // Genuine ex-lead fallback (not crewed): their logs prove they ran the job.
  if (opts.hasExistingLog) return { allowed: true };
  return { allowed: false, reason: 'not_assigned' };
}
