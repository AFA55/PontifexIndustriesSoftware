/**
 * Pure, testable timing logic for the reminder crons.
 *
 * Extracted from the clock-in + work-performed cron routes so the window math
 * (the part most likely to silently break) is unit-tested in one place.
 */

/** Parse an "HH:MM" (or "HH:MM:SS") string to minutes-since-midnight. */
export function parseHHMM(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Today's date (YYYY-MM-DD) in a given IANA timezone. */
export function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

/** Current minutes-since-midnight in a given IANA timezone. */
export function nowMinutesInTz(tz: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value || '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value || '0');
  return (h % 24) * 60 + m;
}

/**
 * Which clock-in reminder (if any) applies right now.
 *   - 'pre'  → ~5 min before start: window [start-7, start-2]
 *   - 'post' → ~5 min after start:  window [start+3, start+8]
 *   - null   → outside both windows
 * `pre` takes precedence if windows ever overlap.
 */
export function clockInReminderPhase(nowMin: number, startMin: number): 'pre' | 'post' | null {
  if (nowMin >= startMin - 7 && nowMin <= startMin - 2) return 'pre';
  if (nowMin >= startMin + 3 && nowMin <= startMin + 8) return 'post';
  return null;
}

export const LUNCH_HOURS = 4;       // lunch reminder ~4 hrs into shift
export const LUNCH_WINDOW = 0.5;    // within the next 30 min of the 4h mark
export const OVERDUE_HOURS = 7;     // escalation at 7 hrs

/**
 * Which work-performed reminder (if any) applies given hours-into-shift.
 *   - 'overdue' → >= 7 hrs in (takes precedence)
 *   - 'lunch'   → between 4 and 4.5 hrs in
 *   - null      → neither
 */
export function workReminderPhase(hoursIn: number): 'lunch' | 'overdue' | null {
  if (hoursIn >= OVERDUE_HOURS) return 'overdue';
  if (hoursIn >= LUNCH_HOURS && hoursIn < LUNCH_HOURS + LUNCH_WINDOW) return 'lunch';
  return null;
}

/** Format minutes-since-midnight as a 12-hour clock label, e.g. 450 → "7:30 AM". */
export function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
