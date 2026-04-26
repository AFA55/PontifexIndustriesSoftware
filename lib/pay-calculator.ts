/**
 * Pay classification utility — pure functions, no DB calls.
 *
 * Pay categories (priority order):
 *  1. shop      — is_shop_time flag; always regular rate regardless of hour
 *  2. overtime  — after weekly threshold (default 40 hrs)
 *  3. night_shift — field work with clock-in at or after night_shift_start_hour
 *  4. regular   — everything else
 */

export type PayCategory = 'regular' | 'night_shift' | 'shop' | 'overtime';

export interface PayConfig {
  overtime_threshold_hours: number;  // default 40
  night_shift_start_hour: number;    // 24-hr, default 15 (3 pm)
  night_shift_premium_rate: number;  // multiplier, default 1.15
  overtime_rate: number;             // multiplier, default 1.5
}

export const DEFAULT_PAY_CONFIG: PayConfig = {
  overtime_threshold_hours: 40,
  night_shift_start_hour: 15,
  night_shift_premium_rate: 1.15,
  overtime_rate: 1.5,
};

export interface TimeEntry {
  /** ISO datetime string or Date */
  clock_in: string | Date;
  /** Total hours for this entry */
  total_hours: number;
  /** If true, this entry is shop work — never night shift premium */
  is_shop_time?: boolean;
  /** Admin override — if set, skip auto-classification */
  pay_category?: PayCategory | null;
}

export interface ClassifiedEntry {
  pay_category: PayCategory;
  /** Effective hours at each rate (entry may straddle OT threshold) */
  regular_hours: number;
  night_shift_hours: number;
  overtime_hours: number;
  shop_hours: number;
  /** Effective pay multiplier for display */
  effective_rate: number;
}

/**
 * Classify a single time entry given cumulative weekly hours BEFORE this entry.
 *
 * @param entry          The timecard entry to classify
 * @param config         Tenant pay configuration
 * @param weeklyHoursBefore  Total hours already accumulated earlier in the week
 * @returns              Classification result with hour splits
 */
export function classifyTimeEntry(
  entry: TimeEntry,
  config: PayConfig = DEFAULT_PAY_CONFIG,
  weeklyHoursBefore: number = 0
): ClassifiedEntry {
  const hours = entry.total_hours || 0;

  // 1. Shop time — always regular, never night shift
  if (entry.is_shop_time) {
    return {
      pay_category: 'shop',
      regular_hours: hours,
      night_shift_hours: 0,
      overtime_hours: 0,
      shop_hours: hours,
      effective_rate: 1.0,
    };
  }

  // 2. Determine if this entry falls into night shift window
  const clockIn = entry.clock_in instanceof Date ? entry.clock_in : new Date(entry.clock_in);
  const clockInHour = clockIn.getHours(); // local time
  const isNightShift = clockInHour >= config.night_shift_start_hour;

  // 3. Determine how many of this entry's hours cross the OT threshold
  const otThreshold = config.overtime_threshold_hours;
  const hoursBeforeOT = Math.max(0, otThreshold - weeklyHoursBefore);

  if (hoursBeforeOT <= 0) {
    // Already in overtime territory
    return {
      pay_category: 'overtime',
      regular_hours: 0,
      night_shift_hours: 0,
      overtime_hours: hours,
      shop_hours: 0,
      effective_rate: config.overtime_rate,
    };
  }

  if (hours <= hoursBeforeOT) {
    // Entire entry is pre-OT
    if (isNightShift) {
      return {
        pay_category: 'night_shift',
        regular_hours: 0,
        night_shift_hours: hours,
        overtime_hours: 0,
        shop_hours: 0,
        effective_rate: config.night_shift_premium_rate,
      };
    }
    return {
      pay_category: 'regular',
      regular_hours: hours,
      night_shift_hours: 0,
      overtime_hours: 0,
      shop_hours: 0,
      effective_rate: 1.0,
    };
  }

  // Entry straddles the OT threshold — split hours
  const preOtHours = hoursBeforeOT;
  const postOtHours = hours - preOtHours;

  // Dominant category = whichever has more hours
  const dominantCategory: PayCategory = postOtHours >= preOtHours ? 'overtime' : (isNightShift ? 'night_shift' : 'regular');

  return {
    pay_category: dominantCategory,
    regular_hours: isNightShift ? 0 : preOtHours,
    night_shift_hours: isNightShift ? preOtHours : 0,
    overtime_hours: postOtHours,
    shop_hours: 0,
    effective_rate: dominantCategory === 'overtime'
      ? config.overtime_rate
      : isNightShift
        ? config.night_shift_premium_rate
        : 1.0,
  };
}

/**
 * Classify an entire week's entries in chronological order.
 * Returns each entry annotated with its ClassifiedEntry result.
 */
export function classifyWeek(
  entries: TimeEntry[],
  config: PayConfig = DEFAULT_PAY_CONFIG
): Array<TimeEntry & ClassifiedEntry> {
  let weeklyHours = 0;
  return entries.map((entry) => {
    const classification = classifyTimeEntry(entry, config, weeklyHours);
    weeklyHours += entry.total_hours || 0;
    return { ...entry, ...classification };
  });
}

/**
 * Human-readable label for a pay category.
 */
export function payLabel(category: PayCategory): string {
  switch (category) {
    case 'regular':     return 'Regular';
    case 'night_shift': return 'Night Shift';
    case 'shop':        return 'Shop Time';
    case 'overtime':    return 'Overtime';
  }
}

/**
 * Tailwind badge classes for a pay category.
 */
export function payCategoryBadgeClass(category: PayCategory): string {
  switch (category) {
    case 'regular':     return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'night_shift': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    case 'shop':        return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'overtime':    return 'bg-rose-100 text-rose-700 border-rose-200';
  }
}
