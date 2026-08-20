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
      // PostgREST builder stand-in. Every chained method returns the builder,
      // and awaiting it yields this table's fixture with EVERY recorded filter
      // applied — `.eq` and `.in` alike.
      //
      // Applying them for real is the point. The module asks one table several
      // DIFFERENT questions and the answers must be allowed to differ:
      // `timecards` is read once for the cards LINKED to this job and once for
      // every card the crew clocked; `job_daily_assignments` once for this job's
      // board rows and once for the whole day's. Returning the same rows to both
      // made a card tagged ANOTHER job arrive as a linked card — the shape the
      // stale-tag tests below exist to exercise.
      //
      // Two earlier shortcuts are gone, and both were load-bearing:
      //   • `.eq` used to let a row through when it LACKED the column entirely
      //     (`r.job_order_id === undefined`). Real PostgREST excludes NULL from
      //     `col=eq.X`, so a fixture could pass a filter production would fail.
      //   • `.in` and `.eq('tenant_id', …)` used to be outright no-ops, which
      //     meant NO TEST IN THIS FILE COULD DETECT A LOST TENANT SCOPE — on a
      //     module that reads with `supabaseAdmin` and therefore bypasses RLS.
      //     The tenant-scope test at the bottom depends on this being honest.
      const b: any = {};
      const eqs: Array<[string, unknown]> = [];
      const ins: Array<[string, unknown[]]> = [];
      for (const method of ['select', 'order', 'limit']) b[method] = () => b;
      b.eq = (col: string, val: unknown) => {
        eqs.push([col, val]);
        return b;
      };
      b.in = (col: string, vals: unknown[]) => {
        ins.push([col, vals ?? []]);
        return b;
      };
      b.then = (resolve: any, reject: any) => {
        const res = mockResults[table] ?? { data: [], error: null };
        const filtered = res.data
          ? {
              ...res,
              data: res.data.filter(
                (r: any) =>
                  // `=== val`, never `== null`: a row without the column is a
                  // row with a NULL there, and PostgREST does not match NULL.
                  eqs.every(([c, v]) => r?.[c] === v) &&
                  ins.every(([c, vs]) => vs.includes(r?.[c]))
              ),
            }
          : res;
        return Promise.resolve(filtered).then(resolve, reject);
      };
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

/**
 * AUG 4 2026 — THE HELPER WHOSE CARD STILL SAID YESTERDAY.
 *
 * Founder, on JOB-2026-631148 (Harper General, Chesnee WWTP): "it doesn't show
 * Micah's time." Micah Rentz clocked 07:04→16:03, 8.47 hours. The board placed
 * him on Harper as Conrade Richardson's helper. His card carried MONDAY's job,
 * JOB-2026-424813, frozen at clock-in before the office finished the board — and
 * he filed nothing for 424813 that Tuesday.
 *
 * Two wrong answers came out of that one stale stamp, and both are pinned here:
 * Harper printed him `‡ scheduled; no hours`, and 424813 printed his 8.47 h as
 * recorded fact on a day the board had someone else in that seat.
 *
 * The day CANNOT be rescued by the boundary split, which is why the tag has to
 * go: 424813's only Aug 4 press is an Aug 3 copy (guard (a) rejects it) and both
 * board rows that day are `day_sequence` 1, so rule 7 cannot order them either.
 */
