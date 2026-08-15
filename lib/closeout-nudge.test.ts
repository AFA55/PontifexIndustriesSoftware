/**
 * The rules behind "they finished but nobody pressed Done".
 * Shapes here mirror what production actually holds — see lib/closeout-nudge.ts.
 */

import {
  openWorkDays,
  canNudgeCloseout,
  closeoutRecipients,
  describeOpenDays,
  closeoutNudgeMessage,
  closeoutNudgeDedupKey,
  closeoutNudgeSummary,
  isCloseoutClosed,
} from './closeout-nudge';

const ymd = (s: string) => s; // dates are compared as strings, never parsed

describe('openWorkDays', () => {
  it('finds the real production signal: a log row that exists but was never completed', () => {
    // Pratt, Aug 11-13: every day HAD a log row, all three with a null
    // day_completed_at. A rule written around "no log row" finds nothing here.
    const days = openWorkDays(
      [
        { work_date: ymd('2026-08-11'), day_number: 1, operator_id: 'op-1' },
        { work_date: ymd('2026-08-12'), day_number: 2, operator_id: 'op-1' },
        { work_date: ymd('2026-08-13'), day_number: 3, operator_id: 'op-1' },
      ],
      [
        { log_date: ymd('2026-08-11'), day_number: 1, day_completed_at: null },
        { log_date: ymd('2026-08-12'), day_number: 2, day_completed_at: null },
        { log_date: ymd('2026-08-13'), day_number: 3, day_completed_at: null },
      ],
    );
    expect(days.map((d) => d.date)).toEqual(['2026-08-11', '2026-08-12', '2026-08-13']);
  });

  it('does not chase a day the LEAD closed just because the helper row is open', () => {
    // Real shape, JOB-2026-895358 (Pratt), Aug 12-13 as of Aug 15: daily_job_logs
    // holds one row PER OPERATOR. Conrade pressed Done for Today; Devin's row
    // keeps 0.00 hours and a null day_completed_at forever. Reading the flag off
    // one row reported both days open and would have texted Devin about work
    // that was already closed out.
    const days = openWorkDays(
      [
        { work_date: ymd('2026-08-12'), day_number: 2, operator_id: 'conrade' },
        { work_date: ymd('2026-08-13'), day_number: 3, operator_id: 'conrade' },
      ],
      [
        { log_date: ymd('2026-08-12'), day_number: 2, day_completed_at: '2026-08-12T23:00:00Z', operator_id: 'conrade' },
        { log_date: ymd('2026-08-12'), day_number: 2, day_completed_at: null, operator_id: 'devin' },
        { log_date: ymd('2026-08-13'), day_number: 3, day_completed_at: '2026-08-13T23:00:00Z', operator_id: 'conrade' },
        { log_date: ymd('2026-08-13'), day_number: 3, day_completed_at: null, operator_id: 'devin' },
      ],
    );
    expect(days).toEqual([]);
  });

  it('still chases a day where NOBODY closed out, on a two-person crew', () => {
    const days = openWorkDays(
      [{ work_date: ymd('2026-08-11'), day_number: 1, operator_id: 'conrade' }],
      [
        { log_date: ymd('2026-08-11'), day_number: 1, day_completed_at: null, operator_id: 'conrade' },
        { log_date: ymd('2026-08-11'), day_number: 1, day_completed_at: null, operator_id: 'devin' },
      ],
    );
    expect(days).toHaveLength(1);
    expect(days[0].operator_ids.sort()).toEqual(['conrade', 'devin']);
  });

  it('counts one open day ONCE when the work items carry no date', () => {
    // The job page groups work items by day NUMBER only. Without adopting the
    // log's date the same day buckets twice and the banner reads
    // "2 days never wrapped up · Aug 12 and Day 3" for a single day.
    const days = openWorkDays(
      [{ work_date: null, day_number: 3, operator_id: 'op-1' }],
      [{ log_date: ymd('2026-08-12'), day_number: 3, day_completed_at: null, operator_id: 'op-1' }],
    );
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-08-12');
    expect(days[0].day_number).toBe(3);
  });

  it('leaves a wrapped-up day alone', () => {
    const days = openWorkDays(
      [{ work_date: ymd('2026-08-14'), day_number: 2, operator_id: 'op-1' }],
      [{ log_date: ymd('2026-08-14'), day_number: 2, day_completed_at: '2026-08-14T22:10:00Z' }],
    );
    expect(days).toEqual([]);
  });

  it('still reports a day whose log was never created at all', () => {
    const days = openWorkDays(
      [{ work_date: ymd('2026-08-15'), day_number: 3, operator_id: 'op-2' }],
      [],
    );
    expect(days).toHaveLength(1);
    expect(days[0].operator_ids).toEqual(['op-2']);
  });

  it('reports a day the crew opened and abandoned with no work items', () => {
    const days = openWorkDays([], [
      { log_date: ymd('2026-08-15'), day_number: 1, day_completed_at: null, operator_id: 'op-3' },
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].operator_ids).toEqual(['op-3']);
  });

  it('orders oldest first — the day open longest is the one to name', () => {
    const days = openWorkDays(
      [
        { work_date: ymd('2026-08-13'), operator_id: 'op-1' },
        { work_date: ymd('2026-08-11'), operator_id: 'op-1' },
      ],
      [],
    );
    expect(days.map((d) => d.date)).toEqual(['2026-08-11', '2026-08-13']);
  });

  it('matches on date first, then falls back to day_number', () => {
    // The two sources disagree about the NUMBER but agree about the DAY.
    const days = openWorkDays(
      [{ work_date: ymd('2026-08-14'), day_number: 9, operator_id: 'op-1' }],
      [{ log_date: ymd('2026-08-14'), day_number: 2, day_completed_at: '2026-08-14T22:00:00Z' }],
    );
    expect(days).toEqual([]);
  });

  it('collects everyone on an open day: the item filer and the log owner', () => {
    const days = openWorkDays(
      [{ work_date: ymd('2026-08-13'), operator_id: 'helper-1' }],
      [{ log_date: ymd('2026-08-13'), day_completed_at: null, operator_id: 'op-1' }],
    );
    expect(days[0].operator_ids.sort()).toEqual(['helper-1', 'op-1']);
  });

  it('does not lose work filed with no date at all', () => {
    const days = openWorkDays([{ work_date: null, day_number: null, operator_id: 'op-1' }], []);
    expect(days).toHaveLength(1);
  });

  it('survives empty and null inputs', () => {
    expect(openWorkDays(null, null)).toEqual([]);
    expect(openWorkDays([], [])).toEqual([]);
  });
});

