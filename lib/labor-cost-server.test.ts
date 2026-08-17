/**
 * Locks the billing-grade rules `buildLaborBreakdown` carries beyond the pure
 * math in labor-cost.test.ts:
 *
 *  1. an ATTRIBUTED card is not cut to the job's on-site window when its day
 *     falls OUTSIDE that window (the window only holds one day of a multi-day
 *     job, and intersecting against it threw real days away — JOB-2026-124747)
 *     — but IS cut when its day is inside, because the more speculative
 *     evidence class must not get the more generous bound (JOB-2026-343888
 *     billed 18.27h against a 4.87h measured day). It stays LABELLED as
 *     attributed all the way to the caller either way;
 *  2. a card is never charged for more hours than its owner was paid, even when
 *     `total_hours` is stale and larger than `net_hours`;
 *  3. an OPEN card's `net_hours = 0.00` / `total_hours = NULL` means NOT YET
 *     KNOWN, not zero — believing it made live jobs read 0.00h and $0 while the
 *     operator was still on site.
 */
jest.mock('./supabase-admin', () => ({ supabaseAdmin: {} }));

import { buildLaborBreakdown } from './labor-cost-server';
import { dropHelperDoubleCountedCards } from './labor-cost';

// Aug 5 07:00–15:30Z card; the job's on-site window is Aug 6 only.
const card = (over: Record<string, unknown> = {}) => ({
  id: 'tc-1',
  full_name: 'Dante burgess',
  role: 'operator',
  hourly_rate: 26,
  date: '2026-08-05',
  clock_in_time: '2026-08-05T07:00:00Z',
  clock_out_time: '2026-08-05T15:30:00Z',
  total_hours: 8,
  net_hours: 8,
  ...over,
});

const jobOnAug6 = {
  work_started_at: '2026-08-06T12:14:00Z',
  route_started_at: '2026-08-06T12:14:00Z',
  work_completed_at: '2026-08-06T19:36:00Z',
};

const NOW = new Date('2026-08-20T00:00:00Z');

const build = (args: Partial<Parameters<typeof buildLaborBreakdown>[0]> = {}) =>
  buildLaborBreakdown({
    job: jobOnAug6,
    timecards: [card()] as never,
    helperLogs: [],
    burdenPct: 25,
    now: NOW,
    ...args,
  });

