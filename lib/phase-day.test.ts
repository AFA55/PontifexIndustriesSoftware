import { phaseDayFields, displayDayNumber } from './phase-day';
import type { JobPhase } from './job-phases';

/**
 * Leifeng Construction, JOB-2026-400368 — the case the whole feature was built
 * from. Proven work Aug 10, Aug 11, Aug 13. Parked Aug 11. Comes back Friday
 * Aug 21 under a new scope, and the crew's phone must say Day 1.
 */
const LEIFENG_PHASES: JobPhase[] = [
  {
    id: 'p1',
    job_order_id: 'leifeng',
    phase_number: 1,
    started_on: '2026-08-10',
    scope_text: 'Saw cut and remove exterior slab at 6 areas.',
    parked_on: '2026-08-11',
    park_reason: 'Contractor pushed us off — site not ready',
  },
  {
    id: 'p2',
    job_order_id: 'leifeng',
    phase_number: 2,
    started_on: '2026-08-21',
    scope_text: 'Core drill 12 penetrations through the north wall.',
    parked_on: null,
    park_reason: null,
  },
];

/** What `job_workday_evidence` holds for Leifeng before Friday. */
const LEIFENG_PROVEN = ['2026-08-10', '2026-08-11', '2026-08-13'];

// ─────────────────────────────────────────────────────────────────────────────
// THE SHIP-SAFETY PROPERTY, FIRST.
//
// Every job in production has no phase rows — the table does not even exist.
// If this block ever goes red, the change is not shippable, whatever else
// passes.
// ─────────────────────────────────────────────────────────────────────────────
describe('a job with no phases is left exactly as it was', () => {
  it('returns null for an empty phase list', () => {
    expect(
      phaseDayFields({ phases: [], provenDates: LEIFENG_PROVEN, today: '2026-08-21' })
    ).toBeNull();
  });

  it('returns null when the phase read failed and handed back null/undefined', () => {
    expect(
      phaseDayFields({ phases: null, provenDates: LEIFENG_PROVEN, today: '2026-08-21' })
    ).toBeNull();
    expect(
      phaseDayFields({ phases: undefined, provenDates: [], today: '2026-08-21' })
    ).toBeNull();
  });

  it('falls back to the exact expression the three screens used before', () => {
    // my-jobs/[id], work-performed and day-complete all computed this.
    expect(displayDayNumber({ total_days_worked: 3 })).toBe(4);
    expect(displayDayNumber({ total_days_worked: 0 })).toBe(1);
    expect(displayDayNumber({ total_days_worked: null })).toBe(1);
    expect(displayDayNumber({})).toBe(1);
    expect(displayDayNumber(null)).toBe(1);
    expect(displayDayNumber(undefined)).toBe(1);
  });

  it('still falls back when the field is present but null', () => {
    // The routes omit the field entirely; a null is what a stale cache or a
    // hand-rolled payload would carry. Same answer either way.
    expect(displayDayNumber({ phase_day_number: null, total_days_worked: 3 })).toBe(4);
  });
});

describe('Leifeng: Friday is Day 1 of the restart, not day 4', () => {
  it('numbers the restart day as phase day 1', () => {
    expect(
      phaseDayFields({
        phases: LEIFENG_PHASES,
        provenDates: LEIFENG_PROVEN,
        today: '2026-08-21',
      })
    ).toEqual({ phase_day_number: 1, phase_number: 2 });
  });

  it('is the number the crew actually sees', () => {
    // total_days_worked is 3 — the lifetime count, untouched by this feature.
    // The old expression would have printed "Day 4" on Friday.
    const job = { phase_day_number: 1, total_days_worked: 3 };
    expect(displayDayNumber(job)).toBe(1);
    expect(displayDayNumber({ total_days_worked: 3 })).toBe(4);
  });

  it('numbers Saturday as phase day 2 once Friday is proven', () => {
    expect(
      phaseDayFields({
        phases: LEIFENG_PHASES,
        provenDates: [...LEIFENG_PROVEN, '2026-08-21'],
        today: '2026-08-22',
      })
    ).toEqual({ phase_day_number: 2, phase_number: 2 });
  });

  it('numbers a day inside the FIRST run by the first run', () => {
    expect(
      phaseDayFields({
        phases: LEIFENG_PHASES,
        provenDates: LEIFENG_PROVEN,
        today: '2026-08-13',
      })
    ).toEqual({ phase_day_number: 3, phase_number: 1 });
  });
});

