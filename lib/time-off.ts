/**
 * Shared time-off request logic — used by the requester route
 * (/api/operator/time-off) and the approval route (/api/admin/time-off/[id]).
 *
 * Approval rank rules (enforced SERVER-SIDE, never trust the client):
 *   - Requester is management (admin, operations_manager, salesman, supervisor)
 *     → ONLY super_admin may approve/deny.
 *   - Requester is field/shop staff (operator, apprentice, shop_help,
 *     shop_manager, inventory_manager, …)
 *     → admin, operations_manager, or super_admin may approve/deny.
 */

/** Types a requester can pick. vacation/pto are paid; unpaid is not. */
export const REQUESTABLE_TYPES = ['vacation', 'pto', 'unpaid'] as const;
export type RequestableType = (typeof REQUESTABLE_TYPES)[number];

/** Roles whose own time-off requests can only be decided by a super_admin. */
export const MANAGEMENT_REQUESTER_ROLES: string[] = [
  'admin',
  'operations_manager',
  'salesman',
  'supervisor',
];

/** Required lead time for time-off requests (business rule). */
export const ADVANCE_NOTICE_DAYS = 28;

/** True when `approverRole` is allowed to decide a request from `requesterRole`. */
export function canDecideTimeOff(approverRole: string, requesterRole: string): boolean {
  if (approverRole === 'super_admin') return true;
  if (MANAGEMENT_REQUESTER_ROLES.includes(requesterRole)) return false;
  return ['admin', 'operations_manager'].includes(approverRole);
}

/**
 * Count business days (Mon–Fri) between two bare YYYY-MM-DD dates, inclusive.
 * Minimum 1. Parses local (never `new Date('YYYY-MM-DD')` — that's UTC).
 */
export function businessDaysBetween(startYMD: string, endYMD: string): number {
  const cur = new Date(startYMD + 'T00:00:00');
  const end = new Date(endYMD + 'T00:00:00');
  let count = 0;
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count || 1;
}

export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
