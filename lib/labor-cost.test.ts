/**
 * Locks the bounded-job-hours + labor-cost math contract (founder, Aug 1 2026:
 * the "57-hour job" and the three-screens-three-made-up-rates bug).
 * These rules are payroll/billing-grade — every branch is pinned here.
 */
import {
  boundedJobHours,
  cardDayIsInsideJobWindow,
  cardPayrollDay,
  jobHoursForCard,
  laborLine,
  clampDailyLogHours,
  round2,
  MAX_DAILY_LOG_HOURS,
  DEFAULT_LABOR_BURDEN_PCT,
} from './labor-cost';

// Fixed "now" for open-card tests: 2026-08-01 15:00 UTC
const NOW = new Date('2026-08-01T15:00:00Z');

const card = (over: Partial<Parameters<typeof boundedJobHours>[0]> = {}) => ({
  clock_in_time: '2026-08-01T07:00:00Z',
  clock_out_time: '2026-08-01T15:00:00Z',
  total_hours: 7.5, // 8h span − 30min lunch
  ...over,
});

const job = (over: Partial<Parameters<typeof boundedJobHours>[1]> = {}) => ({
  work_started_at: '2026-08-01T08:00:00Z',
  route_started_at: '2026-08-01T07:30:00Z',
  work_completed_at: '2026-08-01T14:00:00Z',
  ...over,
});

describe('boundedJobHours — interval intersection', () => {
  it('bounds a full-day card to the job window (work_started → work_completed)', () => {
    // card 07:00–15:00, window 08:00–14:00 → 6h
    expect(boundedJobHours(card(), job(), NOW)).toBe(6);
  });

  it('shop-flagged cards contribute 0 job hours (is_shop_hours)', () => {
    expect(boundedJobHours(card({ is_shop_hours: true }), job(), NOW)).toBe(0);
  });

  it('shop-flagged via is_shop_time or work_location=shop also → 0', () => {
    expect(boundedJobHours(card({ is_shop_time: true }), job(), NOW)).toBe(0);
    expect(boundedJobHours(card({ work_location: 'shop' }), job(), NOW)).toBe(0);
  });

  it('no work_completed_at → window ends at clock_out (whole card minus pre-start)', () => {
    // window 08:00 → clock_out 15:00 = 7h, capped at total_hours 7.5 → 7
    expect(boundedJobHours(card(), job({ work_completed_at: null }), NOW)).toBe(7);
  });

  it('post-completion clock-out is cut at work_completed_at', () => {
    // clocked out 3h after the job completed → those 3h are NOT job labor
    const c = card({ clock_out_time: '2026-08-01T17:00:00Z', total_hours: 9.5 });
    expect(boundedJobHours(c, job(), NOW)).toBe(6); // 08:00 → 14:00
  });

  it('STALE work_started_at from days earlier cannot inflate hours (the 52.59h prod bug)', () => {
    // Window opened 2 days before the card — card span still bounds it.
    const j = job({ work_started_at: '2026-07-30T08:00:00Z', work_completed_at: null });
    expect(boundedJobHours(card(), j, NOW)).toBe(7.5); // full card, capped at paid 7.5
  });

  it('open card (no clock_out) ends at now', () => {
    const c = card({ clock_out_time: null, total_hours: null });
    // clock_in 07:00, now 15:00, window start 08:00, window end → now → 7h
    expect(boundedJobHours(c, job({ work_completed_at: null }), NOW)).toBe(7);
  });

  it('open card forgotten for days is capped at 16h, not days', () => {
    const c = card({
      clock_in_time: '2026-07-29T07:00:00Z',
      clock_out_time: null,
      total_hours: null,
    });
    const j = job({ work_started_at: '2026-07-29T07:00:00Z', work_completed_at: null });
    expect(boundedJobHours(c, j, NOW)).toBe(MAX_DAILY_LOG_HOURS);
  });

  it('clamps to 0 when the window and card do not overlap (never negative)', () => {
    // Job started AFTER the operator clocked out.
    const j = job({
      work_started_at: '2026-08-01T16:00:00Z',
      route_started_at: null,
      work_completed_at: '2026-08-01T20:00:00Z',
    });
    expect(boundedJobHours(card(), j, NOW)).toBe(0);
  });

  it('cross-midnight card: intersection spans the boundary (no calendar split)', () => {
    const c = {
      clock_in_time: '2026-08-01T22:00:00Z',
      clock_out_time: '2026-08-02T04:00:00Z',
      total_hours: 6,
    };
    const j = {
      work_started_at: '2026-08-01T23:00:00Z',
      route_started_at: null,
      work_completed_at: '2026-08-02T03:00:00Z',
    };
    expect(boundedJobHours(c, j, NOW)).toBe(4);
  });

  it('missing job timestamps → window defaults to the card itself (full paid hours)', () => {
    const j = { work_started_at: null, route_started_at: null, work_completed_at: null };
    expect(boundedJobHours(card(), j, NOW)).toBe(7.5); // span 8h capped at paid 7.5
  });

  it('cap at total_hours mirrors the lunch deduction', () => {
    // Intersection is 8h but the card only paid 7.5 → 7.5
    const j = job({ work_started_at: '2026-08-01T06:00:00Z', work_completed_at: '2026-08-01T16:00:00Z' });
    expect(boundedJobHours(card(), j, NOW)).toBe(7.5);
  });

  it('no clock_in → 0', () => {
    expect(boundedJobHours(card({ clock_in_time: null }), job(), NOW)).toBe(0);
  });
});