describe('attributed cards are not cut to the job window', () => {
  it('a LINKED card on a day outside the window books nothing (unchanged rule)', () => {
    const out = build();
    expect(out.lines[0].attributed).toBe(false);
    expect(out.lines[0].bounded_hours).toBe(0);
  });

  it('the SAME card, attributed, books its own day', () => {
    const out = build({ attributedTimecardIds: new Set(['tc-1']) });
    expect(out.lines[0].attributed).toBe(true);
    expect(out.lines[0].bounded_hours).toBe(8);
  });

  // ── H4: THE SKIP IS FOR OTHER-DAY CARDS ONLY ─────────────────────────────
  // Skipping the window unconditionally handed the MORE speculative evidence
  // class the MORE generous bound. Production, one screen: JOB-2026-929434's
  // LINKED card was clipped 9.76h → 0.61h by its window, while
  // JOB-2026-343888's two ATTRIBUTED cards booked 18.27h unclipped against a
  // single-day 11:46→16:38 window its own daily log measured at 4.87h.
  it('an attributed card ON A DAY THE WINDOW COVERS is still clipped to it', () => {
    // JOB-2026-343888, Zack: 11:04→20:42Z card, 9.14h paid, window 11:46→16:38Z
    // on the same day. Only the 4.87h the job was on site can be billed.
    const out = buildLaborBreakdown({
      job: {
        work_started_at: '2026-07-28T11:46:11Z',
        route_started_at: '2026-07-28T11:46:07Z',
        work_completed_at: '2026-07-28T16:38:07Z',
      },
      timecards: [
        card({
          date: '2026-07-28',
          clock_in_time: '2026-07-28T11:04:10Z',
          clock_out_time: '2026-07-28T20:42:25Z',
          net_hours: 9.14,
          total_hours: 9.14,
        }),
      ] as never,
      helperLogs: [],
      burdenPct: 25,
      now: NOW,
      attributedTimecardIds: new Set(['tc-1']),
    });
    expect(out.lines[0].attributed).toBe(true);
    expect(out.lines[0].bounded_hours).toBe(4.87);
    // …and the screen can say what was cut and why.
    expect(out.lines[0].raw_hours).toBe(9.14);
    expect(out.lines[0].excluded_reason).toBe('outside_job_window');
  });

  it('an attributed card on a day OUTSIDE the window keeps its own day', () => {
    // JOB-2026-124747: window holds Aug 6 only; Dante's Aug 5 card is the
    // genuine multi-day case and must not be intersected into 0.00h.
    const out = build({ attributedTimecardIds: new Set(['tc-1']) });
    expect(out.lines[0].bounded_hours).toBe(8);
    expect(out.lines[0].excluded_hours).toBe(0);
  });

  it('clips an attributed card that shares the window\'s FIRST day of a range', () => {
    // A multi-day window (Aug 4 11:43 → Aug 5 14:27) covers both dates, so a
    // card on either is clipped; only a card outside Aug 4–5 escapes.
    const multiDay = {
      work_started_at: '2026-08-04T11:43:03Z',
      route_started_at: '2026-08-04T11:43:01Z',
      work_completed_at: '2026-08-05T14:27:59Z',
    };
    const inside = buildLaborBreakdown({
      job: multiDay,
      timecards: [
        card({ date: '2026-08-05', clock_in_time: '2026-08-05T11:00:00Z', clock_out_time: '2026-08-05T19:30:00Z', net_hours: 8.5, total_hours: 8.5 }),
      ] as never,
      helperLogs: [], burdenPct: 25, now: NOW,
      attributedTimecardIds: new Set(['tc-1']),
    });
    expect(inside.lines[0].bounded_hours).toBe(3.47); // 11:00 → 14:27

    const outside = buildLaborBreakdown({
      job: multiDay,
      timecards: [
        card({ date: '2026-08-07', clock_in_time: '2026-08-07T11:00:00Z', clock_out_time: '2026-08-07T19:30:00Z', net_hours: 8.5, total_hours: 8.5 }),
      ] as never,
      helperLogs: [], burdenPct: 25, now: NOW,
      attributedTimecardIds: new Set(['tc-1']),
    });
    expect(outside.lines[0].bounded_hours).toBe(8.5);
  });

  it('a LINKED card is clipped whether or not its day is in the window', () => {
    // Unchanged rule, restated so a future "symmetry" refactor cannot quietly
    // widen linked cards to match attributed ones.
    const out = build();
    expect(out.lines[0].bounded_hours).toBe(0);
  });

  it('an attributed card is still capped at the hours its owner was paid', () => {
    // 8.5h span, but only 8h paid.
    const out = build({ attributedTimecardIds: new Set(['tc-1']) });
    expect(out.lines[0].bounded_hours).toBeLessThanOrEqual(8);
  });

  it('an attributed SHOP card still books zero — shop time is never job labor', () => {
    const out = build({
      timecards: [card({ is_shop_hours: true })] as never,
      attributedTimecardIds: new Set(['tc-1']),
    });
    expect(out.lines[0].bounded_hours).toBe(0);
  });

  it('splits the totals into clocked vs attributed so a screen can label them', () => {
    const out = build({
      timecards: [
        card({ id: 'linked', clock_in_time: '2026-08-06T13:00:00Z', clock_out_time: '2026-08-06T18:00:00Z', date: '2026-08-06', total_hours: 5, net_hours: 5 }),
        card({ id: 'attr' }),
      ] as never,
      attributedTimecardIds: new Set(['attr']),
    });
    expect(out.totals.linked_hours).toBe(5);
    expect(out.totals.attributed_hours).toBe(8);
    expect(out.totals.bounded_hours).toBe(13);
    expect(out.totals.attributed_line_count).toBe(1);
    expect(out.totals.attributed_total).toBe(260); // 8h × $26 × 1.25
  });

  it('treats every card as clocked when no attributed set is supplied', () => {
    const out = build();
    expect(out.totals.attributed_line_count).toBe(0);
    expect(out.totals.linked_hours).toBe(out.totals.bounded_hours);
  });
});