describe('today is counted once, never twice', () => {
  it('does not re-count a day that is already proven', () => {
    // The log landed at lunch and the operator reopens the screen. Aug 21 is
    // already in the evidence view; it keeps the ordinal it earned.
    const already = phaseDayFields({
      phases: LEIFENG_PHASES,
      provenDates: [...LEIFENG_PROVEN, '2026-08-21'],
      today: '2026-08-21',
    });
    expect(already).toEqual({ phase_day_number: 1, phase_number: 2 });
  });

  it('tolerates duplicate and unsorted proven dates', () => {
    expect(
      phaseDayFields({
        phases: LEIFENG_PHASES,
        provenDates: ['2026-08-13', '2026-08-10', '2026-08-10', '2026-08-11'],
        today: '2026-08-21',
      })
    ).toEqual({ phase_day_number: 1, phase_number: 2 });
  });
});

describe('edges that must not produce a wrong-but-plausible number', () => {
  it('returns null without a day to number', () => {
    expect(
      phaseDayFields({ phases: LEIFENG_PHASES, provenDates: LEIFENG_PROVEN, today: '' })
    ).toBeNull();
    expect(
      phaseDayFields({ phases: LEIFENG_PHASES, provenDates: LEIFENG_PROVEN, today: null })
    ).toBeNull();
  });

  it('handles a job with phases but no proven work at all', () => {
    // Nothing has been logged and nobody has clocked in. Today is still the
    // first day of this run.
    expect(
      phaseDayFields({
        phases: LEIFENG_PHASES,
        provenDates: [],
        today: '2026-08-21',
      })
    ).toEqual({ phase_day_number: 1, phase_number: 2 });
    expect(
      phaseDayFields({
        phases: LEIFENG_PHASES,
        provenDates: null,
        today: '2026-08-21',
      })
    ).toEqual({ phase_day_number: 1, phase_number: 2 });
  });

  it('puts a date earlier than phase 1 into phase 1 rather than a hole', () => {
    expect(
      phaseDayFields({
        phases: LEIFENG_PHASES,
        provenDates: [],
        today: '2026-08-09',
      })
    ).toEqual({ phase_day_number: 1, phase_number: 1 });
  });

  it('a single-phase job reads phase day = lifetime day', () => {
    const one = [LEIFENG_PHASES[0]];
    expect(
      phaseDayFields({ phases: one, provenDates: LEIFENG_PROVEN, today: '2026-08-13' })
    ).toEqual({ phase_day_number: 3, phase_number: 1 });
  });

  it('a third run restarts at 1 again', () => {
    const threeRuns: JobPhase[] = [
      ...LEIFENG_PHASES,
      {
        id: 'p3',
        job_order_id: 'leifeng',
        phase_number: 3,
        started_on: '2026-09-01',
        scope_text: 'Third scope.',
        parked_on: null,
        park_reason: null,
      },
    ];
    expect(
      phaseDayFields({
        phases: threeRuns,
        provenDates: [...LEIFENG_PROVEN, '2026-08-21', '2026-08-24'],
        today: '2026-09-01',
      })
    ).toEqual({ phase_day_number: 1, phase_number: 3 });
  });

  it('rejects a phase day that is not a usable ordinal', () => {
    // Better the old number than a "Day 0" or a "Day NaN" on a man's phone.
    expect(displayDayNumber({ phase_day_number: 0, total_days_worked: 3 })).toBe(4);
    expect(displayDayNumber({ phase_day_number: NaN, total_days_worked: 3 })).toBe(4);
    expect(
      displayDayNumber({ phase_day_number: '2' as unknown as number, total_days_worked: 3 })
    ).toBe(4);
  });
});
