import {
  isWeekendDay, isFriday, jobCanWorkOn, jobRunsOn,
  countWorkingDays, endDateForWorkingDays,
} from './job-workdays';

// Aug 2026: 13 Thu · 14 Fri · 15 SAT · 16 SUN · 17 Mon · 21 Fri · 22 Sat
const noWeekends = { scheduling_flexibility: { can_work_weekends: false, can_work_fridays: true } };
const weekendsOK = { scheduling_flexibility: { can_work_weekends: true, can_work_fridays: true } };
const noFridays  = { scheduling_flexibility: { can_work_weekends: false, can_work_fridays: false } };

describe('which days a job occupies', () => {
  it('knows a weekend from a weekday', () => {
    expect(isWeekendDay('2026-08-15')).toBe(true);   // Sat
    expect(isWeekendDay('2026-08-16')).toBe(true);   // Sun
    expect(isWeekendDay('2026-08-17')).toBe(false);  // Mon
    expect(isFriday('2026-08-14')).toBe(true);
  });

  it('THE BUG: a Mon-Fri job does not sit on the board on Saturday', () => {
    const pratt = { ...noWeekends, scheduled_date: '2026-08-10', end_date: '2026-08-17' };
    expect(jobRunsOn(pratt, '2026-08-14')).toBe(true);   // Fri — yes
    expect(jobRunsOn(pratt, '2026-08-15')).toBe(false);  // Sat — no
    expect(jobRunsOn(pratt, '2026-08-16')).toBe(false);  // Sun — no
    expect(jobRunsOn(pratt, '2026-08-17')).toBe(true);   // Mon — yes
  });

  it('honours a job that CAN work weekends', () => {
    const j = { ...weekendsOK, scheduled_date: '2026-08-10', end_date: '2026-08-17' };
    expect(jobRunsOn(j, '2026-08-15')).toBe(true);
    expect(jobRunsOn(j, '2026-08-16')).toBe(true);
  });

  it('always shows a job that STARTS on a weekend — somebody put it there', () => {
    const sat = { ...noWeekends, scheduled_date: '2026-08-15', end_date: '2026-08-15' };
    expect(jobRunsOn(sat, '2026-08-15')).toBe(true);
  });

  it('drops Fridays only when the job explicitly says so', () => {
    expect(jobCanWorkOn(noFridays, '2026-08-14')).toBe(false);
    expect(jobCanWorkOn(noWeekends, '2026-08-14')).toBe(true);
    expect(jobCanWorkOn({}, '2026-08-14')).toBe(true); // no rules set → Fridays work
  });

  it('defaults weekends to NOT worked when nothing is set', () => {
    expect(jobCanWorkOn({}, '2026-08-15')).toBe(false);
  });

  it('respects the span itself', () => {
    const j = { ...noWeekends, scheduled_date: '2026-08-17', end_date: '2026-08-21' };
    expect(jobRunsOn(j, '2026-08-14')).toBe(false); // before it starts
    expect(jobRunsOn(j, '2026-08-24')).toBe(false); // after it ends
  });

  it('an open-ended job runs until told otherwise', () => {
    const j = { ...noWeekends, scheduled_date: '2026-08-10', end_date: null };
    expect(jobRunsOn(j, '2026-09-01')).toBe(true);
  });
});

describe('days remaining instead of a typed end date', () => {
  it('counts only the days the job can actually be worked', () => {
    // Mon 17 → Fri 21 is five working days; the weekend either side is skipped.
    expect(countWorkingDays(noWeekends, '2026-08-17', '2026-08-23')).toBe(5);
    expect(countWorkingDays(weekendsOK, '2026-08-17', '2026-08-23')).toBe(7);
  });

  it('Pratt: 35 more working days from Mon Aug 17 lands on Fri Oct 2', () => {
    const end = endDateForWorkingDays(noWeekends, '2026-08-17', 35);
    expect(end).toBe('2026-10-02');
    expect(isWeekendDay(end)).toBe(false);
  });

  it('one day is the same day', () => {
    expect(endDateForWorkingDays(noWeekends, '2026-08-17', 1)).toBe('2026-08-17');
  });

  it('never ends on a day the job cannot be worked', () => {
    for (let d = 1; d <= 40; d++) {
      expect(isWeekendDay(endDateForWorkingDays(noWeekends, '2026-08-17', d))).toBe(false);
    }
  });

  it('a job that works weekends can end on one', () => {
    expect(endDateForWorkingDays(weekendsOK, '2026-08-17', 6)).toBe('2026-08-22'); // Sat
  });
});
