/**
 * Locks the local-vs-UTC date contract that produced the recurring off-by-one bug
 * (operator Zack: "Jun 1 showed as Sun May 31"). These assertions are timezone-robust:
 * because parse + format both use LOCAL time, the weekday is correct in any TZ.
 */
import {
  toLocalYMD,
  parseYMDLocal,
  formatDay,
  formatDayLong,
  dayName,
  mondayOf,
  weekStartOf,
  isWeekStartDay,
  weekDatesFrom,
  weekDatesMonSun,
  isWeekend,
  enumerateYMDRange,
  formatMaybeDateTime,
  endOfDayUTC,
  startOfDayUTC,
} from './dates';

describe('parseYMDLocal', () => {
  it('parses a bare date as LOCAL midnight, not UTC (no day-shift)', () => {
    const d = parseYMDLocal('2026-06-01');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June (0-indexed)
    expect(d.getDate()).toBe(1); // still the 1st — would be May 31 if parsed as UTC
    expect(d.getHours()).toBe(0);
  });
});

describe('toLocalYMD', () => {
  it('round-trips with parseYMDLocal', () => {
    expect(toLocalYMD(parseYMDLocal('2026-06-01'))).toBe('2026-06-01');
  });
  it('zero-pads month and day', () => {
    expect(toLocalYMD(parseYMDLocal('2026-01-05'))).toBe('2026-01-05');
  });
});

describe('formatDay — the Zack lock', () => {
  it('2026-06-01 displays as "Mon, Jun 1"', () => {
    expect(formatDay('2026-06-01')).toBe('Mon, Jun 1');
  });
  it('full weekday name is Monday', () => {
    expect(dayName('2026-06-01')).toBe('Monday');
  });
  it('long format renders the correct calendar day', () => {
    expect(formatDayLong('2026-06-01')).toBe('June 1, 2026');
  });
});

describe('mondayOf', () => {
  it('returns the same Monday when given a Monday', () => {
    expect(mondayOf('2026-06-01')).toBe('2026-06-01');
  });
  it('snaps mid-week back to Monday (Wed Jun 3 → Mon Jun 1)', () => {
    expect(mondayOf('2026-06-03')).toBe('2026-06-01');
  });
  it('snaps Sunday back to the PRECEDING Monday (Sun Jun 7 → Mon Jun 1)', () => {
    expect(mondayOf('2026-06-07')).toBe('2026-06-01');
  });
});

describe('week ranges', () => {
  it('weekDatesFrom yields Mon..Sun, 7 days, no UTC drift', () => {
    expect(weekDatesFrom('2026-06-01')).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-06',
      '2026-06-07',
    ]);
  });
  it('weekDatesMonSun(0) for a mid-week ref starts Mon Jun 1, ends Sun Jun 7', () => {
    const wk = weekDatesMonSun(0, parseYMDLocal('2026-06-03'));
    expect(wk[0]).toBe('2026-06-01');
    expect(wk[6]).toBe('2026-06-07');
  });
  it('weekDatesMonSun(-1) returns the previous week', () => {
    const wk = weekDatesMonSun(-1, parseYMDLocal('2026-06-03'));
    expect(wk[0]).toBe('2026-05-25');
    expect(wk[6]).toBe('2026-05-31');
  });
});

describe('isWeekend', () => {
  it('Monday 2026-06-01 is not a weekend', () => {
    expect(isWeekend('2026-06-01')).toBe(false);
  });
  it('Friday 2026-06-05 is not a weekend', () => {
    expect(isWeekend('2026-06-05')).toBe(false);
  });
  it('Saturday 2026-06-06 is a weekend', () => {
    expect(isWeekend('2026-06-06')).toBe(true);
  });
  it('Sunday 2026-06-07 is a weekend', () => {
    expect(isWeekend('2026-06-07')).toBe(true);
  });
});

