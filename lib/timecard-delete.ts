/**
 * lib/timecard-delete.ts — pure rules behind "remove ONE timecard entry".
 *
 * Context (founder, Aug 2026): an operator sometimes clocks in and out several
 * times in a day and the office had no way to remove one of the entries.
 *
 * IMPORTANT — multiples are NOT automatically errors. Two-jobs-per-day
 * sequencing (`job_daily_assignments.day_sequence`) and "finish the job at 3,
 * clock out, clock back in for shop time" are both explicit, legitimate
 * workflows. Nothing here detects or flags duplicates, and nothing auto-deletes.
 * These helpers only (a) surface which days carry more than one entry so an
 * admin can look, and (b) decide who is allowed to remove one.
 *
 * Kept free of DB/Next imports so every rule is unit-testable.
 */

/** Minimal shape needed to group a person's week into days. */
export interface DayGroupableEntry {
  id: string;
  /** Bare local calendar date, 'YYYY-MM-DD' (see lib/dates.ts — never UTC-parse it). */
  date: string;
  clock_in_time?: string | null;
}

/**
 * Group entries by their local calendar date.
 *
 * Entries within a day are ordered by clock-in time so the display order
 * matches the order the person actually worked. Entries with no clock-in sort
 * last (defensive: clock_in_time is NOT NULL in the schema).
 */
export function groupEntriesByDay<T extends DayGroupableEntry>(
  entries: T[]
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const entry of entries) {
    if (!entry?.date) continue;
    if (!grouped[entry.date]) grouped[entry.date] = [];
    grouped[entry.date].push(entry);
  }
  for (const date of Object.keys(grouped)) {
    grouped[date].sort((a, b) => {
      const at = a.clock_in_time ? Date.parse(a.clock_in_time) : Number.POSITIVE_INFINITY;
      const bt = b.clock_in_time ? Date.parse(b.clock_in_time) : Number.POSITIVE_INFINITY;
      if (!Number.isFinite(at) && !Number.isFinite(bt)) return 0;
      return at - bt;
    });
  }
  return grouped;
}

/**
 * The set of dates carrying MORE THAN ONE entry.
 *
 * This is a "look here" signal for the admin, NOT a duplicate verdict — a day
 * legitimately has two entries when someone worked two jobs or came back for
 * shop time. The UI uses it to label the day and expand it by default.
 */
export function multiEntryDates<T extends DayGroupableEntry>(entries: T[]): string[] {
  const grouped = groupEntriesByDay(entries);
  return Object.keys(grouped)
    .filter((date) => grouped[date].length > 1)
    .sort();
}

/** True when this specific day holds more than one entry. */
export function isMultiEntryDay<T extends DayGroupableEntry>(
  entries: T[],
  date: string
): boolean {
  return (groupEntriesByDay(entries)[date]?.length ?? 0) > 1;
}

/** The approval state that matters for deletion, from either column. */
export interface DeletableCard {
  is_approved?: boolean | null;
  approval_status?: string | null;
}

/**
 * A card counts as approved-and-locked if EITHER approval column says so.
 * Both exist on `timecards` and different write paths set different ones
 * (`[id]/approve` sets is_approved; the v2 system writes approval_status),
 * so trusting only one would let an approved card be deleted silently.
 */
export function isApprovedCard(card: DeletableCard): boolean {
  return card.is_approved === true || card.approval_status === 'approved';
}

export interface DeletePermission {
  allowed: boolean;
  /** Machine-readable reason, for the API to map onto a status code. */
  code: 'ok' | 'forbidden_role' | 'approved_locked' | 'reason_required';
  /** Operator-facing explanation, including how to proceed when blocked. */
  message: string;
}

/** Roles allowed to remove a timecard entry at all. Operators never can. */
export const TIMECARD_DELETE_ROLES = ['admin', 'super_admin', 'operations_manager'] as const;

/** Only a super_admin may remove a card that has already been approved. */
export const APPROVED_OVERRIDE_ROLE = 'super_admin';

export const MIN_DELETE_REASON_LENGTH = 3;
export const MAX_DELETE_REASON_LENGTH = 500;

/**
 * Decide whether this caller may delete this card.
 *
 * Rules, in order:
 *  1. Role must be admin / operations_manager / super_admin. Operators and
 *     apprentices can never delete their own (or anyone's) hours.
 *  2. A reason is mandatory — payroll deletions are never unexplained.
 *  3. An APPROVED card is locked to everyone but super_admin. Approved payroll
 *     must not silently vanish; the message tells the admin the way through
 *     (un-approve it first, or escalate).
 */
export function canDeleteTimecard(params: {
  card: DeletableCard;
  role: string;
  reason?: string | null;
}): DeletePermission {
  const { card, role, reason } = params;

  if (!(TIMECARD_DELETE_ROLES as readonly string[]).includes(role)) {
    return {
      allowed: false,
      code: 'forbidden_role',
      message: 'Only office admins, operations managers, and super admins can delete a timecard entry.',
    };
  }

  const trimmed = (reason ?? '').trim();
  if (trimmed.length < MIN_DELETE_REASON_LENGTH) {
    return {
      allowed: false,
      code: 'reason_required',
      message: `A reason is required to delete a timecard entry (at least ${MIN_DELETE_REASON_LENGTH} characters). It is stored on the payroll audit record.`,
    };
  }

  if (isApprovedCard(card) && role !== APPROVED_OVERRIDE_ROLE) {
    return {
      allowed: false,
      code: 'approved_locked',
      message:
        'This entry is already APPROVED, so it may already have been paid. Un-approve it first, or ask a super admin to remove it.',
    };
  }

  return { allowed: true, code: 'ok', message: 'Allowed.' };
}

/** Normalize a submitted reason for storage (trimmed, length-capped). */
export function normalizeDeleteReason(reason: string): string {
  return reason.trim().slice(0, MAX_DELETE_REASON_LENGTH);
}