describe('canNudgeCloseout', () => {
  const open = [{ date: '2026-08-13', day_number: 3, operator_ids: ['op-1'] }];

  it('offers the button on a live job with an open day', () => {
    expect(canNudgeCloseout({ jobStatus: 'in_progress', openDays: open })).toBe(true);
    expect(canNudgeCloseout({ jobStatus: 'scheduled', openDays: open })).toBe(true);
  });

  it('withholds it once the job is closed', () => {
    expect(canNudgeCloseout({ jobStatus: 'completed', openDays: open })).toBe(false);
    expect(canNudgeCloseout({ jobStatus: 'cancelled', openDays: open })).toBe(false);
  });

  it('withholds it when every day is wrapped up', () => {
    expect(canNudgeCloseout({ jobStatus: 'in_progress', openDays: [] })).toBe(false);
  });

  it('reads status case-insensitively', () => {
    expect(isCloseoutClosed('Completed')).toBe(true);
    expect(isCloseoutClosed(null)).toBe(false);
  });
});

describe('closeoutRecipients', () => {
  it('tells the person who worked the open day, not whoever holds the job today', () => {
    const ids = closeoutRecipients(
      [{ date: '2026-08-13', day_number: 3, operator_ids: ['tuesday-op'] }],
      ['todays-op'],
    );
    expect(ids).toEqual(['tuesday-op']);
  });

  it('falls back to today’s crew when the open day names nobody', () => {
    const ids = closeoutRecipients(
      [{ date: '2026-08-13', day_number: 3, operator_ids: [] }],
      ['todays-op', 'todays-helper'],
    );
    expect(ids).toEqual(['todays-op', 'todays-helper']);
  });

  it('de-duplicates someone who worked several open days', () => {
    const ids = closeoutRecipients([
      { date: '2026-08-11', day_number: 1, operator_ids: ['op-1'] },
      { date: '2026-08-12', day_number: 2, operator_ids: ['op-1', 'op-2'] },
    ]);
    expect(ids).toEqual(['op-1', 'op-2']);
  });

  it('returns nothing rather than a null that would break an .in() query', () => {
    expect(closeoutRecipients([], [])).toEqual([]);
    expect(closeoutRecipients(null)).toEqual([]);
  });
});