describe('enumerateYMDRange', () => {
  it('returns a single day when no end date is given', () => {
    expect(enumerateYMDRange('2026-06-01')).toEqual(['2026-06-01']);
  });
  it('returns an inclusive range spanning a full week (Mon-Sun)', () => {
    expect(enumerateYMDRange('2026-06-01', '2026-06-07')).toEqual([
      '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04',
      '2026-06-05', '2026-06-06', '2026-06-07',
    ]);
  });
  it('returns just the start day when start === end', () => {
    expect(enumerateYMDRange('2026-06-03', '2026-06-03')).toEqual(['2026-06-03']);
  });
});

/**
 * The "1995" bug (founder, Aug 3 2026): "some jobs say the right date but that
 * they started in 1995, or other dates besides the real date."
 *
 * JavaScript's Date constructor accepts far more than it should. These pin the
 * guard that stops junk reaching the screen.
 */
describe('formatMaybeDateTime — untrusted date values', () => {
  it('refuses a bare number instead of inventing 1995', () => {
    // new Date('95') is literally Jan 1 1995. This is the reported bug.
    expect(formatMaybeDateTime('95')).toBe('—');
    expect(formatMaybeDateTime('7')).toBe('—');
    expect(formatMaybeDateTime('2026')).toBe('—');
  });

  it('refuses a half-typed datetime (a cleared time field)', () => {
    // The orientation field stored `${date}T` when the time was cleared.
    expect(formatMaybeDateTime('2026-08-05T')).toBe('—');
  });

  it('never renders the string "Invalid Date"', () => {
    for (const junk of ['', '   ', 'not a date', 'abc', '95', '2026-08-05T', null, undefined]) {
      expect(formatMaybeDateTime(junk)).not.toMatch(/Invalid Date/);
    }
  });

  it('renders a real timestamp', () => {
    expect(formatMaybeDateTime('2026-08-05T14:30:00Z')).not.toBe('—');
  });

  it('renders a bare date on the RIGHT day, not the day before', () => {
    // new Date('2026-08-05') is UTC midnight -> Aug 4 in every US timezone.
    const out = formatMaybeDateTime('2026-08-05');
    expect(out).not.toBe('—');
    expect(out).toContain('5');
    expect(out).not.toContain('4');
  });

  it('honours a custom fallback', () => {
    expect(formatMaybeDateTime('95', 'Not set')).toBe('Not set');
  });
});

/**
 * Auto-closing a forgotten shift used the bare string `${date}T23:59:59`, which
 * Postgres reads as 23:59:59 UTC = 7:59:59 PM Eastern. Paired with a UTC-date
 * read that closed a shift on the day it STARTED, this wrote timecards with
 * NEGATIVE hours (clock-in 9:29 PM, clock-out 7:59 PM, gross -1.49) on a live
 * payroll table.
 */
describe('endOfDayUTC — end of the OPERATOR day, not of UTC', () => {
  it('is 03:59:59Z the NEXT day for Eastern daylight time', () => {
    // 2026-08-03 23:59:59 EDT (UTC-4) === 2026-08-04T03:59:59Z
    expect(endOfDayUTC('2026-08-03', 'America/New_York')).toBe('2026-08-04T03:59:59.000Z');
  });

  it('shifts correctly for Eastern standard time', () => {
    // 2026-01-15 23:59:59 EST (UTC-5) === 2026-01-16T04:59:59Z
    expect(endOfDayUTC('2026-01-15', 'America/New_York')).toBe('2026-01-16T04:59:59.000Z');
  });

  it('is never EARLIER than a clock-in made that evening', () => {
    // The exact shape of the corrupted rows: clocked in 9:29 PM ET.
    const clockIn = new Date('2026-08-04T01:29:10Z'); // 9:29 PM EDT on Aug 3
    const close = new Date(endOfDayUTC('2026-08-03', 'America/New_York'));
    expect(close.getTime()).toBeGreaterThan(clockIn.getTime());
  });

  it('handles UTC itself without shifting', () => {
    expect(endOfDayUTC('2026-08-03', 'UTC')).toBe('2026-08-03T23:59:59.000Z');
  });
});