describe('attributableTimecards — a card tag the board contradicts and nothing corroborates', () => {
  const HARPER = 'job-harper';
  const PARKK = 'job-parkk';
  const MICAH = 'op-micah';
  const CONRADE = 'op-conrade-2';
  const DAY = '2026-08-04';
  const YESTERDAY = '2026-08-03';

  const micahCard = {
    id: 'tc-micah',
    user_id: MICAH,
    date: DAY,
    clock_in_time: '2026-08-04T11:04:48.363Z',
    clock_out_time: '2026-08-04T20:03:06.243Z',
    net_hours: 8.47,
    total_hours: 8.47,
    // MONDAY's job. Micah was at Harper on Tuesday.
    job_order_id: PARKK,
  };
  const conradeCard = {
    id: 'tc-conrade-2',
    user_id: CONRADE,
    date: DAY,
    clock_in_time: '2026-08-04T11:06:44.246Z',
    clock_out_time: '2026-08-04T19:59:15.292Z',
    net_hours: 8.38,
    total_hours: 8.38,
    job_order_id: null,
  };

  const seed = (opts: { micahFiledParkkLog?: boolean } = {}) => {
    mockResults.timecards = { data: [micahCard, conradeCard], error: null };
    mockResults.job_daily_assignments = {
      data: [
        // Tuesday: Micah is Conrade's helper at Harper. Nobody put him at Parkk.
        { assignment_date: DAY, operator_id: CONRADE, helper_id: MICAH, job_order_id: HARPER, day_sequence: 1 },
        { assignment_date: DAY, operator_id: 'op-zack', helper_id: 'deleted-user', job_order_id: PARKK, day_sequence: 1 },
        // Monday, which is where the frozen tag came from.
        { assignment_date: YESTERDAY, operator_id: 'op-zack', helper_id: MICAH, job_order_id: PARKK, day_sequence: 1 },
      ],
      error: null,
    };
    mockResults.daily_job_logs = {
      data: [
        // Harper's real Tuesday press, filed by Conrade.
        {
          operator_id: CONRADE,
          log_date: DAY,
          job_order_id: HARPER,
          route_started_at: '2026-08-04T11:43:01.468Z',
          work_started_at: '2026-08-04T11:43:03.655Z',
          day_completed_at: '2026-08-04T19:54:54.370Z',
        },
        // Parkk's Tuesday row carries MONDAY's press — a copy, not a press.
        ...(opts.micahFiledParkkLog
          ? [
              {
                operator_id: MICAH,
                log_date: DAY,
                job_order_id: PARKK,
                route_started_at: '2026-08-04T15:27:07.990Z',
                work_started_at: '2026-08-04T15:27:12.078Z',
                day_completed_at: '2026-08-04T20:31:27.042Z',
              },
            ]
          : [
              {
                operator_id: 'op-zack',
                log_date: DAY,
                job_order_id: PARKK,
                route_started_at: '2026-08-03T12:44:55.824Z',
                work_started_at: '2026-08-03T12:44:57.984Z',
                day_completed_at: '2026-08-04T21:21:00.234Z',
              },
            ]),
      ],
      error: null,
    };
    mockResults.helper_work_logs = { data: [], error: null };
    mockResults.job_orders = {
      data: [
        {
          id: HARPER,
          route_started_at: '2026-08-04T11:43:01.468Z',
          in_route_at: '2026-08-04T11:43:01.468Z',
          work_started_at: '2026-08-04T11:43:03.655Z',
        },
        // Parkk's whole-job press is Monday's, and it is the only one it has.
        { id: PARKK, route_started_at: null, in_route_at: '2026-08-03T12:44:55.824Z' },
      ],
      error: null,
    };
  };

  it("gives Harper Micah's whole 8.47-hour day, marked INFERRED", async () => {
    seed();
    const out = await attributableTimecards(HARPER, [CONRADE], [DAY]);
    const micah = out.cards.find((c) => c.id === 'tc-micah');
    expect(micah).toBeDefined();
    expect(Number(micah.net_hours)).toBe(8.47);
    // The office's placement put him here, not a tag — so it prints as inferred.
    expect(out.attributedIds.has('tc-micah')).toBe(true);
    // And it is the WHOLE card: the day never divided, so no segment exists.
    expect(out.boundarySegments.has('tc-micah')).toBe(false);
    // Conrade's untagged card is unaffected, as it always was.
    expect(out.cards.find((c) => c.id === 'tc-conrade-2')).toBeDefined();
  });

  it('and takes those same hours OFF the job the stale tag named', async () => {
    // The other half of the defect, and the reason the verdict is applied to the
    // LINKED read as well: without this the 8.47 h is billed twice, once on each
    // sheet, and the office cannot tell which is the real one.
    seed();
    const out = await attributableTimecards(PARKK, ['op-zack'], [DAY]);
    expect(out.cards.find((c) => c.id === 'tc-micah')).toBeUndefined();
    // He was somewhere else that day, and the ledger says where.
    expect(out.offJobPersonDays.has(`${MICAH}|${DAY}`)).toBe(true);
  });

  it('but a tag the person CORROBORATED with their own log that day survives — Zack, Aug 14', async () => {
    // Same shape, one fact different: the man filed the tagged job's log himself
    // that date. That is the only one of the six contradicted person-days in
    // production with any corroboration, and it is the day commit 5ca940e9
    // exists for. Nothing here may move it.
    seed({ micahFiledParkkLog: true });
    const out = await attributableTimecards(PARKK, ['op-zack'], [DAY]);
    const kept = out.cards.find((c) => c.id === 'tc-micah');
    expect(kept).toBeDefined();
    // Kept as a LINKED card — recorded, not inferred.
    expect(out.attributedIds.has('tc-micah')).toBe(false);
    expect(out.offJobPersonDays.has(`${MICAH}|${DAY}`)).toBe(true);
  });

  it('a corroborated tag still admits its job to the day, so the day can divide', async () => {
    // The `always_counts` guarantee itself: with the log in place, Harper's
    // ticket sees a TWO-job day for Micah and divides it at the presses —
    // Harper 11:04:48→15:27:07.990, the moment he turned toward the other job.
    seed({ micahFiledParkkLog: true });
    const out = await attributableTimecards(HARPER, [CONRADE], [DAY]);
    const seg = out.boundarySegments.get('tc-micah');
    expect(seg).toBeDefined();
    expect(seg!.end).toBe(new Date('2026-08-04T15:27:07.990Z').toISOString());
    expect(seg!.hours).toBe(4.37);
  });

  it('a helper log corroborates exactly as an operator log does — one rung, one verdict', async () => {
    // The deliberate choice recorded on `isStaleCardTag`: a helper log is the
    // weakest record in the building (every production row has `hours_worked`
    // NULL and almost all are a single filing instant), and it still counts,
    // because clause 4 asks whether this person NAMED the job that date, not how
    // long they were there — and because corroboration can only PRESERVE a tag,
    // never move an hour. Pinned so the choice cannot be reversed by accident.
    seed();
    mockResults.helper_work_logs = {
      data: [
        {
          helper_id: MICAH,
          log_date: DAY,
          job_order_id: PARKK,
          // A filing instant, not a work window. Deliberately the weak shape.
          started_at: '2026-08-04T17:53:14.759Z',
          completed_at: '2026-08-04T17:53:14.759Z',
          hours_worked: null,
        },
      ],
      error: null,
    };
    const out = await attributableTimecards(PARKK, ['op-zack'], [DAY]);
    const kept = out.cards.find((c) => c.id === 'tc-micah');
    expect(kept).toBeDefined();
    // Kept as LINKED, exactly as the operator-log case above.
    expect(out.attributedIds.has('tc-micah')).toBe(false);
  });

  it('a board that never spoke leaves the tag alone — silence is not contradiction', async () => {
    seed();
    // Strip the day's board rows entirely. Nothing then outranks the stamp, and
    // dropping it would lose the day rather than move it.
    mockResults.job_daily_assignments = {
      data: [
        { assignment_date: YESTERDAY, operator_id: 'op-zack', helper_id: MICAH, job_order_id: PARKK, day_sequence: 1 },
      ],
      error: null,
    };
    const out = await attributableTimecards(PARKK, [MICAH], [DAY]);
    expect(out.cards.find((c) => c.id === 'tc-micah')).toBeDefined();
    expect(out.attributedIds.has('tc-micah')).toBe(false);
  });
});

