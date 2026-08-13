import { waiverChaseStep, ASSUMED_TRAVEL_MINUTES } from './waiver-chase';

const MIN = 60 * 1000;
const IN_ROUTE = '2026-08-13T11:00:00.000Z'; // 7:00 AM ET
const inRouteMs = new Date(IN_ROUTE).getTime();
const arrival = inRouteMs + ASSUMED_TRAVEL_MINUTES * MIN;

describe('waiverChaseStep', () => {
  it('stays quiet while the crew is still driving', () => {
    expect(waiverChaseStep({ nowMs: inRouteMs + 5 * MIN, inRouteAt: IN_ROUTE })).toBeNull();
    expect(waiverChaseStep({ nowMs: arrival - 1, inRouteAt: IN_ROUTE })).toBeNull();
  });

  it('nudges once they are due on site', () => {
    const s = waiverChaseStep({ nowMs: arrival, inRouteAt: IN_ROUTE });
    expect(s?.key).toBe('due');
    // The paper ticket's own item 1, verbatim — the founder asked for the
    // ticket's wording so it does not read like a new rule.
    expect(s?.message('Pratt')).toContain(
      'Have contractor sign understandings prior to working and sign when complete.'
    );
    expect(s?.message('Pratt')).toContain('Pratt');
  });

  it('escalates at 45 minutes and again at 2 hours', () => {
    expect(waiverChaseStep({ nowMs: arrival + 44 * MIN, inRouteAt: IN_ROUTE })?.key).toBe('due');
    expect(waiverChaseStep({ nowMs: arrival + 45 * MIN, inRouteAt: IN_ROUTE })?.key).toBe('followup');
    expect(waiverChaseStep({ nowMs: arrival + 119 * MIN, inRouteAt: IN_ROUTE })?.key).toBe('followup');
    expect(waiverChaseStep({ nowMs: arrival + 120 * MIN, inRouteAt: IN_ROUTE })?.key).toBe('overdue');
  });

  // A cron that starts late, or a job that ran all day before anyone looked,
  // must not begin the ladder at the gentlest rung.
  it('returns the FURTHEST step reached, not the earliest', () => {
    expect(waiverChaseStep({ nowMs: arrival + 8 * 60 * MIN, inRouteAt: IN_ROUTE })?.key).toBe('overdue');
  });

  it('a real ETA wins over the assumed travel time', () => {
    const eta = inRouteMs + 90 * MIN; // a long drive
    // Past the assumed 30 min, but still driving by the real ETA.
    expect(waiverChaseStep({ nowMs: inRouteMs + 40 * MIN, inRouteAt: IN_ROUTE, etaMs: eta })).toBeNull();
    expect(waiverChaseStep({ nowMs: eta, inRouteAt: IN_ROUTE, etaMs: eta })?.key).toBe('due');
  });

  it('says nothing when there is no In Route stamp and no ETA', () => {
    expect(waiverChaseStep({ nowMs: Date.now(), inRouteAt: null })).toBeNull();
    expect(waiverChaseStep({ nowMs: Date.now(), inRouteAt: undefined })).toBeNull();
  });

  it('says nothing on an unparseable timestamp rather than chasing from epoch 0', () => {
    expect(waiverChaseStep({ nowMs: Date.now(), inRouteAt: 'not a date' })).toBeNull();
  });

  it('every step names the customer and asks for a signature or a resend', () => {
    for (const at of [arrival, arrival + 45 * MIN, arrival + 120 * MIN]) {
      const s = waiverChaseStep({ nowMs: at, inRouteAt: IN_ROUTE })!;
      const msg = s.message('Southern Basements');
      expect(msg).toContain('Southern Basements');
      expect(msg.toLowerCase()).toMatch(/sign/);
      expect(msg.toLowerCase()).toMatch(/resend/);
    }
  });
});
