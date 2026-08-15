/**
 * WHEN DOES THIS TENANT'S PAY WEEK START?
 *
 * Patriot's runs **Saturday through Friday** (founder, Aug 12). Every week
 * boundary in this codebase was hardcoded to Monday — the timecard views, the
 * `weekStart` params, the 40-hour overtime bucket, the PDF and the CSV export.
 * So a Saturday's hours were filed at the END of the previous pay week instead
 * of the START of the new one, and overtime was totalled across the wrong seven
 * days.
 *
 * `timecard_settings_v2.week_start_day` has existed the whole time and was read
 * by NOTHING — the seven day-buttons on the settings page wrote to
 * localStorage. The only place in the repo that knew the real rule was a
 * comment. This is the module that makes the column mean something.
 *
 * Weekend work is rare here, which is why it survived: one Saturday card in six
 * weeks. But Javier is on a Saturday job as this is written, so it is live
 * money, and "rare" is exactly how a payroll error goes unspotted for a year.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { isWeekStartDay, weekStartOf, type WeekStartDay } from '@/lib/dates';

/** Monday, because that is what every caller assumed before this existed. */
export const DEFAULT_WEEK_START: WeekStartDay = 'monday';

/**
 * The tenant's configured pay-week start. Falls back to Monday when there is no
 * settings row or the stored value is not a day name — a wrong week is better
 * than a crash, and the fallback is the behaviour that shipped for months.
 */
export async function getTenantWeekStart(tenantId: string | null | undefined): Promise<WeekStartDay> {
  if (!tenantId) return DEFAULT_WEEK_START;
  try {
    const { data } = await supabaseAdmin
      .from('timecard_settings_v2')
      .select('week_start_day')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const raw = (data as { week_start_day?: string } | null)?.week_start_day?.toLowerCase();
    return isWeekStartDay(raw) ? raw : DEFAULT_WEEK_START;
  } catch {
    return DEFAULT_WEEK_START;
  }
}

/**
 * The start of the pay week containing `ref`, for this tenant.
 * `ref` defaults to today.
 */
export async function tenantWeekStartFor(
  tenantId: string | null | undefined,
  ref?: string | Date
): Promise<string> {
  const startDay = await getTenantWeekStart(tenantId);
  return weekStartOf(ref ?? new Date(), startDay);
}

/**
 * Normalise a caller-supplied `weekStart` param onto a real week boundary.
 *
 * A hand-typed or bookmarked `?weekStart=` can land mid-week; taking it at face
 * value would slice seven days out of the middle of two pay weeks and total
 * overtime across the seam. Snapping is deliberate: the caller gets the week
 * their date falls in, which is what they meant.
 */
export async function normalizeWeekStart(
  tenantId: string | null | undefined,
  weekStartParam: string | null | undefined
): Promise<string> {
  const startDay = await getTenantWeekStart(tenantId);
  const valid = typeof weekStartParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam);
  return weekStartOf(valid ? weekStartParam : new Date(), startDay);
}
