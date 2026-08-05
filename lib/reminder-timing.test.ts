/**
 * Tests for reminder timing logic — the window math that drives the
 * clock-in and work-performed reminder crons.
 */

import {
  parseHHMM,
  clockInReminderPhase,
  workReminderPhase,
  middayReminderDue,
  minutesToLabel,
  nowMinutesInTz,
  dateInTz,
  LUNCH_HOURS,
  OVERDUE_HOURS,
} from './reminder-timing';

describe('parseHHMM', () => {
  it('parses HH:MM to minutes-since-midnight', () => {
    expect(parseHHMM('07:30')).toBe(450);
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('23:59')).toBe(1439);
    expect(parseHHMM('7:05')).toBe(425);
  });
  it('ignores seconds', () => {
    expect(parseHHMM('08:15:42')).toBe(495);
  });
  it('returns null for invalid / empty', () => {
    expect(parseHHMM(null)).toBeNull();
    expect(parseHHMM(undefined)).toBeNull();
    expect(parseHHMM('')).toBeNull();
    expect(parseHHMM('nope')).toBeNull();
    expect(parseHHMM('25:00')).toBeNull();
    expect(parseHHMM('08:99')).toBeNull();
  });
});

describe('clockInReminderPhase', () => {
  const START = 450; // 7:30 AM
  it('returns "pre" ~5 min before start (window [start-7, start-2])', () => {
    expect(clockInReminderPhase(START - 5, START)).toBe('pre'); // 7:25
    expect(clockInReminderPhase(START - 7, START)).toBe('pre'); // edge
    expect(clockInReminderPhase(START - 2, START)).toBe('pre'); // edge
  });
  it('returns "post" ~5 min after start (window [start+3, start+8])', () => {
    expect(clockInReminderPhase(START + 5, START)).toBe('post'); // 7:35
    expect(clockInReminderPhase(START + 3, START)).toBe('post'); // edge
    expect(clockInReminderPhase(START + 8, START)).toBe('post'); // edge
  });
  it('returns null outside both windows', () => {
    expect(clockInReminderPhase(START, START)).toBeNull();       // exactly on time
    expect(clockInReminderPhase(START - 1, START)).toBeNull();   // gap between windows
    expect(clockInReminderPhase(START + 1, START)).toBeNull();   // gap
    expect(clockInReminderPhase(START - 30, START)).toBeNull();  // way early
    expect(clockInReminderPhase(START + 60, START)).toBeNull();  // way late
  });
});

describe('workReminderPhase', () => {
  it('returns "lunch" between 4 and 4.5 hours in', () => {
    expect(workReminderPhase(LUNCH_HOURS)).toBe('lunch');     // exactly 4h
    expect(workReminderPhase(4.25)).toBe('lunch');
  });
  it('does not fire lunch before 4h or at/after 4.5h', () => {
    expect(workReminderPhase(3.9)).toBeNull();
    expect(workReminderPhase(4.5)).toBeNull(); // window closed, not yet overdue
    expect(workReminderPhase(6.99)).toBeNull();
  });
  it('returns "overdue" at/after 7 hours (takes precedence)', () => {
    expect(workReminderPhase(OVERDUE_HOURS)).toBe('overdue');
    expect(workReminderPhase(9)).toBe('overdue');
  });
});

describe('minutesToLabel', () => {
  it('formats minutes as 12-hour clock', () => {
    expect(minutesToLabel(450)).toBe('7:30 AM');
    expect(minutesToLabel(0)).toBe('12:00 AM');
    expect(minutesToLabel(720)).toBe('12:00 PM');
    expect(minutesToLabel(780)).toBe('1:00 PM');
    expect(minutesToLabel(1380)).toBe('11:00 PM');
  });
});

describe('middayReminderDue', () => {
  const TARGET = parseHHMM('11:55')!; // 715

  it('is due inside the [target-7, target+8] window', () => {
    expect(middayReminderDue(TARGET, TARGET)).toBe(true);        // 11:55 exactly
    expect(middayReminderDue(TARGET - 7, TARGET)).toBe(true);    // 11:48 edge
    expect(middayReminderDue(TARGET + 8, TARGET)).toBe(true);    // 12:03 edge
  });

  it('is NOT due outside the window', () => {
    expect(middayReminderDue(TARGET - 8, TARGET)).toBe(false);   // 11:47
    expect(middayReminderDue(TARGET + 9, TARGET)).toBe(false);   // 12:04
    expect(middayReminderDue(0, TARGET)).toBe(false);            // midnight
    expect(middayReminderDue(TARGET + 300, TARGET)).toBe(false); // late afternoon
  });

  it('every-15-min cron cannot straddle-miss the target (window spans 16 min)', () => {
    // For any cron offset 0..14, at least one run lands in the window.
    for (let offset = 0; offset < 15; offset++) {
      let hits = 0;
      for (let t = offset; t < 24 * 60; t += 15) {
        if (middayReminderDue(t, TARGET)) hits++;
      }
      expect(hits).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('nowMinutesInTz', () => {
  it('computes minutes-since-midnight for a fixed instant in a tz', () => {
    // 2026-05-23T12:00:00Z → 08:00 in America/New_York (EDT, UTC-4) → 480 min
    const fixed = new Date('2026-05-23T12:00:00Z');
    expect(nowMinutesInTz('America/New_York', fixed)).toBe(480);
  });
  it('reflects a different timezone for the same instant', () => {
    const fixed = new Date('2026-05-23T12:00:00Z');
    // 05:00 in America/Los_Angeles (PDT, UTC-7) → 300 min
    expect(nowMinutesInTz('America/Los_Angeles', fixed)).toBe(300);
  });
});

describe('dateInTz — the calendar day a stored timestamp belongs to', () => {
  it("uses the tenant's day, not the server's UTC day", () => {
    // A real clock-in: 11:07 UTC is 7:07 AM Eastern on the SAME day.
    expect(dateInTz('2026-08-04T11:07:08.286Z', 'America/New_York')).toBe('2026-08-04');
  });

  it('keeps an evening submission on the day the crew actually worked', () => {
    // 00:30 UTC on Aug 5 is 8:30 PM Eastern on Aug 4 — the bug this prevents.
    expect(dateInTz('2026-08-05T00:30:00Z', 'America/New_York')).toBe('2026-08-04');
    // Proof the naive approach gets it wrong:
    expect('2026-08-05T00:30:00Z'.slice(0, 10)).toBe('2026-08-05');
  });

  it('handles a west-coast tenant too', () => {
    expect(dateInTz('2026-08-05T05:30:00Z', 'America/Los_Angeles')).toBe('2026-08-04');
  });

  it('accepts a Date as well as a string', () => {
    expect(dateInTz(new Date('2026-08-04T16:00:00Z'), 'America/New_York')).toBe('2026-08-04');
  });

  it('returns null for nothing rather than inventing a day', () => {
    expect(dateInTz(null, 'America/New_York')).toBeNull();
    expect(dateInTz('', 'America/New_York')).toBeNull();
    expect(dateInTz('not a date', 'America/New_York')).toBeNull();
  });
});