describe('describeOpenDays', () => {
  const fmt = (d: string) => d.slice(5); // 'MM-DD', enough for the assertion

  it('names one day plainly', () => {
    expect(describeOpenDays([{ date: '2026-08-13', day_number: 3, operator_ids: [] }], fmt)).toBe('08-13');
  });

  it('joins two with "and"', () => {
    expect(
      describeOpenDays(
        [
          { date: '2026-08-12', day_number: 2, operator_ids: [] },
          { date: '2026-08-13', day_number: 3, operator_ids: [] },
        ],
        fmt,
      )
    ).toBe('08-12 and 08-13');
  });

  it('uses a serial comma list for three or more', () => {
    expect(
      describeOpenDays(
        [
          { date: '2026-08-11', day_number: 1, operator_ids: [] },
          { date: '2026-08-12', day_number: 2, operator_ids: [] },
          { date: '2026-08-13', day_number: 3, operator_ids: [] },
        ],
        fmt,
      )
    ).toBe('08-11, 08-12 and 08-13');
  });

  it('falls back to the day number when there is no date', () => {
    expect(describeOpenDays([{ date: null, day_number: 3, operator_ids: [] }], fmt)).toBe('Day 3');
  });
});

describe('closeoutNudgeMessage', () => {
  it('names the customer and the days, and asks for the specific action', () => {
    const { title, message } = closeoutNudgeMessage({
      customerName: 'Pratt Contractors',
      daysLabel: 'Aug 12 and Aug 13',
    });
    expect(title).toMatch(/work ticket/i);
    expect(message).toContain('Pratt Contractors');
    expect(message).toContain('Aug 12 and Aug 13');
    expect(message).toMatch(/Done for Today/);
  });

  it('does not accuse anyone of anything', () => {
    const { message } = closeoutNudgeMessage({ customerName: 'X', daysLabel: 'Aug 13' });
    expect(message).not.toMatch(/failed|forgot|late|why/i);
  });

  it('reads properly when the job has no customer name', () => {
    const { message } = closeoutNudgeMessage({ customerName: null, daysLabel: '' });
    expect(message).toContain('this job');
    expect(message).not.toContain('for .');
  });
});

describe('closeoutNudgeDedupKey', () => {
  it('is stable inside the hour and changes across it', () => {
    const base = 1_755_300_000_000;
    expect(closeoutNudgeDedupKey('job-1', base)).toBe(closeoutNudgeDedupKey('job-1', base + 60_000));
    expect(closeoutNudgeDedupKey('job-1', base)).not.toBe(
      closeoutNudgeDedupKey('job-1', base + 60 * 60 * 1000)
    );
  });

  it('does not collide with the waiver nudge on the same job', () => {
    expect(closeoutNudgeDedupKey('job-1', 0)).toContain('closeout_nudge:');
  });

  it('separates jobs', () => {
    expect(closeoutNudgeDedupKey('job-1', 0)).not.toBe(closeoutNudgeDedupKey('job-2', 0));
  });
});

describe('closeoutNudgeSummary', () => {
  it('reports a real send with the names', () => {
    expect(closeoutNudgeSummary({ notified: 2, alreadyNotified: 0, names: ['Dante', 'Keontre'] }))
      .toBe('Reminder sent to 2 crew members (Dante, Keontre).');
  });

  it('says so when the hour window swallowed the press', () => {
    expect(closeoutNudgeSummary({ notified: 0, alreadyNotified: 1 })).toMatch(/Already reminded/);
  });

  it('never reports silent success when there was nobody to tell', () => {
    expect(closeoutNudgeSummary({ notified: 0, alreadyNotified: 0 })).toMatch(/nobody to remind/i);
  });
});