// ── THE NIGHT CARD ─────────────────────────────────────────────────────────
// `cardDayIsInsideJobWindow` decides whether an ATTRIBUTED card gets clipped to
// the job's on-site window. "Inside" is the answer that APPLIES the clip, so a
// wrong "inside" deletes hours. It used to answer from a UNION of the card's
// `date` column and the UTC day of its clock-in — two representations that
// disagree by a day on any evening card, in the direction that zeroes it.
//
// Production carries this card class: one card has `date` 2026-08-16 with a
// 22:02 local clock-in (2026-08-17 in UTC), plus three `is_night_shift` cards.
describe('cardDayIsInsideJobWindow — the payroll day of record wins', () => {
  // 22:00 Aug 14 → 06:00 Aug 15 EDT, filed on payroll day Aug 14.
  const nightCard = {
    date: '2026-08-14',
    clock_in_time: '2026-08-15T02:00:00Z', // 22:00 Aug 14 EDT
    clock_out_time: '2026-08-15T10:00:00Z', // 06:00 Aug 15 EDT
    net_hours: 8,
    total_hours: 8,
  };
  // The job was on site Aug 15, 08:00–16:00 EDT.
  const aug15Window = {
    work_started_at: '2026-08-15T12:00:00Z',
    route_started_at: null,
    work_completed_at: '2026-08-15T20:00:00Z',
  };

  it('an evening card dated the day BEFORE the window is OUTSIDE it', () => {
    // The old union said `true` via the UTC-derived '2026-08-15' alone, and the
    // clip against a window these hours never touched returned 0.00h of 8.00
    // paid — a whole night's work gone, printed as "off job".
    expect(cardDayIsInsideJobWindow(nightCard, aug15Window)).toBe(false);
  });

  it('so the attributed night card keeps its whole paid day', () => {
    expect(jobHoursForCard(nightCard, aug15Window, true)).toBe(8);
  });

  it('and the same card IS clipped when it is not attributed (recorded link)', () => {
    // A LINKED card is clipped regardless — the window is evidence about it.
    expect(jobHoursForCard(nightCard, aug15Window, false)).toBe(0);
  });

  it('a card dated INSIDE the window is still clipped (the 18.27h regression)', () => {
    const dayCard = {
      date: '2026-08-15',
      clock_in_time: '2026-08-15T11:00:00Z', // 07:00 EDT
      clock_out_time: '2026-08-15T21:00:00Z', // 17:00 EDT
      net_hours: 10,
      total_hours: 10,
    };
    expect(cardDayIsInsideJobWindow(dayCard, aug15Window)).toBe(true);
    expect(jobHoursForCard(dayCard, aug15Window, true)).toBe(8); // 08:00–16:00
  });

  it('falls back to the clock-in day in the TENANT zone, never UTC', () => {
    // Same instant, no `date` column: 22:00 Aug 14 Eastern is Aug 14 to the
    // office and Aug 15 to the server. The office is right.
    const undated = { ...nightCard, date: null };
    expect(cardPayrollDay(undated)).toBe('2026-08-14');
    expect(cardPayrollDay(undated, 'UTC')).toBe('2026-08-15');
    expect(cardDayIsInsideJobWindow(undated, aug15Window)).toBe(false);
  });

  it('window bounds are read in the same zone as the card day', () => {
    // An evening window: 21:00 Aug 14 EDT → 01:00 Aug 15 EDT. In UTC both
    // bounds land on Aug 15, and the Aug 14 card would test as OUTSIDE.
    const eveningWindow = {
      work_started_at: '2026-08-15T01:00:00Z',
      route_started_at: null,
      work_completed_at: '2026-08-15T05:00:00Z',
    };
    expect(cardDayIsInsideJobWindow(nightCard, eveningWindow)).toBe(true);
  });

  it('no window at all → nothing to clip against', () => {
    expect(
      cardDayIsInsideJobWindow(nightCard, {
        work_started_at: null,
        route_started_at: null,
        work_completed_at: null,
      })
    ).toBe(false);
  });
});

