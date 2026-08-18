/**
 * The per-user half of the card permission system — the half that was never
 * wired up.
 *
 * THE DEFECT (Aug 18, live): `getCardPermission(userPermissions, cardKey, role)`
 * is documented as "bypass roles → explicit user permissions → role preset", and
 * a `user_card_permissions` table has existed since March. But the pages that
 * decide what a person may DO passed `null` for the first argument, so the
 * override was read from nowhere. Team Management would save a grant, report
 * success, and change nothing — the table was still empty the day this was
 * written. That is the platform's signature defect: a control that appears to
 * work while the value never reaches the reader.
 *
 * Amanda runs billing and payroll for Patriot. Her role preset is
 * `timecards: 'view'`, and the timecards page hides approve / bulk-approve /
 * no-show behind `=== 'full'`. She could watch payroll happen and not act on it,
 * and the remedy the founder would reach for did nothing.
 *
 * This module holds the PURE decision so both sides can share one answer:
 *   - the browser, to decide whether to draw a button
 *   - the server, to decide whether to honour the request behind it
 * A permission honoured only in the browser is decoration.
 */

import { BYPASS_ROLES, getCardPermission, type PermissionLevel } from './rbac';

/**
 * Ordering of the four levels. `submit` sits between `view` and `full`: it is
 * "may act on their own work", not "may act on everyone's".
 */
export const PERMISSION_RANK: Record<PermissionLevel, number> = {
  none: 0,
  view: 1,
  submit: 2,
  full: 3,
};

/** Does `effective` satisfy a minimum of `required`? */
export function meetsCardPermission(
  effective: PermissionLevel,
  required: PermissionLevel
): boolean {
  return PERMISSION_RANK[effective] >= PERMISSION_RANK[required];
}

/**
 * The levels the `user_card_permissions` TABLE accepts.
 *
 * Production CHECK: `permission_level = ANY (ARRAY['none','view','full'])`.
 * `submit` is a ROLE-PRESET level (lib/rbac.ts — `supervisor.site_visits`,
 * `admin.schedule_form`, …), it lives in code and in `role_permissions.
 * card_permissions` (jsonb, unconstrained). It has never been storable as a
 * per-user override.
 *
 * The pickers offered it anyway, and worse: they SEED from the role preset, so
 * editing any admin / supervisor / salesman carried `schedule_form: 'submit'`
 * into the payload without anybody clicking it. The upsert is one batch, so
 * Postgres rejected the whole array and the route answered "Failed to update
 * card permissions" — the grant the office was trying to make never landed.
 * That is how a `timecards: 'full'` grant could be typed in, confirmed, and
 * still do nothing.
 */
export const STORABLE_CARD_LEVELS: PermissionLevel[] = ['none', 'view', 'full'];

export function isStorableCardLevel(level: unknown): level is PermissionLevel {
  return STORABLE_CARD_LEVELS.includes(level as PermissionLevel);
}

/**
 * Narrow a picker's map to what the table can hold.
 *
 * A `submit` entry is DROPPED rather than rounded to `view`. Dropping it leaves
 * no override row, so `getCardPermission` falls through to the role preset —
 * which is where that `submit` came from, so the user keeps exactly what they
 * had. Rounding it to `view` would write an explicit override that BEATS the
 * preset, quietly demoting every admin whose row anyone ever saved.
 */
export function toStorableOverrides(
  permissions: Record<string, PermissionLevel>
): Record<string, PermissionLevel> {
  const out: Record<string, PermissionLevel> = {};
  for (const [key, level] of Object.entries(permissions)) {
    if (isStorableCardLevel(level)) out[key] = level;
  }
  return out;
}

export interface CardPermissionDecision {
  allowed: boolean;
  /** What the user actually has, after overrides — useful for error copy. */
  effective: PermissionLevel;
  /** Which layer produced it. Diagnoses "the grant did nothing" instantly. */
  source: 'bypass_role' | 'user_override' | 'role_preset';
}

/**
 * The whole gate in one pure function: bypass role → per-user override →
 * role preset. Identical inputs must give an identical answer on the client and
 * on the server, which is why nothing here reaches for a database or a session.
 */
export function cardPermissionDecision(opts: {
  role: string | null | undefined;
  /** Rows from `user_card_permissions` for THIS user, or null if none/unloaded. */
  userPermissions: Record<string, PermissionLevel> | null;
  cardKey: string;
  /** Minimum level the action requires. */
  required: PermissionLevel;
}): CardPermissionDecision {
  const role = opts.role || '';
  const effective = getCardPermission(opts.userPermissions, opts.cardKey, role);

  // Mirrors getCardPermission's own priority order (same BYPASS_ROLES list, so
  // the two can never drift) — `source` therefore never lies about which layer
  // produced the answer.
  const source: CardPermissionDecision['source'] = BYPASS_ROLES.includes(role)
    ? 'bypass_role'
    : opts.userPermissions && opts.cardKey in opts.userPermissions
      ? 'user_override'
      : 'role_preset';

  return { allowed: meetsCardPermission(effective, opts.required), effective, source };
}
