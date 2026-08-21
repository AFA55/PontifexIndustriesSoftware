/**
 * THE PHASE BREAK ON THE PRINTED WORK TICKET.
 *
 * Every case here is Leifeng Construction, JOB-2026-400368, reproduced exactly:
 * the crew was on it Aug 10, Aug 11 and Aug 13; the contractor pushed it off;
 * it sat until Friday Aug 21 and came back to do DIFFERENT work under the same
 * contract, keeping its job number.
 *
 *   "I don't want to duplicate the ticket and extend dates, because then it
 *    would say that we've been working on it all week when that's not the
 *    case… same job ID should stay because same contract info."
 *
 * So one ticket, four days, and a visible break between the third and fourth —
 * and Friday reading BOTH numbers at once: Day 1 of getting back on it, day 4
 * on the job.
 *
 * The last describe block is the one that protects production: with no phases,
 * `buildTicketDays` must return the same three keys with the same values it
 * always has. Every ticket in the database today is that case.
 */

import {
  buildTicketDays,
  grandTotalHours,
  resolveCrewRoles,
  ticketRange,
  type TicketDailyLog,
  type TicketTimecardRow,
  type TicketWorkItem,
} from './work-ticket';
import type { JobPhase } from './job-phases';

const LEAD = '44444444-4444-4444-4444-444444444444';
const HELPER = '55555555-5555-5555-5555-555555555555';

const names = new Map<string, string | null>([
  [LEAD, 'Conrade'],
  [HELPER, 'Devin'],
]);
const roles = resolveCrewRoles({ assigned_to: LEAD, helper_assigned_to: HELPER });

/** Aug 10, Aug 11, Aug 13 — then nothing until Friday Aug 21. */
const WORKED = ['2026-08-10', '2026-08-11', '2026-08-13', '2026-08-21'];

const card = (id: string, user: string, date: string, hours: number): TicketTimecardRow => ({
  id,
  user_id: user,
  date,
  clock_in_time: `${date}T11:00:00Z`,
  clock_out_time: `${date}T20:00:00Z`,
  lunch_duration_minutes: 30,
  net_hours: hours,
  total_hours: hours,
});

const timecards: TicketTimecardRow[] = [
  card('c1', LEAD, '2026-08-10', 8.5),
  card('c2', HELPER, '2026-08-10', 8.5),
  card('c3', LEAD, '2026-08-11', 9),
  card('c4', LEAD, '2026-08-13', 7.25),
  // The restart. One man back on it Friday.
  card('c5', LEAD, '2026-08-21', 6),
];

const logs: TicketDailyLog[] = [
  {
    id: 'log-a',
    operator_id: LEAD,
    log_date: '2026-08-10',
    day_number: 1,
    hours_worked: 8.5,
    work_performed: null,
    notes: null,
  },
];

const workItems: TicketWorkItem[] = [
  {
    id: 'wi-a',
    operator_id: LEAD,
    day_number: 1,
    work_date: '2026-08-10',
    work_type: 'WALL SAW',
    quantity: 120,
    linear_feet_cut: 120,
    cut_depth_inches: 8,
  },
  {
    id: 'wi-b',
    operator_id: LEAD,
    work_date: '2026-08-21',
    work_type: 'CORE DRILL',
    quantity: 4,
    core_quantity: 4,
    core_size: '6"',
  },
];

const SCOPE_1 = 'Saw and remove the loading dock slab, north elevation.';
const SCOPE_2 = 'Core 4 × 6" penetrations for new plumbing risers, level 1.';

/**
 * Phase 1 opened on the job's own scheduled date and was parked on Aug 13, the
 * day the crew last stood on it. Phase 2 opens on the Friday it came back.
 */
const phases: JobPhase[] = [
  {
    id: 'ph-1',
    job_order_id: 'job-leifeng',
    phase_number: 1,
    started_on: '2026-08-10',
    scope_text: SCOPE_1,
    parked_on: '2026-08-13',
    park_reason: 'Contractor pushed the date — site not ready.',
  },
  {
    id: 'ph-2',
    job_order_id: 'job-leifeng',
    phase_number: 2,
    started_on: '2026-08-21',
    scope_text: SCOPE_2,
    parked_on: null,
    park_reason: null,
  },
];

const build = (opts: { phases?: JobPhase[]; mode?: 'day' | 'week' | 'job'; anchor?: string } = {}) =>
  buildTicketDays({
    range: ticketRange(opts.mode ?? 'job', opts.anchor ?? '2026-08-21', {
      from: WORKED[0],
      to: WORKED[WORKED.length - 1],
    }),
    timecards,
    logs,
    workItems,
    roles,
    names,
    fallbackOperatorId: LEAD,
    quantitiesFrom: 'lead',
    ...(opts.phases ? { phases: opts.phases, allWorkDates: WORKED } : {}),
  });

