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

/**
 * AUG 19 2026 — THE DAY THE BOARD SENT ONE CREW TO TWO JOBS.
 *
 * Conrade and Axel each clocked ONE card, both tagged NC&E, and the board placed
 * both men on NC&E and then Sterling. Every job that day recorded an in-route
 * press, so the day divides at them: NC&E from clock-in to Sterling's press,
 * Sterling from that press to clock-out.
 */
describe('attributableTimecards — the in-route press divides the day', () => {
  const NCE = 'job-nce';
  const STERLING = 'job-sterling';
  const CONRADE = 'op-conrade';
  const AXEL = 'op-axel';
  const DAY = '2026-08-19';
  const NCE_PRESS = '2026-08-19T11:52:42.498Z';
  const STERLING_PRESS = '2026-08-19T18:05:27.030Z';

  const conradeCard = {
    id: 'tc-conrade',
    user_id: CONRADE,
    date: DAY,
    clock_in_time: '2026-08-19T11:03:19.547Z',
    clock_out_time: '2026-08-19T21:38:48.668Z',
    net_hours: 10.09,
    total_hours: 10.09,
    job_order_id: NCE,
  };
  const axelCard = {
    id: 'tc-axel',
    user_id: AXEL,
    date: DAY,
    clock_in_time: '2026-08-19T11:09:17.983Z',
    clock_out_time: '2026-08-19T20:42:46.533Z',
    net_hours: 9.06,
    total_hours: 9.06,
    job_order_id: NCE,
  };

  const seedTheDay = (opts: { sterlingPress?: string | null } = {}) => {
    const sterlingPress = opts.sterlingPress === undefined ? STERLING_PRESS : opts.sterlingPress;
    mockResults.timecards = { data: [conradeCard, axelCard], error: null };
    mockResults.job_daily_assignments = {
      data: [
        { assignment_date: DAY, operator_id: CONRADE, helper_id: AXEL, job_order_id: NCE },
        { assignment_date: DAY, operator_id: CONRADE, helper_id: AXEL, job_order_id: STERLING },
      ],
      error: null,
    };
    mockResults.daily_job_logs = {
      data: [
        {
          operator_id: CONRADE,
          log_date: DAY,
          job_order_id: NCE,
          route_started_at: NCE_PRESS,
          work_started_at: '2026-08-19T14:12:55.025Z',
        },
        {
          operator_id: CONRADE,
          log_date: DAY,
          job_order_id: STERLING,
          route_started_at: sterlingPress,
          work_started_at: sterlingPress,
        },
      ],
      error: null,
    };
    mockResults.helper_work_logs = { data: [], error: null };
    mockResults.job_orders = {
      data: [
        { id: NCE, route_started_at: NCE_PRESS, in_route_at: NCE_PRESS },
        { id: STERLING, route_started_at: sterlingPress, in_route_at: sterlingPress },
      ],
      error: null,
    };
  };

  it('hands NC&E 7.03 and 6.93 — the morning, not the whole card', async () => {
    seedTheDay();
    const out = await attributableTimecards(NCE, [CONRADE, AXEL], [DAY]);
    expect(out.boundarySegments.get('tc-conrade')?.hours).toBe(7.03);
    expect(out.boundarySegments.get('tc-axel')?.hours).toBe(6.93);
    expect(out.boundaryIds.has('tc-conrade')).toBe(true);
    // The segment ends where Sterling starts, not where NC&E was signed off.
    expect(out.boundarySegments.get('tc-conrade')?.end).toBe(
      new Date(STERLING_PRESS).toISOString()
    );
  });

  it('does not divide the day when the second job was never pressed', async () => {
    // Guard (b): a job with no in-route press cannot claim a boundary, and
    // cannot be ordered against the one that has it either.
    seedTheDay({ sterlingPress: null });
    const out = await attributableTimecards(NCE, [CONRADE, AXEL], [DAY]);
    expect(out.boundarySegments.size).toBe(0);
    // …and the card still reaches the job the ordinary way, unchanged.
    expect(out.cards.map((c) => c.id).sort()).toEqual(['tc-axel', 'tc-conrade']);
  });

  it('rejects a stale press copied from an earlier day', async () => {
    seedTheDay({ sterlingPress: '2026-08-10T18:05:27.030Z' });
    const out = await attributableTimecards(NCE, [CONRADE, AXEL], [DAY]);
    expect(out.boundarySegments.size).toBe(0);
  });

  it('a dead start-stamp read throws — it must not read as "the day did not divide"', async () => {
    seedTheDay();
    mockResults.job_orders = {
      data: null,
      error: { code: '42703', message: 'column job_orders.in_route_at does not exist' },
    };
    await expect(attributableTimecards(NCE, [CONRADE, AXEL], [DAY])).rejects.toBeInstanceOf(
      TimecardAttributionQueryError
    );
  });
});
