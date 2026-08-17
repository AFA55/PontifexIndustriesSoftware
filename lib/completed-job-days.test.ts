/**
 * Locks the Completed Job Ticket's day pairing (founder, Aug 17 2026: work
 * performed on one side, the hours on the other). The rules that matter here
 * are billing-grade: a day the crew worked must never vanish because nobody
 * filed a log, and an ATTRIBUTED hour must never be indistinguishable from a
 * clocked one.
 */
import {
  buildCompletedJobDays,
  workPerformedLines,
  totalDayHours,
  attributedDayHours,
  paidOrLiveCardHours,
  type BuildCompletedJobDaysInput,
} from './completed-job-days';

const names = new Map<string, string | null>([
  ['op-1', 'Dante burgess'],
  ['op-2', 'Keontre Mcknight'],
  ['help-1', 'Axel valverde'],
]);

const base = (over: Partial<BuildCompletedJobDaysInput> = {}): BuildCompletedJobDaysInput => ({
  logs: [],
  workItems: [],
  timecards: [],
  helperLogs: [],
  names,
  ...over,
});

const card = (over: Partial<BuildCompletedJobDaysInput['timecards'][number]> = {}) => ({
  id: 'tc-a',
  user_id: 'op-1',
  date: '2026-08-07',
  clock_in_time: '2026-08-07T11:53:00Z',
  clock_out_time: '2026-08-07T18:00:00Z',
  net_hours: 6.11,
  total_hours: 6.11,
  ...over,
});

describe('workPerformedLines', () => {
  it('splits plain text on newlines and drops blanks', () => {
    expect(workPerformedLines('cut the slab\n\n  hauled out  ')).toEqual([
      'cut the slab',
      'hauled out',
    ]);
  });

  it('reads a JSON array that was stored in the TEXT column', () => {
    expect(workPerformedLines('[{"description":"core drilled 4 holes"}]')).toEqual([
      'core drilled 4 holes',
    ]);
  });

  it('keeps unparseable JSON-looking text rather than dropping it', () => {
    expect(workPerformedLines('{not really json')).toEqual(['{not really json']);
  });

  it('returns nothing for null/empty', () => {
    expect(workPerformedLines(null)).toEqual([]);
    expect(workPerformedLines('   ')).toEqual([]);
  });
});