// NEITHER COLUMN IS RELIABLY THE LUNCH-ADJUSTED ONE. Both directions are
// pinned here with real production shapes, because the tempting "simplification"
// of this rule to plain `net_hours` passes the first test and silently
// reintroduces a 0.50h overstatement caught by the second.
describe('paid hours cap', () => {
  it('takes net_hours when total_hours is the stale, LARGER one', () => {
    // Production row (Keontre, Aug 5): net 7.47, gross 7.97, total 8.01.
    // Billing 8.01 charges half an hour nobody worked.
    const out = build({
      timecards: [
        card({ net_hours: 7.47, total_hours: 8.01, clock_out_time: '2026-08-05T15:31:00Z' }),
      ] as never,
      attributedTimecardIds: new Set(['tc-1']),
    });
    expect(out.lines[0].bounded_hours).toBe(7.47);
    expect(out.lines[0].raw_hours).toBe(7.47);
  });

  it('takes total_hours when NET is the stale one — the reverse direction', () => {
    // Production row (Jun 9): an 11.73h span with a 30-minute lunch recorded.
    // `net_hours` equals the raw span (no deduction applied at all); only
    // `total_hours` took the half hour off. Reading net here overstates.
    const out = build({
      timecards: [
        card({
          clock_in_time: '2026-08-05T07:00:00Z',
          clock_out_time: '2026-08-05T18:44:00Z',
          net_hours: 11.73,
          total_hours: 11.23,
        }),
      ] as never,
      attributedTimecardIds: new Set(['tc-1']),
    });
    expect(out.lines[0].bounded_hours).toBe(11.23);
  });

  it('still uses total_hours when there is no net_hours', () => {
    const out = build({
      timecards: [card({ net_hours: null, total_hours: 6 })] as never,
      attributedTimecardIds: new Set(['tc-1']),
    });
    expect(out.lines[0].bounded_hours).toBe(6);
  });

  it('falls back to the clocked span for an open card with neither figure', () => {
    const out = build({
      timecards: [
        card({ net_hours: null, total_hours: null, clock_out_time: null }),
      ] as never,
      attributedTimecardIds: new Set(['tc-1']),
    });
    // Open card, capped by the 16h forgotten-clock-out guard.
    expect(out.lines[0].bounded_hours).toBe(16);
  });

  // ── H2: THE SHAPE PRODUCTION ACTUALLY PRODUCES ───────────────────────────
  // The test above uses `net_hours: null`, which no production row has. All 9
  // open cards carry `net_hours = 0.00` with `total_hours` NULL, and that zero
  // became a cap of 0 — so a job with an operator still on site read 0.00h and
  // $0, with `raw_hours` also 0 so nothing on screen explained it. Three of
  // those cards were on ACTIVE jobs the day this was found.
  it('an OPEN card with net 0.00 / total NULL accrues live hours, not 0.00', () => {
    const out = buildLaborBreakdown({
      job: { work_started_at: null, route_started_at: null, work_completed_at: null },
      timecards: [
        card({
          date: '2026-08-17',
          clock_in_time: '2026-08-17T10:38:21Z',
          clock_out_time: null,
          net_hours: 0,
          total_hours: null,
        }),
      ] as never,
      helperLogs: [],
      burdenPct: 25,
      now: new Date('2026-08-17T14:38:21Z'),
    });
    expect(out.lines[0].bounded_hours).toBe(4);
    // The raw figure explains the bounded one instead of contradicting it.
    expect(out.lines[0].raw_hours).toBe(4);
    expect(out.lines[0].total_cost).toBe(130); // 4h × $26 × 1.25
  });

  it('a CLOSED card with a real 0.00 still books zero', () => {
    // The production 2026-05-19 row: net 0.00 AND total 0.00, clocked out.
    // That zero is payroll, not a missing write, and must survive.
    const out = build({
      timecards: [
        card({ net_hours: 0, total_hours: 0, clock_out_time: '2026-08-05T07:00:00Z' }),
      ] as never,
      attributedTimecardIds: new Set(['tc-1']),
    });
    expect(out.lines[0].bounded_hours).toBe(0);
  });

  it('an open card is still capped by the 16h guard', () => {
    const out = buildLaborBreakdown({
      job: { work_started_at: null, route_started_at: null, work_completed_at: null },
      timecards: [
        card({ clock_in_time: '2026-08-17T10:00:00Z', clock_out_time: null, net_hours: 0, total_hours: null }),
      ] as never,
      helperLogs: [],
      burdenPct: 25,
      now: new Date('2026-08-19T10:00:00Z'),
    });
    expect(out.lines[0].bounded_hours).toBe(16);
  });
});

describe('helper lines', () => {
  it('are never marked attributed — the log row names the job', () => {
    const out = build({
      timecards: [],
      helperLogs: [
        { id: 'h1', log_date: '2026-08-06', hours_worked: 8, profiles: { full_name: 'Axel', role: 'apprentice', hourly_rate: 20 } },
      ] as never,
      attributedTimecardIds: new Set(['h1']),
    });
    expect(out.lines[0].attributed).toBe(false);
    expect(out.totals.attributed_hours).toBe(0);
  });
});

// The guard was written once, in the P&L route, and its siblings did not have
// it. It is shared now, so it is pinned here rather than in one route's tests.
describe('dropHelperDoubleCountedCards', () => {
  const cards = [
    { id: 'attr', user_id: 'help-1', date: '2026-08-07' },
    { id: 'linked', user_id: 'help-1', date: '2026-08-07' },
    { id: 'other', user_id: 'op-1', date: '2026-08-07' },
  ];

  it('drops an attributed card whose person-day a helper log already claims', () => {
    const out = dropHelperDoubleCountedCards(cards, new Set(['attr']), [
      { helper_id: 'help-1', log_date: '2026-08-07', hours_worked: 6 },
    ]);
    expect(out.map((c) => c.id)).toEqual(['linked', 'other']);
  });

  it('is a no-op while every helper log has NULL hours — production today', () => {
    const out = dropHelperDoubleCountedCards(cards, new Set(['attr']), [
      { helper_id: 'help-1', log_date: '2026-08-07', hours_worked: null },
    ]);
    expect(out).toHaveLength(3);
  });

  it('is idempotent, so applying it in two layers cannot double-drop', () => {
    const logs = [{ helper_id: 'help-1', log_date: '2026-08-07', hours_worked: 6 }];
    const once = dropHelperDoubleCountedCards(cards, new Set(['attr']), logs);
    const twice = dropHelperDoubleCountedCards(once, new Set(['attr']), logs);
    expect(twice).toEqual(once);
  });
});