/**
 * THE JOB WITH NO CREW AT ALL — AND TWO CARDS STILL POINTING AT IT.
 *
 * QA-2026-942182 was soft-deleted on 2026-08-10. It has `assigned_to` NULL,
 * `helper_assigned_to` NULL, no `job_crew`, no `daily_job_logs`, no
 * `helper_work_logs`, and one EMPTY board row holding its date open. So the
 * caller hands this module an empty `userIds`, and the widening finds nobody to
 * add — while TWO clock cards are still tagged with it, one of them Aiden's
 * whole 9.89-hour Aug 4, a day the board spent on JOB-2026-402357.
 *
 * The guard here used to read `userIds.length === 0 || dates.length === 0` and
 * return the RAW linked read, which was a fourth reading of a card tag that
 * `isStaleCardTag` never reached: the condemned tag survived on this job while
 * the same card landed whole on the job the board named. 19.78 billed hours for
 * a 9.89-hour day, on the two sheets the office prints.
 *
 * The invariant these pin is the one that matters on an invoice: EXACTLY ONE
 * TICKET. Never two, never none.
 */
describe('attributableTimecards — a job with no crew still judges the tags pointing at it', () => {
  const DEAD = 'job-dead';
  const BOARD = 'job-board';
  const ELSEWHERE = 'job-elsewhere';
  const AIDEN = 'op-aiden';
  const DAY = '2026-08-04';

  const aidenCard = {
    id: 'tc-aiden',
    user_id: AIDEN,
    date: DAY,
    clock_in_time: '2026-08-04T11:00:00.000Z',
    clock_out_time: '2026-08-04T20:53:00.000Z',
    net_hours: 9.89,
    total_hours: 9.89,
    job_order_id: DEAD,
  };

  const seedDeadJob = () => {
    mockResults.timecards = { data: [aidenCard], error: null };
    mockResults.job_daily_assignments = {
      data: [
        // The dead job's own row places NOBODY — a skeleton holding the date.
        { assignment_date: DAY, operator_id: null, helper_id: null, job_order_id: DEAD },
        // The board put Aiden here that Tuesday.
        { assignment_date: DAY, operator_id: AIDEN, helper_id: null, job_order_id: BOARD },
      ],
      error: null,
    };
    // He filed a third job's paperwork from the truck; the board outranks it.
    mockResults.daily_job_logs = {
      data: [{ operator_id: AIDEN, log_date: DAY, job_order_id: ELSEWHERE }],
      error: null,
    };
    mockResults.helper_work_logs = { data: [], error: null };
    mockResults.job_orders = { data: [], error: null };
  };

  it('condemns the tag even though the caller could name nobody — the card LEAVES', async () => {
    seedDeadJob();
    // Exactly what the callers pass for this job: no crew, no dated logs.
    const out = await attributableTimecards(DEAD, [], []);
    expect(out.cards.find((c) => c.id === 'tc-aiden')).toBeUndefined();
    expect(out.cards).toHaveLength(0);
    // And the ledger's own verdict is reported, so every hours fallback
    // downstream refuses the day here too.
    expect(out.offJobPersonDays.has(`${AIDEN}|${DAY}`)).toBe(true);
  });

  it('and ARRIVES, once, on the job the board named — 9.89 h, not 19.78', async () => {
    seedDeadJob();
    const dead = await attributableTimecards(DEAD, [], []);
    const board = await attributableTimecards(BOARD, [AIDEN], [DAY]);
    const arrived = board.cards.find((c) => c.id === 'tc-aiden');
    expect(arrived).toBeDefined();
    expect(Number(arrived!.net_hours)).toBe(9.89);
    // Placed by the office, not by a tag — so it must print as inferred.
    expect(board.attributedIds.has('tc-aiden')).toBe(true);
    // ONE ticket in total. This is the guarantee, stated as arithmetic.
    const tickets =
      (dead.cards.some((c) => c.id === 'tc-aiden') ? 1 : 0) +
      (board.cards.some((c) => c.id === 'tc-aiden') ? 1 : 0);
    expect(tickets).toBe(1);
  });

  it('and no third job can claim it either', async () => {
    seedDeadJob();
    const other = await attributableTimecards(ELSEWHERE, [AIDEN], [DAY]);
    expect(other.cards.find((c) => c.id === 'tc-aiden')).toBeUndefined();
  });

  it('a genuinely dateless call still returns early — there is nothing to judge', async () => {
    // The other half of the old `||`. With no dates the ledger and the logs
    // cannot be read for anything, and a card with a date would have SUPPLIED
    // one, so `cards` is necessarily empty here.
    mockResults.timecards = { data: [], error: null };
    mockResults.job_daily_assignments = { data: [], error: null };
    const out = await attributableTimecards(DEAD, [], []);
    expect(out.cards).toEqual([]);
    expect(out.offJobPersonDays.size).toBe(0);
  });
});

