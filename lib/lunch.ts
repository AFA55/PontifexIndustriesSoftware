/**
 * Centralized lunch-deduction rule.
 *
 * When a shift exceeds LUNCH_THRESHOLD_HOURS, lunch is auto-deducted:
 *   • shop roles (shop_manager, shop_help) → 60 min
 *   • everyone else (field: operator, apprentice, supervisor, etc.) → 30 min
 *
 * A per-user `profiles.default_lunch_minutes` still overrides this when set.
 * Clock-out (`app/api/timecard/clock-out`) already implements this rule; this
 * helper is the single source of truth for UI that needs the same default
 * (e.g. the admin timecard Edit modal).
 */
export const SHOP_LUNCH_ROLES = ['shop_manager', 'shop_help'] as const;
export const LUNCH_THRESHOLD_HOURS = 6;

/** Default lunch minutes for a role: 60 for shop roles, 30 for everyone else. */
export function defaultLunchMinutes(role?: string | null): number {
  if (role && (SHOP_LUNCH_ROLES as readonly string[]).includes(role)) return 60;
  return 30;
}
