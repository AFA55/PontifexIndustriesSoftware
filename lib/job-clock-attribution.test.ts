/**
 * A DEAD QUERY MUST NOT LOOK LIKE A JOB NOBODY WORKED.
 *
 * `attributableTimecards` takes the column list from its CALLER (the
 * completion-summary route passes a 15-name literal), so one renamed or dropped
 * column makes PostgREST answer 42703. Every read here used to discard `error`,
 * so that answer became `data: null` → `cards: []` → HTTP **200** with zero
 * hours, and the screen the office writes invoices from read "No hours could be
 * tied to this job" for a week the crew worked.
 *
 * These pin the loud behaviour: any failed read throws, and the throw names
 * which read failed so the log says more than "empty".
 */
const mockResults: Record<string, { data: any[] | null; error: any }> = {};

jest.mock('./supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      // Minimal PostgREST builder stand-in: every chained method returns the
      // builder, and awaiting it yields whatever this table is configured with.
      const b: any = {};
      for (const method of ['select', 'eq', 'in', 'order', 'limit']) b[method] = () => b;
      b.then = (resolve: any, reject: any) =>
        Promise.resolve(mockResults[table] ?? { data: [], error: null }).then(resolve, reject);
      return b;
    },
  },
}));

import {
  attributableTimecards,
  TimecardAttributionQueryError,
} from './job-clock-attribution';

const JOB = 'job-1';
const USERS = ['op-1'];
const DATES = ['2026-08-17'];

const linkedCard = {
  id: 'tc-1',
  user_id: 'op-1',
  date: '2026-08-17',
  clock_in_time: '2026-08-17T11:00:00Z',
  clock_out_time: '2026-08-17T19:00:00Z',
  total_hours: 8,
  job_order_id: JOB,
};

beforeEach(() => {
  for (const k of Object.keys(mockResults)) delete mockResults[k];
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('attributableTimecards — a failed read throws instead of reporting zero', () => {
  it('surfaces a PostgREST error on the timecard read (the 42703 shape)', async () => {
    mockResults.timecards = {
      data: null,
      error: {
        code: '42703',
        message: 'column timecards.net_hours does not exist',
        details: null,
        hint: null,
      },
    };

    await expect(attributableTimecards(JOB, USERS, DATES)).rejects.toBeInstanceOf(
      TimecardAttributionQueryError
    );
  });

  it('the error names the failing read and carries the PostgREST code', async () => {
    mockResults.timecards = {
      data: null,
      error: { code: '42703', message: 'column timecards.bogus does not exist' },
    };

    const err = await attributableTimecards(JOB, USERS, DATES).catch((e) => e);
    expect(err).toBeInstanceOf(TimecardAttributionQueryError);
    expect(err.step).toBe('linked timecards');
    expect(err.pgError.code).toBe('42703');
    expect(String(err.message)).toContain('42703');
    // And it was logged with the object PostgREST returned, not just a string —
    // `details`/`hint` are the only place the offending column is named.
    expect(console.error).toHaveBeenCalled();
  });

  it('a failure on a LATER read (assignments) throws too — no partial answer', async () => {
    mockResults.timecards = { data: [linkedCard], error: null };
    mockResults.job_daily_assignments = {
      data: null,
      error: { code: '42P01', message: 'relation "job_daily_assignments" does not exist' },
    };

    const err = await attributableTimecards(JOB, USERS, DATES).catch((e) => e);
    expect(err).toBeInstanceOf(TimecardAttributionQueryError);
    expect(err.step).toContain('assignments');
  });

  it('a healthy set of reads still returns the cards (the guard is not a wall)', async () => {
    mockResults.timecards = { data: [linkedCard], error: null };

    const { cards, attributedIds, splitDates } = await attributableTimecards(JOB, USERS, DATES);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('tc-1');
    // Linked, not inferred.
    expect(attributedIds.size).toBe(0);
    expect(splitDates.size).toBe(0);
  });

  it('a genuinely empty result is still an empty result, not an error', async () => {
    const { cards } = await attributableTimecards(JOB, USERS, DATES);
    expect(cards).toEqual([]);
  });
});