describe('laborLine — money rounding (line level, 2dp)', () => {
  it('base, burden-from-rounded-base, total', () => {
    // 6.33h × $28.50 = 180.405 → base 180.41; 25% → 45.1025 → 45.10; total 225.51
    const m = laborLine(6.33, 28.5, 25);
    expect(m.base).toBe(180.41);
    expect(m.burden).toBe(45.1);
    expect(m.total).toBe(225.51);
  });

  it('default burden constant is 25', () => {
    expect(DEFAULT_LABOR_BURDEN_PCT).toBe(25);
  });

  it('zero rate or zero hours → all zeros (no NaN, no fake numbers)', () => {
    expect(laborLine(0, 30, 25)).toEqual({ base: 0, burden: 0, total: 0 });
    expect(laborLine(8, 0, 25)).toEqual({ base: 0, burden: 0, total: 0 });
    expect(laborLine(NaN as unknown as number, 30, 25)).toEqual({ base: 0, burden: 0, total: 0 });
  });

  it('0% burden → total equals base', () => {
    const m = laborLine(8, 32, 0);
    expect(m).toEqual({ base: 256, burden: 0, total: 256 });
  });

  it('multiplier supports OT-style premiums', () => {
    const m = laborLine(2, 30, 25, 1.5);
    expect(m.base).toBe(90);
    expect(m.burden).toBe(22.5);
    expect(m.total).toBe(112.5);
  });
});

describe('clampDailyLogHours', () => {
  it('caps runaway hours at the max (the 52.59h row would store 16)', () => {
    expect(clampDailyLogHours(52.59)).toBe(16);
  });
  it('passes sane hours through rounded to 2dp', () => {
    expect(clampDailyLogHours(7.4567)).toBe(7.46);
  });
  it('negative / NaN → 0', () => {
    expect(clampDailyLogHours(-3)).toBe(0);
    expect(clampDailyLogHours(NaN)).toBe(0);
  });
  it('honors a custom max', () => {
    expect(clampDailyLogHours(14, 12)).toBe(12);
  });
});