/**
 * THE BOARD THAT SAID TWO THINGS — clause 2 of `isStaleCardTag`.
 *
 * Latent: zero production instances today (all six contradicted person-days have
 * exactly one board job). Pinned anyway, because the failure it prevents is the
 * worst one this module can produce and it fails SILENTLY.
 *
 * If the board places someone on TWO jobs and the tag names neither, condemning
 * the tag drops the card from the tagged job while BOTH board jobs refuse it as
 * `split` — one man's whole day on no ticket at all, printing "split" on two
 * sheets. So an ambiguous board is treated like a silent one: it decides
 * nothing, and the recorded stamp stands.
 */
describe('attributableTimecards — a two-job board cannot make a day vanish', () => {
  const TAGGED = 'job-tagged';
  const BOARD_A = 'job-board-a';
  const BOARD_B = 'job-board-b';
  const DEVIN = 'op-devin';
  const DAY = '2026-08-18';

  const devinCard = {
    id: 'tc-devin',
    user_id: DEVIN,
    date: DAY,
    clock_in_time: '2026-08-18T11:00:00.000Z',
    clock_out_time: '2026-08-18T20:00:00.000Z',
    net_hours: 9,
    total_hours: 9,
    job_order_id: TAGGED,
  };

  const seedTwoBoardJobs = () => {
    mockResults.timecards = { data: [devinCard], error: null };
    mockResults.job_daily_assignments = {
      data: [
        { assignment_date: DAY, operator_id: DEVIN, helper_id: null, job_order_id: BOARD_A },
        { assignment_date: DAY, operator_id: DEVIN, helper_id: null, job_order_id: BOARD_B },
      ],
      error: null,
    };
    mockResults.daily_job_logs = { data: [], error: null };
    mockResults.helper_work_logs = { data: [], error: null };
    // Neither board job pressed In Route, so the day cannot divide either —
    // this is the case where a dropped card has nowhere at all to land.
    mockResults.job_orders = {
      data: [
        { id: BOARD_A, route_started_at: null, in_route_at: null },
        { id: BOARD_B, route_started_at: null, in_route_at: null },
      ],
      error: null,
    };
  };

  it('keeps the tag — an ambiguous board decides nothing, like a silent one', async () => {
    seedTwoBoardJobs();
    const out = await attributableTimecards(TAGGED, [DEVIN], [DAY]);
    const kept = out.cards.find((c) => c.id === 'tc-devin');
    expect(kept).toBeDefined();
    // Still a LINKED card: nothing inferred it, the stamp did.
    expect(out.attributedIds.has('tc-devin')).toBe(false);
  });

  it('so the day lands on exactly one ticket instead of none', async () => {
    seedTwoBoardJobs();
    const tagged = await attributableTimecards(TAGGED, [DEVIN], [DAY]);
    const a = await attributableTimecards(BOARD_A, [DEVIN], [DAY]);
    const b = await attributableTimecards(BOARD_B, [DEVIN], [DAY]);
    const tickets = [tagged, a, b].filter((o) =>
      o.cards.some((c) => c.id === 'tc-devin')
    ).length;
    expect(tickets).toBe(1);
    expect(a.cards.find((c) => c.id === 'tc-devin')).toBeUndefined();
    expect(b.cards.find((c) => c.id === 'tc-devin')).toBeUndefined();
  });

  it('one board job condemns the same tag — the clause is about ambiguity, not about placement', async () => {
    // Drop the second board row and nothing else changes: the tag is condemned
    // and the day moves, which is the whole point of the rule.
    seedTwoBoardJobs();
    mockResults.job_daily_assignments = {
      data: [
        { assignment_date: DAY, operator_id: DEVIN, helper_id: null, job_order_id: BOARD_A },
      ],
      error: null,
    };
    const tagged = await attributableTimecards(TAGGED, [DEVIN], [DAY]);
    const a = await attributableTimecards(BOARD_A, [DEVIN], [DAY]);
    expect(tagged.cards.find((c) => c.id === 'tc-devin')).toBeUndefined();
    expect(a.cards.find((c) => c.id === 'tc-devin')).toBeDefined();
    expect(a.attributedIds.has('tc-devin')).toBe(true);
  });
});

