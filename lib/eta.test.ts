/**
 * Tests for the arrival estimate.
 *
 * The buffer rule is the founder's, stated in his own terms:
 *   under 1 hr → +20 min · over 1 hr → +30 min · over 3 hrs → +45 min (cap).
 * These tests are what stop that rule drifting.
 */

import {
  computeEta,
  estimateDriveMinutes,
  arrivalBufferMinutes,
  averageSpeedMph,
  straightLineMiles,
  formatEtaDuration,
  formatEtaClock,
  CIRCUITY_FACTOR,
} from './eta';

// Patriot's shop — the field-verified pin now stored on the tenant.
const SHOP = { latitude: 34.768775733693474, longitude: -82.43564252936702 };

describe("arrivalBufferMinutes — the founder's rule", () => {
  it('adds 20 minutes for a local run', () => {
    expect(arrivalBufferMinutes(5)).toBe(20);
    expect(arrivalBufferMinutes(59)).toBe(20);
    expect(arrivalBufferMinutes(60)).toBe(20); // exactly an hour is still "under"
  });

  it('adds 30 minutes once the drive passes an hour', () => {
    expect(arrivalBufferMinutes(61)).toBe(30);
    expect(arrivalBufferMinutes(180)).toBe(30);
  });

  it('adds 45 minutes beyond three hours, and never more', () => {
    expect(arrivalBufferMinutes(181)).toBe(45);
    expect(arrivalBufferMinutes(600)).toBe(45); // a ten-hour haul is still +45
  });
});

describe('drive-time estimation', () => {
  it('drives slower in town than on the interstate', () => {
    expect(averageSpeedMph(3)).toBeLessThan(averageSpeedMph(80));
  });

  it('never returns a negative or nonsense duration', () => {
    expect(estimateDriveMinutes(0)).toBe(0);
    expect(estimateDriveMinutes(-5)).toBe(0);
    expect(estimateDriveMinutes(NaN)).toBe(0);
  });

  it('gives a sane figure for a short local hop', () => {
    // 4 road miles at ~22 mph ≈ 11 min
    expect(estimateDriveMinutes(4)).toBeGreaterThan(5);
    expect(estimateDriveMinutes(4)).toBeLessThan(20);
  });

  it('grows with distance', () => {
    expect(estimateDriveMinutes(50)).toBeGreaterThan(estimateDriveMinutes(10));
  });
});

describe('straightLineMiles', () => {
  it('is zero for the same point', () => {
    expect(straightLineMiles(SHOP.latitude, SHOP.longitude, SHOP.latitude, SHOP.longitude)).toBeCloseTo(0, 5);
  });

  it('measures a known local distance', () => {
    // Shop (Piedmont SC) → a Wellford SC jobsite is roughly 25 miles.
    const miles = straightLineMiles(SHOP.latitude, SHOP.longitude, 34.9515, -82.1032);
    expect(miles).toBeGreaterThan(15);
    expect(miles).toBeLessThan(30);
  });
});

describe('computeEta', () => {
  it('prefers a real road distance over coordinates', () => {
    const r = computeEta({
      shop: SHOP,
      jobsite: { latitude: 34.9515, longitude: -82.1032 },
      driveDistanceMiles: 30,
    });
    expect(r.basis).toBe('road_distance');
    expect(r.miles).toBe(30);
    expect(r.approximate).toBe(false);
  });

  it('falls back to coordinates, and says so', () => {
    const r = computeEta({ shop: SHOP, jobsite: { latitude: 34.9515, longitude: -82.1032 } });
    expect(r.basis).toBe('straight_line');
    expect(r.approximate).toBe(true);
    expect(r.miles!).toBeGreaterThan(0);
  });

  it('inflates the straight line, because roads bend', () => {
    const jobsite = { latitude: 34.9515, longitude: -82.1032 };
    const crow = straightLineMiles(SHOP.latitude, SHOP.longitude, jobsite.latitude, jobsite.longitude);
    const r = computeEta({ shop: SHOP, jobsite });
    expect(r.miles!).toBeCloseTo(Math.round(crow * CIRCUITY_FACTOR * 10) / 10, 1);
  });

  it('refuses to invent an arrival time with nothing to measure from', () => {
    expect(computeEta({}).basis).toBe('unavailable');
    expect(computeEta({ shop: SHOP }).basis).toBe('unavailable');
    expect(computeEta({ shop: SHOP, jobsite: { latitude: null, longitude: null } }).basis).toBe('unavailable');
    expect(computeEta({}).totalMinutes).toBeNull();
  });

  it('treats 0,0 as missing, not as a jobsite in the Atlantic', () => {
    const r = computeEta({ shop: SHOP, jobsite: { latitude: 0, longitude: 0 } });
    expect(r.basis).toBe('unavailable');
  });

  it('ignores a zero or negative road distance and uses coordinates instead', () => {
    const r = computeEta({
      shop: SHOP,
      jobsite: { latitude: 34.9515, longitude: -82.1032 },
      driveDistanceMiles: 0,
    });
    expect(r.basis).toBe('straight_line');
  });

  it('adds drive + buffer into the total', () => {
    const r = computeEta({ shop: SHOP, jobsite: { latitude: 34.9515, longitude: -82.1032 } });
    expect(r.totalMinutes).toBe(r.driveMinutes! + r.bufferMinutes!);
  });

  it('produces an arrival clock time from a departure', () => {
    const depart = new Date('2026-08-05T11:00:00Z'); // 7:00 AM Eastern
    const r = computeEta({ shop: SHOP, jobsite: { latitude: 34.9515, longitude: -82.1032 }, departAt: depart });
    expect(r.arrivesAt).toBeInstanceOf(Date);
    expect(r.arrivesAt!.getTime()).toBe(depart.getTime() + r.totalMinutes! * 60_000);
  });

  it('applies the long-haul cap end to end', () => {
    // ~400 road miles — well past three hours of driving.
    const r = computeEta({ shop: SHOP, jobsite: { latitude: 34.9515, longitude: -82.1032 }, driveDistanceMiles: 400 });
    expect(r.driveMinutes!).toBeGreaterThan(180);
    expect(r.bufferMinutes).toBe(45);
  });
});

describe('formatting', () => {
  it('reads the way a person would say it', () => {
    expect(formatEtaDuration(35)).toBe('35 min');
    expect(formatEtaDuration(60)).toBe('1 hr');
    expect(formatEtaDuration(65)).toBe('1 hr 5 min');
    expect(formatEtaDuration(150)).toBe('2 hrs 30 min');
    expect(formatEtaDuration(120)).toBe('2 hrs');
  });

  it('says nothing rather than something wrong', () => {
    expect(formatEtaDuration(null)).toBe('');
    expect(formatEtaDuration(0)).toBe('');
    expect(formatEtaClock(null)).toBe('');
  });

  it("shows the clock in the tenant's timezone, not the server's", () => {
    // 11:45 UTC is 7:45 AM Eastern — the server runs UTC on Vercel.
    expect(formatEtaClock(new Date('2026-08-05T11:45:00Z'), 'America/New_York')).toBe('7:45 AM');
  });
});
