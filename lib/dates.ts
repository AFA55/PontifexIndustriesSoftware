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

/**
 * Format an UNTRUSTED date-ish value for display. Returns `fallback` instead of
 * the string "Invalid Date" (or a nonsense year) when the value can't be parsed.
 *
 * WHY THIS EXISTS (founder, Aug 3 2026): "some jobs say the right date but that
 * they started in 1995, or other dates besides the real date." The culprit is
 * JavaScript's Date constructor being far too willing:
 *
 *     new Date('95')          -> Jan 1 1995      <-- the reported 1995
 *     new Date('7')           -> Jul 1 2001
 *     new Date('2026-08-05T') -> Invalid Date    <-- a cleared time field
 *     new Date(undefined)     -> Invalid Date
 *
 * Any value that reached the screen from free text or a JSONB blob must come
 * through here rather than straight into `new Date(...)`.
 */
export function formatMaybeDateTime(
  value: unknown,
  fallback = '—',
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
): string {
  if (value == null || value === '') return fallback;
  const raw = String(value).trim();
  // A bare 'YYYY-MM-DD' must be parsed LOCAL, or it renders a day early.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return parseYMDLocal(raw).toLocaleDateString(undefined, { dateStyle: opts.dateStyle ?? 'medium' });
  }
  // Refuse anything that isn't a plausible full date/timestamp. This is what
  // stops '95' from becoming 1995 and '2026-08-05T' from becoming Invalid Date.
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) return fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString(undefined, opts);
}

/**
 * The UTC instant for 23:59:59 LOCAL on `ymd` in IANA zone `tz`.
 *
 * WHY: auto-closing a forgotten shift wrote the bare string
 * `${date}T23:59:59` — no timezone — which Postgres stores as 23:59:59 UTC,
 * i.e. 7:59:59 PM Eastern. Combined with the UTC-date read bug that closed a
 * shift on the day it STARTED, this produced timecards with NEGATIVE hours
 * (clock-in 9:29 PM, clock-out 7:59 PM, gross −1.49). End of day has to mean
 * end of the operator's day.
 */
export function endOfDayUTC(ymd: string, tz: string): string {
  const guess = new Date(`${ymd}T23:59:59Z`);
  const asLocal = new Date(guess.toLocaleString('en-US', { timeZone: tz }));
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() + (asUtc.getTime() - asLocal.getTime())).toISOString();
}