describe('buildCompletedJobDays', () => {
  it('pairs a day’s work with that day’s hours', () => {
    const days = buildCompletedJobDays(
      base({
        logs: [
          {
            id: 'log-1',
            operator_id: 'op-1',
            log_date: '2026-08-07',
            day_number: 1,
            work_performed: 'saw cut the trench',
          },
        ],
        timecards: [card()],
      })
    );
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-08-07');
    expect(days[0].day_number).toBe(1);
    expect(days[0].work.map((w) => w.text)).toEqual(['saw cut the trench']);
    expect(days[0].hours).toHaveLength(1);
    expect(days[0].total_hours).toBe(6.11);
  });

  it('KEEPS a day that has hours but no filed log — that is the day being priced', () => {
    const days = buildCompletedJobDays(base({ timecards: [card({ date: '2026-08-10' })] }));
    expect(days.map((d) => d.date)).toEqual(['2026-08-10']);
    expect(days[0].work).toEqual([]);
    expect(days[0].total_hours).toBe(6.11);
  });

  it('keeps a day that has a log but no hours', () => {
    const days = buildCompletedJobDays(
      base({ logs: [{ log_date: '2026-08-05', work_performed: 'demo' }] })
    );
    expect(days[0].total_hours).toBe(0);
    expect(days[0].work).toHaveLength(1);
  });

  it('flags attributed hours and keeps clocked hours first', () => {
    const days = buildCompletedJobDays(
      base({
        timecards: [
          card({ id: 'tc-attr', user_id: 'op-2', clock_in_time: '2026-08-07T10:00:00Z' }),
          card({ id: 'tc-linked' }),
        ],
        attributedIds: new Set(['tc-attr']),
      })
    );
    // tc-attr clocks in EARLIER, but a recorded card still reads first.
    expect(days[0].hours.map((h) => h.key)).toEqual(['tc-tc-linked', 'tc-tc-attr']);
    expect(days[0].hours[0].attributed).toBe(false);
    expect(days[0].hours[1].attributed).toBe(true);
    expect(days[0].has_attributed_hours).toBe(true);
  });

  it('does not flag a day whose hours are all clocked', () => {
    const days = buildCompletedJobDays(base({ timecards: [card()] }));
    expect(days[0].has_attributed_hours).toBe(false);
  });

  // Both directions pinned — `net_hours ?? total_hours` (what this file said
  // first) passes the first of these and fails the second.
  it('takes the SMALLER of net_hours and total_hours when total is stale-high', () => {
    const days = buildCompletedJobDays(
      base({ timecards: [card({ net_hours: 7.47, total_hours: 8.01 })] })
    );
    expect(days[0].total_hours).toBe(7.47);
  });

  it('takes total_hours when NET is the stale one (no lunch deducted)', () => {
    // Production shape, Jun 9: net equals the raw span, total took the 30 off.
    const days = buildCompletedJobDays(
      base({ timecards: [card({ net_hours: 11.73, total_hours: 11.23 })] })
    );
    expect(days[0].total_hours).toBe(11.23);
  });

  it('zeroes shop cards and says so, rather than billing shop time to the job', () => {
    const days = buildCompletedJobDays(
      base({ timecards: [card({ is_shop_hours: true })] })
    );
    expect(days[0].hours[0].shop).toBe(true);
    expect(days[0].hours[0].hours).toBe(0);
    expect(days[0].total_hours).toBe(0);
  });

  it('treats work_location "shop" the same as the shop flags', () => {
    const days = buildCompletedJobDays(
      base({ timecards: [card({ work_location: 'Shop' })] })
    );
    expect(days[0].hours[0].hours).toBe(0);
  });

  it('marks a day nobody could be attributed on as unattributable', () => {
    const days = buildCompletedJobDays(
      base({
        logs: [{ log_date: '2026-08-06', work_performed: 'x' }],
        splitDates: new Set(['2026-08-06']),
      })
    );
    expect(days[0].unattributable).toBe(true);
  });

  it('dates a work item by work_date, falling back to its daily log', () => {
    const days = buildCompletedJobDays(
      base({
        logs: [{ id: 'log-9', log_date: '2026-08-05', work_performed: null }],
        workItems: [
          { work_type: 'Core', quantity: 2, work_date: '2026-08-06' } as never,
          { work_type: 'Wall Saw', quantity: 1, daily_log_id: 'log-9' } as never,
        ],
      })
    );
    expect(days.map((d) => d.date)).toEqual(['2026-08-05', '2026-08-06']);
    expect(days[0].work[0].text).toContain('Wall Saw');
    expect(days[1].work[0].text).toContain('Core');
  });

  it('never counts a helper log as attributed — the row names the job', () => {
    const days = buildCompletedJobDays(
      base({
        helperLogs: [
          { id: 'h1', helper_id: 'help-1', log_date: '2026-08-07', hours_worked: 8, work_description: 'held hose' },
        ],
      })
    );
    expect(days[0].hours[0].attributed).toBe(false);
    expect(days[0].hours[0].source).toBe('helper');
    expect(days[0].work.map((w) => w.text)).toContain('held hose');
  });

  it('sorts days ascending', () => {
    const days = buildCompletedJobDays(
      base({
        timecards: [
          card({ id: 'b', date: '2026-08-09' }),
          card({ id: 'a', date: '2026-08-04' }),
        ],
      })
    );
    expect(days.map((d) => d.date)).toEqual(['2026-08-04', '2026-08-09']);
  });
});

describe('totals', () => {
  const days = buildCompletedJobDays(
    base({
      timecards: [
        // Both columns are set. `card()` defaults total_hours to 6.11, and the
        // day's billable figure is min(net_hours, total_hours) — whichever one
        // actually had its lunch deducted. Overriding net_hours alone would
        // clamp every day back to 6.11 and quietly test the wrong thing.
        card({ id: 'l1', date: '2026-08-06', net_hours: 8.29, total_hours: 8.29 }),
        card({ id: 'a1', date: '2026-08-05', net_hours: 9.54, total_hours: 9.54 }),
      ],
      attributedIds: new Set(['a1']),
    })
  );

  it('adds every day the office would add by hand', () => {
    expect(totalDayHours(days)).toBe(17.83);
  });

  it('reports how much of that rests on attribution', () => {
    expect(attributedDayHours(days)).toBe(9.54);
  });
});

