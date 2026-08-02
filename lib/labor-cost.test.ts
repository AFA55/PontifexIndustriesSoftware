/**
 * Locks the bounded-job-hours + labor-cost math contract (founder, Aug 1 2026:
 * the "57-hour job" and the three-screens-three-made-up-rates bug).
 * These rules are payroll/billing-grade — every branch is pinned here.
 */
import {
  boundedJobHours,
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
