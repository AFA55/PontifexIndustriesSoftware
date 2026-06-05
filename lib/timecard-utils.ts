/**
 * Shared timecard calculation utilities.
 * Used by both PDF generation (server-side) and client pages.
 *
 * Date helpers below delegate to the centralized `lib/dates.ts` so there is a
 * single source of truth for the local-vs-UTC rule (kills the off-by-one bug class).
 * The wrapper names are kept for backward compatibility with existing imports.
 */
import {
  toLocalYMD,
  parseYMDLocal,
  weekDatesFrom,
  mondayOf,
  formatTime as formatTimeLocal,
  formatDay,
} from './dates';

export interface TimecardEntry {
  id: string;
  date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  total_hours: number | null;
  hour_type: string | null;
  is_shop_hours: boolean;
  is_night_shift: boolean;
  is_approved: boolean;
  clock_in_method: string | null;
  notes: string | null;
}

export interface WeekSummary {
  regularHours: number;
  weeklyOvertimeHours: number;
  mandatoryOvertimeHours: number;
  nightShiftHours: number;
  shopHours: number;
  totalHours: number;
  daysWorked: number;
}

/**
 * Calculate weekly hour breakdown from timecard entries.
 *
 * Rules:
 * - Mandatory OT = entries with hour_type 'mandatory_overtime' (Sat/Sun)
 * - Weekday hours = total minus mandatory OT
 * - Weekly OT = weekday hours exceeding 40
 * - Regular = weekday hours capped at 40
 * - Night shift / shop hours are tagged separately
 */
export function calculateWeekSummary(entries: TimecardEntry[]): WeekSummary {
  let mandatoryOvertimeHours = 0;
  let nightShiftHours = 0;
  let shopHours = 0;
  let totalHours = 0;
  const daysWorked = new Set(
    entries.filter((e) => e.total_hours && e.total_hours > 0).map((e) => e.date)
  ).size;

  for (const entry of entries) {
    const hours = entry.total_hours || 0;
    totalHours += hours;

    if (entry.hour_type === 'mandatory_overtime') {
      mandatoryOvertimeHours += hours;
    }
    if (entry.is_night_shift) {
      nightShiftHours += hours;
    }
    if (entry.is_shop_hours) {
      shopHours += hours;
    }
  }

  // Weekly OT = weekday hours (non-mandatory) that exceed 40
  const weekdayHours = totalHours - mandatoryOvertimeHours;
  const weeklyOvertimeHours = Math.max(0, weekdayHours - 40);
  const regularHours = Math.min(weekdayHours, 40);

  return {
    regularHours: Number(regularHours.toFixed(2)),
    weeklyOvertimeHours: Number(weeklyOvertimeHours.toFixed(2)),
    mandatoryOvertimeHours: Number(mandatoryOvertimeHours.toFixed(2)),
    nightShiftHours: Number(nightShiftHours.toFixed(2)),
    shopHours: Number(shopHours.toFixed(2)),
    totalHours: Number(totalHours.toFixed(2)),
    daysWorked,
  };
}

/**
 * Return an array of 7 date strings (YYYY-MM-DD) starting from weekStart (Monday).
 */
export function getWeekDates(weekStart: string): string[] {
  return weekDatesFrom(weekStart);
}

/**
 * Format an ISO timestamp to a human-readable time string.
 */
export function formatTime(isoString: string | null): string {
  return formatTimeLocal(isoString);
}

/**
 * Get the Monday (YYYY-MM-DD) of the week containing the given date.
 */
export function getMondayOfWeek(dateStr?: string): string {
  return mondayOf(dateStr ?? new Date());
}

/** Format a YYYY-MM-DD date into a display string like "Mon, Mar 23". */
export function formatDateShort(dateStr: string): string {
  return formatDay(dateStr, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Get day-of-week name from a YYYY-MM-DD string. */
export function getDayName(dateStr: string): string {
  return formatDay(dateStr, { weekday: 'long' });
}

/** Get short day-of-week name from a YYYY-MM-DD string. */
export function getDayNameShort(dateStr: string): string {
  return formatDay(dateStr, { weekday: 'short' });
}

/** Format YYYY-MM-DD to "March 23, 2026" style. */
export function formatDateLong(dateStr: string): string {
  return formatDay(dateStr, { month: 'long', day: 'numeric', year: 'numeric' });
}

// Re-export the canonical primitives so callers can migrate imports over time.
export { toLocalYMD, parseYMDLocal };