describe('Leifeng — one ticket, phases marked', () => {
  it('keeps all four days on ONE ticket, in one date-ascending list', () => {
    expect(build({ phases }).map((d) => d.date)).toEqual(WORKED);
  });

  it('Friday is Day 1 of the new phase AND day 4 on the job', () => {
    const friday = build({ phases }).find((d) => d.date === '2026-08-21')!;
    expect(friday.phase).toEqual({
      phaseNumber: 2,
      phaseDay: 1,
      lifetimeDay: 4,
      headingLabel: 'Day 1 — day 4 on the job',
    });
  });

  it('numbers the first run 1, 2, 3 with phase and lifetime agreeing', () => {
    const days = build({ phases });
    expect(days.slice(0, 3).map((d) => [d.phase!.phaseDay, d.phase!.lifetimeDay])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    // Nothing in the first run needs the second clause — it would be noise.
    expect(days.slice(0, 3).map((d) => d.phase!.headingLabel)).toEqual([
      'Day 1',
      'Day 2',
      'Day 3',
    ]);
  });

  it('makes the gap visible: eight days, Aug 13 → Aug 21, with the reason', () => {
    const friday = build({ phases }).find((d) => d.date === '2026-08-21')!;
    expect(friday.phaseBreak).toEqual({
      lastWorkedOn: '2026-08-13',
      resumedOn: '2026-08-21',
      days: 8,
      phaseNumber: 2,
      parkReason: 'Contractor pushed the date — site not ready.',
      scopeText: SCOPE_2,
    });
  });

  it('puts the break on the FIRST day of the new run and nowhere else', () => {
    const withBreak = build({ phases }).filter((d) => d.phaseBreak);
    expect(withBreak.map((d) => d.date)).toEqual(['2026-08-21']);
  });

  it('carries the NEW scope on the break — the days below it are billed to it', () => {
    const friday = build({ phases }).find((d) => d.date === '2026-08-21')!;
    expect(friday.phaseBreak!.scopeText).toBe(SCOPE_2);
    // …and the earlier wording is still readable, on the phase row itself.
    expect(phases[0].scope_text).toBe(SCOPE_1);
  });

  it('does not move a single hour — the ticket still totals what it always did', () => {
    expect(grandTotalHours(build({ phases }))).toBe(grandTotalHours(build()));
  });
});

describe('lifetimeDay is a fact about the JOB, not about the printed window', () => {
  it('week mode still calls Friday day 4, though Aug 10–13 are off the page', () => {
    const week = build({ phases, mode: 'week', anchor: '2026-08-21' });
    expect(week.map((d) => d.date)).toEqual(['2026-08-21']);
    expect(week[0].phase).toMatchObject({ phaseDay: 1, lifetimeDay: 4 });
    expect(week[0].phase!.headingLabel).toBe('Day 1 — day 4 on the job');
  });

  it('day mode, printed alone, says the same thing', () => {
    const day = build({ phases, mode: 'day', anchor: '2026-08-21' });
    expect(day[0].phase!.headingLabel).toBe('Day 1 — day 4 on the job');
    // The break still prints: the reader of a one-day sheet most needs to be
    // told the job had been sitting.
    expect(day[0].phaseBreak!.days).toBe(8);
  });

  it('without allWorkDates, job mode is still exact (the window IS the job)', () => {
    const days = buildTicketDays({
      range: ticketRange('job', '2026-08-21', { from: WORKED[0], to: WORKED[3] }),
      timecards,
      logs,
      workItems,
      roles,
      names,
      fallbackOperatorId: LEAD,
      phases,
    });
    expect(days.find((d) => d.date === '2026-08-21')!.phase).toMatchObject({
      phaseDay: 1,
      lifetimeDay: 4,
    });
  });
});

describe('a phase that was scheduled and never worked cannot invent a pause', () => {
  it('reports no break when the later run has no proven day', () => {
    const notYetBack: JobPhase[] = [
      phases[0],
      { ...phases[1], started_on: '2026-09-01' },
    ];
    const days = buildTicketDays({
      range: ticketRange('job', '2026-08-13', { from: WORKED[0], to: '2026-08-13' }),
      timecards: timecards.filter((t) => t.date !== '2026-08-21'),
      logs,
      workItems,
      roles,
      names,
      fallbackOperatorId: LEAD,
      phases: notYetBack,
      allWorkDates: WORKED.slice(0, 3),
    });
    expect(days.some((d) => d.phaseBreak)).toBe(false);
    expect(days.map((d) => d.phase!.lifetimeDay)).toEqual([1, 2, 3]);
  });
});

/**
 * THE SAFETY PROPERTY. Every job in production has no `job_phases` rows, so
 * this is the case that must not move by so much as a key.
 */
describe('no phases means nothing changes', () => {
  it('emits exactly { date, people, total_hours } — no phase, no phaseBreak', () => {
    for (const day of build()) {
      expect(Object.keys(day)).toEqual(['date', 'people', 'total_hours']);
      expect(day.phase).toBeUndefined();
      expect(day.phaseBreak).toBeUndefined();
    }
  });

  it('an empty phases array is the same as omitting it', () => {
    expect(build({ phases: [] })).toEqual(build());
    for (const day of build({ phases: [] })) {
      expect(Object.keys(day)).toEqual(['date', 'people', 'total_hours']);
    }
  });

  it('adding phases changes ONLY the two new keys — every hour and person is identical', () => {
    const before = build();
    const after = build({ phases });
    expect(after).toHaveLength(before.length);
    after.forEach((day, i) => {
      const { phase, phaseBreak, ...rest } = day;
      expect(rest).toEqual(before[i]);
      // Referenced so the destructure is not dead — and so a future edit that
      // stops setting these fails here rather than silently on paper.
      expect(phase ?? phaseBreak).toBeDefined();
    });
  });
});