/**
 * THE TENANT SCOPE, ACTUALLY EXERCISED.
 *
 * `supabaseAdmin` bypasses RLS, so `tenantId` is the ONLY thing standing between
 * this module and another company's clock cards. Until the mock above started
 * applying `.eq`/`.in` for real, no test in this file could have failed if the
 * filter were deleted outright.
 *
 * The escalation the stale-tag rule adds is why it is worth pinning now: a
 * foreign board placement used to be able only to DROP an untagged card; it can
 * now MOVE a tagged one. Production has a single tenant in
 * `job_daily_assignments` and no NULL `tenant_id` rows, so this is latent —
 * which is exactly when a test is cheap.
 */
describe('attributableTimecards — the tenant filter reaches every read', () => {
  const JOB_T = 'job-t';
  const HOME = 'tenant-home';
  const FOREIGN = 'tenant-foreign';
  const DAY = '2026-08-17';

  it('a foreign-tenant card tagged with this job never arrives', async () => {
    mockResults.timecards = {
      data: [
        { id: 'tc-home', user_id: 'u-1', date: DAY, job_order_id: JOB_T, net_hours: 8, tenant_id: HOME },
        { id: 'tc-foreign', user_id: 'u-2', date: DAY, job_order_id: JOB_T, net_hours: 8, tenant_id: FOREIGN },
      ],
      error: null,
    };
    mockResults.job_daily_assignments = { data: [], error: null };
    mockResults.daily_job_logs = { data: [], error: null };
    mockResults.helper_work_logs = { data: [], error: null };

    const out = await attributableTimecards(
      JOB_T,
      ['u-1'],
      [DAY],
      undefined,
      'timecards',
      HOME
    );
    expect(out.cards.map((c) => c.id)).toEqual(['tc-home']);
  });

  it("a foreign tenant's board placement cannot condemn this tenant's tag", async () => {
    mockResults.timecards = {
      data: [
        { id: 'tc-home', user_id: 'u-1', date: DAY, job_order_id: JOB_T, net_hours: 8, tenant_id: HOME },
      ],
      error: null,
    };
    mockResults.job_daily_assignments = {
      data: [
        // Another company's board, naming a different job for the same user id.
        { assignment_date: DAY, operator_id: 'u-1', helper_id: null, job_order_id: 'job-other', tenant_id: FOREIGN },
      ],
      error: null,
    };
    mockResults.daily_job_logs = { data: [], error: null };
    mockResults.helper_work_logs = { data: [], error: null };

    const out = await attributableTimecards(
      JOB_T,
      ['u-1'],
      [DAY],
      undefined,
      'timecards',
      HOME
    );
    expect(out.cards.map((c) => c.id)).toEqual(['tc-home']);
    expect(out.offJobPersonDays.size).toBe(0);
  });
});
