/**
 * Centralized date helpers — the single source of truth for calendar-date logic.
 *
 * WHY THIS EXISTS
 * ───────────────
 * A Postgres `date` column comes back as a bare 'YYYY-MM-DD' string. Two recurring
 * mistakes produced a whole class of off-by-one bugs (e.g. operator Zack's
 * "Jun 1 showed as Sun May 31"):
 *
 *   1. `new Date('2026-06-01')`     → parsed as UTC midnight → renders as the
 *                                     PREVIOUS day in US timezones.
 *   2. `d.toISOString().split('T')` → gives the UTC calendar date, not the LOCAL
 *                                     one → shifts a day in negative-offset zones.
 *
 * Every date-only operation should go through this module. The rule, encoded once:
 *   • To PARSE a bare date for display → `parseYMDLocal` (appends T00:00:00).
 *   • To EXTRACT a local YYYY-MM-DD from a Date → `toLocalYMD` (local components).
 *
 * These are implemented with plain `Date` + local components (the proven logic from
 * the timecard date-bug fix). `dayjs` is also wired up (utc + timezone plugins) for
 * callers that want richer formatting/arithmetic, without re-registering plugins.
 *
 * Tested in `lib/dates.test.ts` — locks "2026-06-01 = Monday, shows Jun 1" and the
 * Mon–Sun week range.
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export { dayjs };

/** Local YYYY-MM-DD from a Date (NEVER toISOString — that's UTC). Defaults to today. */
export function toLocalYMD(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/** Parse a bare 'YYYY-MM-DD' as LOCAL midnight (NEVER new Date(str) — that's UTC). */
export function parseYMDLocal(ymd: string): Date {
  return new Date(ymd + 'T00:00:00');
}

/**
 * Display a bare 'YYYY-MM-DD'. Defaults to "Mon, Jun 1" (weekday, short month, day).
 * Pass `opts` to override the Intl format.
 */
export function formatDay(
  ymd: string,
  opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
): string {
  return parseYMDLocal(ymd).toLocaleDateString('en-US', opts);
}

/** "March 23, 2026" style from a bare 'YYYY-MM-DD'. */
export function formatDayLong(ymd: string): string {
  return formatDay(ymd, { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Full weekday name ("Monday") from a bare 'YYYY-MM-DD'. */
export function dayName(ymd: string): string {
  return formatDay(ymd, { weekday: 'long' });
}

/** Short weekday name ("Mon") from a bare 'YYYY-MM-DD'. */
export function dayNameShort(ymd: string): string {
  return formatDay(ymd, { weekday: 'short' });
}

/** The Monday (YYYY-MM-DD) of the week containing `ref` (a Date or bare date string). */
export function mondayOf(ref: string | Date = new Date()): string {
  const d = typeof ref === 'string' ? parseYMDLocal(ref) : new Date(ref);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // back up to Monday
  d.setDate(diff);
  return toLocalYMD(d);
}

/** 7 date strings (YYYY-MM-DD) Mon→Sun starting at `weekStart` (a Monday YMD). */
export function weekDatesFrom(weekStart: string): string[] {
  const dates: string[] = [];
  const start = parseYMDLocal(weekStart);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(toLocalYMD(d));
  }
  return dates;
}

/**
 * Mon..Sun YYYY-MM-DD for the week containing `ref`, with an optional `offset` of
 * whole weeks (-1 = last week, +1 = next week). `ref` defaults to today.
 */
export function weekDatesMonSun(offset = 0, ref: Date = new Date()): string[] {
  const base = new Date(ref);
  base.setDate(base.getDate() + offset * 7);
  return weekDatesFrom(mondayOf(base));
}

/** Format an ISO timestamp to a local time string like "3:05 PM". */
export function formatTime(isoString: string | null): string {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** True when a bare 'YYYY-MM-DD' falls on a Saturday or Sunday (parsed LOCAL). */
export function isWeekend(ymd: string): boolean {
  const day = parseYMDLocal(ymd).getDay();
  return day === 0 || day === 6;
}

/**
 * Inclusive list of bare 'YYYY-MM-DD' days from `startYMD` to `endYMD` (parsed
 * LOCAL, never UTC). Returns `[startYMD]` if `endYMD` is missing or precedes it.
 */
export function enumerateYMDRange(startYMD: string, endYMD?: string | null): string[] {
  const start = parseYMDLocal(startYMD);
  const end = endYMD ? parseYMDLocal(endYMD) : start;
  const days: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(toLocalYMD(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days.length > 0 ? days : [startYMD];
}