describe('round2', () => {
  it('handles the classic float edge', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A FINISHED JOB WITH NO CLOSING STAMP MUST NOT STAY OPEN FOREVER.
//
// `work_completed_at` is NULL on 7 of 16 completed production jobs, including
// JOB-2026-277097 (Southern Basements, booked 8/10 → 8/11). With no end, the
// window degrades to the CARD's own end — no bound at all — so any card that
// survives attribution on a later day books in FULL against a job that finished
// days earlier. Dante's 10.37h Wednesday was one blank board cell away from it.
//
// The guard is deliberately narrow: `status = 'completed'` only, because a job
// still running routinely overruns its booked end (5 of 107 production
// assignments, 6 of 60 daily logs) and zeroing those would delete real work.
// ─────────────────────────────────────────────────────────────────────────────
describe('bookedSpanEndDay — the open-ended window guard', () => {
  // Southern Basements: marked complete, never stamped, booked Mon–Tue.
  const southernBasements = {
    work_started_at: '2026-08-10T11:43:56Z',
    route_started_at: '2026-08-10T11:43:54Z',
    work_completed_at: null,
    status: 'completed',
    booked_end_date: '2026-08-11',
  };
  // Dante's Wednesday: a whole day at AM King, 10.37 paid hours.
  const wednesdayCard = {
    date: '2026-08-12',
    clock_in_time: '2026-08-12T11:19:00Z',
    clock_out_time: '2026-08-12T22:01:00Z',
    net_hours: 10.37,
    total_hours: 10.37,
  };

  it('THE HAZARD: an unbounded window swallows a whole later day', () => {
    const unbounded = { ...southernBasements, status: null, booked_end_date: null };
    expect(jobHoursForCard(wednesdayCard, unbounded, true)).toBe(10.37);
    expect(jobHoursForCard(wednesdayCard, unbounded, false)).toBe(10.37);
  });

  it('books nothing on a day after the job\'s last booked day', () => {
    expect(jobHoursForCard(wednesdayCard, southernBasements, true)).toBe(0);
    // Linked cards too — the job was over for everyone.
    expect(jobHoursForCard(wednesdayCard, southernBasements, false)).toBe(0);
  });

  it('leaves the days the job WAS booked for untouched', () => {
    const tuesday = {
      date: '2026-08-11',
      clock_in_time: '2026-08-11T11:30:00Z',
      clock_out_time: '2026-08-11T22:38:00Z',
      net_hours: 10.64,
      total_hours: 10.64,
    };
    expect(jobHoursForCard(tuesday, southernBasements, false)).toBe(10.64);
    expect(jobHoursForCard(tuesday, southernBasements, true)).toBe(10.64);
  });

  it('does NOT fire on a job that is still running — overrun is real work', () => {
    // Production, today: Keontre on QA-2026-533392, booked 8/17, still
    // pending_completion, clocked in 8/18. A hard booked-span bound would
    // delete a live day.
    const stillRunning = { ...southernBasements, status: 'pending_completion' };
    const nextDay = {
      date: '2026-08-18',
      clock_in_time: '2026-08-18T11:00:00Z',
      clock_out_time: '2026-08-18T20:00:00Z',
      net_hours: 8.5,
      total_hours: 8.5,
    };
    expect(jobHoursForCard(nextDay, stillRunning, true)).toBe(8.5);
  });

  it('never overrides a REAL completion timestamp', () => {
    const stamped = { ...southernBasements, work_completed_at: '2026-08-12T22:00:00Z' };
    // The recorded end wins; the booked span is not consulted at all.
    expect(jobHoursForCard(wednesdayCard, stamped, false)).toBeGreaterThan(0);
  });

  it('is inert when the caller supplies no status or booked span', () => {
    // Every pre-existing call site omits both fields — behaviour must not move.
    const legacy = { ...southernBasements, status: undefined, booked_end_date: undefined };
    expect(jobHoursForCard(wednesdayCard, legacy, true)).toBe(10.37);
  });

  it('gives the day-coverage test a real end too', () => {
    expect(cardDayIsInsideJobWindow(wednesdayCard, southernBasements)).toBe(false);
    expect(
      cardDayIsInsideJobWindow({ ...wednesdayCard, date: '2026-08-11' }, southernBasements)
    ).toBe(true);
  });
});
