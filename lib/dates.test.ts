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
  weekDatesFrom,
  weekDatesMonSun,
  isWeekend,
  enumerateYMDRange,
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