describe('startOfDayUTC — start of the OPERATOR day, not of UTC', () => {
  it('is 04:00:00Z the SAME day for Eastern daylight time', () => {
    // 2026-08-03 00:00:00 EDT (UTC-4) === 2026-08-03T04:00:00Z
    expect(startOfDayUTC('2026-08-03', 'America/New_York')).toBe('2026-08-03T04:00:00.000Z');
  });

  it('shifts correctly for Eastern standard time', () => {
    // 2026-01-15 00:00:00 EST (UTC-5) === 2026-01-15T05:00:00Z
    expect(startOfDayUTC('2026-01-15', 'America/New_York')).toBe('2026-01-15T05:00:00.000Z');
  });

  it('is NOT UTC midnight — the trap it exists to replace', () => {
    // setUTCHours(0,0,0,0) would give 2026-08-03T00:00:00Z, i.e. 8pm ET on the
    // 2nd, so anything an operator saved that evening falls in the wrong day.
    expect(startOfDayUTC('2026-08-03', 'America/New_York')).not.toBe('2026-08-03T00:00:00.000Z');
  });

  it('brackets the day with endOfDayUTC', () => {
    const start = startOfDayUTC('2026-08-03', 'America/New_York');
    const end = endOfDayUTC('2026-08-03', 'America/New_York');
    expect(new Date(start).getTime()).toBeLessThan(new Date(end).getTime());
    // Just under 24 hours apart (23:59:59, not 24:00:00).
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(86399000);
  });
});

describe('weekStartOf — the pay week does not have to start on Monday', () => {
  // Aug 2026: Sat 15, Sun 16, Mon 17, Fri 21.
  it("puts Javier's Saturday at the START of a new pay week, not the end of the old one", () => {
    expect(weekStartOf('2026-08-15', 'saturday')).toBe('2026-08-15');
    // The Monday rule buried it at the tail of the week that began Aug 10.
    expect(weekStartOf('2026-08-15', 'monday')).toBe('2026-08-10');
  });

  it('keeps Sat→Fri together: Sunday through Friday belong to the Saturday before', () => {
    for (const d of ['2026-08-15', '2026-08-16', '2026-08-17', '2026-08-20', '2026-08-21']) {
      expect(weekStartOf(d, 'saturday')).toBe('2026-08-15');
    }
    // ...and the next Saturday opens the next week.
    expect(weekStartOf('2026-08-22', 'saturday')).toBe('2026-08-22');
  });

  it('is identity when the date already IS the start day', () => {
    expect(weekStartOf('2026-08-17', 'monday')).toBe('2026-08-17');
    expect(weekStartOf('2026-08-16', 'sunday')).toBe('2026-08-16');
  });

  it('handles every start day without drifting a week', () => {
    const ref = '2026-08-19'; // a Wednesday
    expect(weekStartOf(ref, 'sunday')).toBe('2026-08-16');
    expect(weekStartOf(ref, 'monday')).toBe('2026-08-17');
    expect(weekStartOf(ref, 'wednesday')).toBe('2026-08-19');
    expect(weekStartOf(ref, 'thursday')).toBe('2026-08-13');
    expect(weekStartOf(ref, 'saturday')).toBe('2026-08-15');
  });

  it('crosses a month boundary correctly', () => {
    expect(weekStartOf('2026-09-01', 'saturday')).toBe('2026-08-29');
    expect(weekStartOf('2026-03-02', 'saturday')).toBe('2026-02-28');
  });

  it('mondayOf still behaves exactly as before', () => {
    for (const d of ['2026-08-15', '2026-08-16', '2026-08-17', '2026-08-19']) {
      expect(mondayOf(d)).toBe(weekStartOf(d, 'monday'));
    }
    expect(mondayOf('2026-08-16')).toBe('2026-08-10'); // Sunday belongs to the week before
  });

  it('never returns a date in the future', () => {
    for (const d of ['2026-08-15', '2026-08-16', '2026-08-19', '2026-08-21']) {
      for (const s of ['sunday', 'monday', 'saturday'] as const) {
        expect(weekStartOf(d, s) <= d).toBe(true);
      }
    }
  });

  it('isWeekStartDay guards what comes out of the database', () => {
    expect(isWeekStartDay('saturday')).toBe(true);
    expect(isWeekStartDay('Saturday')).toBe(false);
    expect(isWeekStartDay('')).toBe(false);
    expect(isWeekStartDay(null)).toBe(false);
  });
});