// ── THE PAID-HOURS RULE — the two NULL traps that shipped as bugs ───────────
// `paidOrLiveCardHours` here and `paidCardHours` in lib/labor-cost.ts sit on two
// screens the office reads side by side. They must not drift; they did, and
// these pin both ends of it.
describe('paidOrLiveCardHours null handling', () => {
  it('ignores a NULL total_hours instead of treating it as a zero cap', () => {
    // THE H3 BUG, exactly. The old body ran `.map(Number)` before discarding
    // nulls; `Number(null) === 0` passes a `>= 0` filter and wins the `min()`,
    // so this card booked 0.00h on the Work-Performed panel while the Labor
    // Cost modal beside it correctly said 5.50.
    expect(paidOrLiveCardHours({ id: 'x', net_hours: 5.5, total_hours: null })).toBe(5.5);
  });

  it('ignores a NULL net_hours the same way', () => {
    expect(paidOrLiveCardHours({ id: 'x', net_hours: null, total_hours: 7.25 })).toBe(7.25);
  });

  it('still takes the SMALLER when both are real — the lunch deduction', () => {
    // Production row (Keontre, Aug 5): net 7.47, total 8.01 (stale, high).
    expect(paidOrLiveCardHours({ id: 'x', net_hours: 7.47, total_hours: 8.01 })).toBe(7.47);
    // And the reverse direction (Jun 9): net is the stale one.
    expect(paidOrLiveCardHours({ id: 'x', net_hours: 11.73, total_hours: 11.23 })).toBe(11.23);
  });

  it('honours a real 0.00 on a CLOSED card', () => {
    expect(
      paidOrLiveCardHours({
        id: 'x',
        clock_in_time: '2026-05-19T11:00:00Z',
        clock_out_time: '2026-05-19T11:00:00Z',
        net_hours: 0,
        total_hours: 0,
      })
    ).toBe(0);
  });

  it('an OPEN card with net 0.00 / total NULL reads its live span, not 0.00h', () => {
    // THE H2 SHAPE, as production writes it: all 9 open cards carry
    // `net_hours = 0.00` with `total_hours` NULL until clock-out. Believing
    // that zero showed 0.00h beside an operator who is still on site.
    const hours = paidOrLiveCardHours(
      {
        id: 'x',
        clock_in_time: '2026-08-17T10:38:00Z',
        clock_out_time: null,
        net_hours: 0,
        total_hours: null,
      },
      new Date('2026-08-17T14:38:00Z')
    );
    expect(hours).toBe(4);
  });

  it('caps an open card at the 16h forgotten-clock-out guard', () => {
    const hours = paidOrLiveCardHours(
      { id: 'x', clock_in_time: '2026-08-17T10:00:00Z', clock_out_time: null, net_hours: 0, total_hours: null },
      new Date('2026-08-19T10:00:00Z')
    );
    expect(hours).toBe(16);
  });
});

describe('shop and double-count guards', () => {
  it('zeroes a helper log flagged as a shop ticket', () => {
    // `shop: false` was hardcoded on helper rows while the cost path honoured
    // `is_shop_ticket`, so shop hours would have shown as job hours here.
    const days = buildCompletedJobDays(
      base({
        helperLogs: [
          { id: 'h1', helper_id: 'help-1', log_date: '2026-08-07', hours_worked: 6, is_shop_ticket: true },
        ],
      })
    );
    expect(days[0].hours[0].shop).toBe(true);
    expect(days[0].hours[0].hours).toBe(0);
    expect(totalDayHours(days)).toBe(0);
  });

  it('drops an ATTRIBUTED card for a person-day a helper log already claims', () => {
    const days = buildCompletedJobDays(
      base({
        timecards: [card({ id: 'tc-help', user_id: 'help-1', date: '2026-08-07', net_hours: 6, total_hours: 6 })],
        helperLogs: [
          { id: 'h1', helper_id: 'help-1', log_date: '2026-08-07', hours_worked: 6 },
        ],
        attributedIds: new Set(['tc-help']),
      })
    );
    // One line, from the recorded helper log — not both roads to the same day.
    expect(days[0].hours).toHaveLength(1);
    expect(days[0].hours[0].source).toBe('helper');
    expect(totalDayHours(days)).toBe(6);
  });

  it('keeps a LINKED card even when a helper log claims that person-day', () => {
    // A job link is a recorded fact, not an inference. Two recorded facts about
    // one day are a data problem to surface, not one to silently resolve.
    const days = buildCompletedJobDays(
      base({
        timecards: [card({ id: 'tc-link', user_id: 'help-1', date: '2026-08-07', net_hours: 6, total_hours: 6 })],
        helperLogs: [
          { id: 'h1', helper_id: 'help-1', log_date: '2026-08-07', hours_worked: 6 },
        ],
      })
    );
    expect(days[0].hours).toHaveLength(2);
  });
});
