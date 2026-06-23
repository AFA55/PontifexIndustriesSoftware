/**
 * Shared time-off request logic — used by the requester route
 * (/api/operator/time-off) and the approval route (/api/admin/time-off/[id]).
 *
 * Approval rank rules (enforced SERVER-SIDE, never trust the client):
 *   - Founder's rule: time-off is NEVER auto-approved; approval authority is
 *     rank-based.
 *   - admin / operations_manager may approve requests from anyone whose role
 *     ranks STRICTLY BELOW admin — i.e. operators, apprentices, AND
 *     project-manager-level roles (project manager == the `salesman` role key;
 *     see lib/rbac.ts ROLES_WITH_LABELS) and everything below them.
 *   - super_admin may approve EVERYONE (incl. admin / operations_manager).
 *   - No self-approval (enforced in the route).
 *
 * "Project manager" maps to role key `salesman` (rank 5 in ROLE_RANK). Because
 * the rule is expressed in terms of rank-below-admin, any role at or above admin
 * (admin, operations_manager, super_admin) can ONLY be decided by a super_admin
 * — fail-safe: an unknown role gets rank 0 (treated as low) but the approver
 * still needs to outrank it, and only super_admin can clear management.
 */

import { ROLE_RANK } from '@/lib/rbac';

/** Types a requester can pick. vacation/pto are paid; unpaid is not. */
export const REQUESTABLE_TYPES = ['vacation', 'pto', 'unpaid'] as const;
export type RequestableType = (typeof REQUESTABLE_TYPES)[number];

/** Roles at/above which a request can ONLY be decided by super_admin. */
export const ADMIN_RANK = ROLE_RANK['admin']; // 6

/**
 * Roles whose own time-off requests can only be decided by a super_admin
 * (management tier: admin and above).
 */
export const MANAGEMENT_REQUESTER_ROLES: string[] = Object.keys(ROLE_RANK).filter(
  (r) => (ROLE_RANK[r] ?? 0) >= ADMIN_RANK
);

/** Required lead time for time-off requests (business rule). */
export const ADVANCE_NOTICE_DAYS = 28;

/**
 * True when `approverRole` is allowed to decide a request from `requesterRole`.
 *
 * - super_admin → always allowed.
 * - admin / operations_manager → allowed ONLY when the requester ranks strictly
 *   below admin (operators, apprentices, project-managers (`salesman`) and below).
 *   Management-tier requesters (admin / operations_manager / super_admin) require
 *   a super_admin approver.
 * - Any other role → never allowed (fail-safe).
 *
 * Self-approval is blocked at the route, not here.
 */
export function canDecideTimeOff(approverRole: string, requesterRole: string): boolean {
  if (approverRole === 'super_admin') return true;
  // Only admin / operations_manager may approve at all (below super_admin).
  if (!['admin', 'operations_manager'].includes(approverRole)) return false;
  // ...and only for requesters who rank strictly below admin. Anything at or
  // above admin (incl. unknown roles defensively kept out via the rank check)
  // is reserved for super_admin.
  const requesterRank = ROLE_RANK[requesterRole] ?? 0;
  return requesterRank < ADMIN_RANK;
}

// ── Type split: attendance FACTS vs planned REQUESTS (founder's rule) ──────
//
// Attendance facts are after-the-fact records, NOT requests. They are recorded
// immediately (status 'approved') and notify ALL management. Everything else is
// a planned request that lands pending → rank-based approval and notifies only
// the approvers.

/** After-the-fact attendance facts — recorded immediately, never pending. */
export const ATTENDANCE_FACT_TYPES = ['callout', 'no_show'] as const;

/** True when a time-off type is an attendance fact (callout / no_show). */
export function isAttendanceFactType(type: string): boolean {
  return (ATTENDANCE_FACT_TYPES as readonly string[]).includes(type);
}

/**
 * Roles notified when an attendance FACT (callout/no_show) is logged — the
 * oversight roles who run crews and need to know immediately. Superset of the
 * approver set plus the crew-supervising roles (supervisor, salesman ==
 * "Project Manager").
 */
export const MANAGEMENT_NOTIFY_ROLES = [
  'admin', 'super_admin', 'operations_manager', 'supervisor', 'salesman',
] as const;

/**
 * Roles notified for a planned time-off REQUEST — only the approvers who can
 * actually decide it (admin + super_admin, with operations_manager included
 * because it shares admin's approval authority per canDecideTimeOff).
 */
export const APPROVER_NOTIFY_ROLES = [
  'admin', 'super_admin', 'operations_manager',
] as const;

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
