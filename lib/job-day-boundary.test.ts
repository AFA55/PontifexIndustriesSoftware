import { jobStartOnDate, splitClockDayAtJobStarts } from './job-day-boundary';
import { floor2 } from './labor-cost';

// ── The Aug 19 2026 production day, verbatim ────────────────────────────────
// Two men, one clock card each, BOTH tagged NC&E. They ran NC&E in the morning
// and Sterling in the afternoon. The sheet printed Sterling at 0.04 h — the
// 1 min 45 s its daily log sat open.
const NCE = 'c2a1158f-d845-4424-9d79-9a9bd8f29538';
const STERLING = '189dbd86-75dd-43ba-9987-d873d94a8f33';
const D = '2026-08-19';

const NCE_PRESS = '2026-08-19T11:52:42.498Z'; // 07:52 EDT
const STERLING_PRESS = '2026-08-19T18:05:27.030Z'; // 14:05 EDT

const CONRADE_CARD = {
  clock_in_time: '2026-08-19T11:03:19.547Z', // 07:03 EDT
  clock_out_time: '2026-08-19T21:38:48.668Z', // 17:38 EDT
};
const AXEL_CARD = {
  clock_in_time: '2026-08-19T11:09:17.983Z', // 07:09 EDT
  clock_out_time: '2026-08-19T20:42:46.533Z', // 16:42 EDT
};

const day = [
  { job_order_id: NCE, started_at: NCE_PRESS },
  { job_order_id: STERLING, started_at: STERLING_PRESS },
];

const hoursFor = (segments: ReturnType<typeof splitClockDayAtJobStarts>, jobId: string) =>
  segments?.find((s) => s.job_order_id === jobId)?.hours ?? null;

describe('floor2 — a share may not invent what the day did not contain', () => {
  it('rounds DOWN, so N shares never sum past the card', () => {
    // round2 turns Conrade's day into 7.04 + 3.56 = 10.60 against a 10.59h span.
    expect(floor2(7.0354119)).toBe(7.03);
    expect(floor2(3.5560106)).toBe(3.55);
    expect(7.03 + 3.55).toBeLessThanOrEqual(10.59);
  });

  it('does not eat a value that is already exact', () => {
    expect(floor2(7.03)).toBe(7.03);
    expect(floor2(3)).toBe(3);
  });

  it('is zero for nothing, never negative or NaN', () => {
    expect(floor2(0)).toBe(0);
    expect(floor2(-4)).toBe(0);
    expect(floor2(Number.NaN)).toBe(0);
  });
});

describe('splitClockDayAtJobStarts — Aug 19 2026, exactly as it happened', () => {
  it("Conrade's day divides 7.03 / 3.55 at Sterling's in-route press", () => {
    const segments = splitClockDayAtJobStarts(CONRADE_CARD, day);
    expect(segments).not.toBeNull();
    expect(hoursFor(segments, NCE)).toBe(7.03);
    expect(hoursFor(segments, STERLING)).toBe(3.55);
  });

  it("Axel splits the same way, from his OWN card — not the operator's", () => {
    const segments = splitClockDayAtJobStarts(AXEL_CARD, day);
    expect(hoursFor(segments, NCE)).toBe(6.93);
    expect(hoursFor(segments, STERLING)).toBe(2.62);
  });

  it('0.04 — the daily log\'s open duration — is nowhere in the answer', () => {
    for (const card of [CONRADE_CARD, AXEL_CARD]) {
      const segments = splitClockDayAtJobStarts(card, day)!;
      for (const s of segments) expect(s.hours).toBeGreaterThan(1);
    }
  });

  it('the FIRST job runs from CLOCK-IN, not from its own press', () => {
    // 07:03 clock-in, 07:52 press: the 49 minutes of loading bill to NC&E.
    const segments = splitClockDayAtJobStarts(CONRADE_CARD, day)!;
    const first = segments.find((s) => s.job_order_id === NCE)!;
    expect(first.start).toBe(new Date(CONRADE_CARD.clock_in_time).toISOString());
    expect(first.end).toBe(new Date(STERLING_PRESS).toISOString());
  });

  it('the LAST job runs to CLOCK-OUT', () => {
    const segments = splitClockDayAtJobStarts(CONRADE_CARD, day)!;
    const last = segments.find((s) => s.job_order_id === STERLING)!;
    expect(last.start).toBe(new Date(STERLING_PRESS).toISOString());
    expect(last.end).toBe(new Date(CONRADE_CARD.clock_out_time).toISOString());
  });

  it('the shares never sum past the clocked span', () => {
    const segments = splitClockDayAtJobStarts(CONRADE_CARD, day)!;
    const sum = segments.reduce((s, x) => s + x.hours, 0);
    const gross =
      (new Date(CONRADE_CARD.clock_out_time).getTime() -
        new Date(CONRADE_CARD.clock_in_time).getTime()) /
      3600000;
    expect(sum).toBeLessThanOrEqual(gross);
  });
});

describe('splitClockDayAtJobStarts — order and completion', () => {
  const A = 'aaaaaaaa-0000-0000-0000-000000000000';
  const B = 'bbbbbbbb-0000-0000-0000-000000000000';
  const card = { clock_in_time: '2026-08-19T11:00:00Z', clock_out_time: '2026-08-19T21:00:00Z' };

  it('orders by the PRESS, not by the order the jobs are handed in', () => {
    const segments = splitClockDayAtJobStarts(card, [
      { job_order_id: B, started_at: '2026-08-19T18:00:00Z' },
      { job_order_id: A, started_at: '2026-08-19T12:00:00Z' },
    ])!;
    expect(segments.map((s) => s.job_order_id)).toEqual([A, B]);
    expect(hoursFor(segments, A)).toBe(7); // clock-in 11:00 → B's press 18:00
    expect(hoursFor(segments, B)).toBe(3);
  });

  it('a job COMPLETED before the next press still runs to that press', () => {
    // NC&E was signed off at 10:17 and the crew stayed until 14:05. R4: the
    // boundary is the START OF THE NEXT JOB, never job 1's completion. Nothing
    // in this signature can even see a completion timestamp — deliberately.
    const segments = splitClockDayAtJobStarts(CONRADE_CARD, day)!;
    expect(hoursFor(segments, NCE)).toBe(7.03);
  });

  it('presses out of order relative to completion change nothing — presses rule', () => {
    const segments = splitClockDayAtJobStarts(card, [
      { job_order_id: A, started_at: '2026-08-19T12:00:00Z' }, // completed last
      { job_order_id: B, started_at: '2026-08-19T18:00:00Z' }, // completed first
    ])!;
    expect(segments.map((s) => s.job_order_id)).toEqual([A, B]);
  });

  it('two presses in the same millisecond order stably by job id', () => {
    const segments = splitClockDayAtJobStarts(card, [
      { job_order_id: B, started_at: '2026-08-19T15:00:00Z' },
      { job_order_id: A, started_at: '2026-08-19T15:00:00Z' },
    ])!;
    expect(segments.map((s) => s.job_order_id)).toEqual([A, B]);
    // The first job still runs from clock-in; the second starts where it ends.
    expect(hoursFor(segments, A)).toBe(4);
    expect(hoursFor(segments, B)).toBe(6);
  });
});

describe('splitClockDayAtJobStarts — when it must refuse to answer', () => {
  const A = 'aaaaaaaa-0000-0000-0000-000000000000';
  const B = 'bbbbbbbb-0000-0000-0000-000000000000';
  const card = { clock_in_time: '2026-08-19T11:00:00Z', clock_out_time: '2026-08-19T21:00:00Z' };

  it('ONE job on the day is not a split — the card is already that job\'s', () => {
    expect(
      splitClockDayAtJobStarts(card, [{ job_order_id: A, started_at: '2026-08-19T12:00:00Z' }])
    ).toBeNull();
  });

  it('a job with NO press stops the whole day dividing — no invented hours', () => {
    // The crew never tapped on B. B cannot claim a boundary; it also cannot be
    // ORDERED against A, so handing A the leftover would be a guess, not a
    // measurement. The day is left exactly as attribution already had it.
    expect(
      splitClockDayAtJobStarts(card, [
        { job_order_id: A, started_at: '2026-08-19T12:00:00Z' },
        { job_order_id: B, started_at: null },
      ])
    ).toBeNull();
  });

  it('a person who never clocked in has no day to divide', () => {
    expect(
      splitClockDayAtJobStarts({ clock_in_time: null, clock_out_time: null }, day)
    ).toBeNull();
  });

  it('an unparseable press is treated as no press at all', () => {
    expect(
      splitClockDayAtJobStarts(card, [
        { job_order_id: A, started_at: '2026-08-19T12:00:00Z' },
        { job_order_id: B, started_at: 'not a timestamp' },
      ])
    ).toBeNull();
  });

  it('a clock-out at or before clock-in yields nothing', () => {
    expect(
      splitClockDayAtJobStarts(
        { clock_in_time: '2026-08-19T16:00:00Z', clock_out_time: '2026-08-19T15:00:00Z' },
        day
      )
    ).toBeNull();
  });
});

describe('splitClockDayAtJobStarts — presses outside the clocked day', () => {
  const A = 'aaaaaaaa-0000-0000-0000-000000000000';
  const B = 'bbbbbbbb-0000-0000-0000-000000000000';
  const card = { clock_in_time: '2026-08-19T11:00:00Z', clock_out_time: '2026-08-19T21:00:00Z' };

  it('a press BEFORE clock-in cannot start a job before the person was on the clock', () => {
    const segments = splitClockDayAtJobStarts(card, [
      { job_order_id: A, started_at: '2026-08-19T06:00:00Z' },
      { job_order_id: B, started_at: '2026-08-19T09:00:00Z' },
    ])!;
    // Both presses land before clock-in: A gets a zero-length stretch (they had
    // already left for B by the time they clocked in) and B gets the whole day.
    // Zero is an honest answer here — it is not "no record".
    expect(hoursFor(segments, A)).toBe(0);
    expect(hoursFor(segments, B)).toBe(10);
    expect(segments.reduce((s, x) => s + x.hours, 0)).toBe(10);
  });

  it('a press AFTER clock-out earns nothing off this card', () => {
    const segments = splitClockDayAtJobStarts(card, [
      { job_order_id: A, started_at: '2026-08-19T12:00:00Z' },
      { job_order_id: B, started_at: '2026-08-19T23:00:00Z' },
    ])!;
    expect(hoursFor(segments, A)).toBe(10); // clock-in → clock-out
    expect(hoursFor(segments, B)).toBe(0);
  });

  it('an OPEN card runs to now, capped by the 16h forgotten-clock-out guard', () => {
    const open = { clock_in_time: '2026-08-19T11:00:00Z', clock_out_time: null };
    const segments = splitClockDayAtJobStarts(
      open,
      [
        { job_order_id: A, started_at: '2026-08-19T12:00:00Z' },
        { job_order_id: B, started_at: '2026-08-19T15:00:00Z' },
      ],
      new Date('2026-08-19T17:00:00Z')
    )!;
    expect(hoursFor(segments, A)).toBe(4);
    expect(hoursFor(segments, B)).toBe(2);
  });

  it('a forgotten clock-out books 16 hours, not days', () => {
    const open = { clock_in_time: '2026-08-19T11:00:00Z', clock_out_time: null };
    const segments = splitClockDayAtJobStarts(
      open,
      [
        { job_order_id: A, started_at: '2026-08-19T12:00:00Z' },
        { job_order_id: B, started_at: '2026-08-19T15:00:00Z' },
      ],
      new Date('2026-08-25T00:00:00Z')
    )!;
    expect(segments.reduce((s, x) => s + x.hours, 0)).toBe(16);
  });
});

describe('jobStartOnDate — a boundary must fall on the day it divides', () => {
  const JOB = 'job-1';

  it('takes the day\'s own log route start', () => {
    expect(
      jobStartOnDate(
        D,
        [{ job_order_id: JOB, log_date: D, route_started_at: NCE_PRESS, work_started_at: null }],
        null,
        JOB
      )
    ).toBe(NCE_PRESS);
  });

  it('REJECTS a stale copy of an earlier day\'s press', () => {
    // 13 of the 53 production daily-log rows that carry `route_started_at` copy
    // an earlier day's. JOB-2026-277097's 8/12 closeout row carries 8/10 07:43,
    // and Dante was at another job entirely that Wednesday: believing it would
    // have handed him a 10.37-hour phantom in place of the 0.09 one.
    expect(
      jobStartOnDate(
        '2026-08-12',
        [
          {
            job_order_id: JOB,
            log_date: '2026-08-12',
            route_started_at: '2026-08-10T11:43:01.468Z',
            work_started_at: '2026-08-10T11:43:03.655Z',
          },
        ],
        null,
        JOB
      )
    ).toBeNull();
  });

  it('falls back to the JOB\'s own stamps when they land on the day', () => {
    // Real: JOB-2026-630612 on 8/18 had no daily log at all — the board placed
    // the crew and the job carries in_route_at. 8 production jobs populate
    // `in_route_at` and NOT `route_started_at`, so reading either alone loses
    // real presses.
    expect(
      jobStartOnDate(D, [], { route_started_at: null, in_route_at: NCE_PRESS }, JOB)
    ).toBe(NCE_PRESS);
  });

  it('ignores a job stamp from a different day (multi-day job, day 5)', () => {
    expect(
      jobStartOnDate(D, [], { route_started_at: '2026-08-05T14:28:30.428Z' }, JOB)
    ).toBeNull();
  });

  it('takes the EARLIEST surviving candidate — the press, not the work start', () => {
    expect(
      jobStartOnDate(
        D,
        [
          {
            job_order_id: JOB,
            log_date: D,
            route_started_at: NCE_PRESS,
            work_started_at: '2026-08-19T14:12:55.025Z',
          },
        ],
        { work_started_at: '2026-08-19T14:12:55.025Z' },
        JOB
      )
    ).toBe(NCE_PRESS);
  });

  it('uses work_started_at when the route tap was never recorded', () => {
    const ws = '2026-08-19T14:12:55.025Z';
    expect(jobStartOnDate(D, [], { work_started_at: ws }, JOB)).toBe(ws);
  });

  it('never reads another job\'s log row', () => {
    expect(
      jobStartOnDate(
        D,
        [{ job_order_id: 'someone-else', log_date: D, route_started_at: NCE_PRESS }],
        null,
        JOB
      )
    ).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EVERY SURFACE THAT PUTS STERLING'S AUG 19 ON A SCREEN MUST SAY 6.17.
 *
 * This is the regression the boundary itself created and two consumers shipped
 * without. `attributableTimecards` now returns cards TAGGED TO ANOTHER JOB
 * whenever the day divides — it has to, because Sterling's share exists nowhere
 * else. Any consumer that keeps reading those cards' own `net_hours` charges
 * Sterling the crew's WHOLE paid days:
 *
 *   printed work ticket      3.55 + 2.62 = 6.17   (was right)
 *   Daily Progress panel     0.04                 → would have become 19.15
 *   Completed Job Ticket     3.55 + 2.62 = 6.17 day rows
 *     …its flat Labor Hours table                 → 19.15 under the same header
 *
 * Three numbers, one day, one hand-written invoice. So all four are asserted
 * against ONE input here, and against the founder's own arithmetic.
 */
import { clockedJobHours, round2 } from './labor-cost';
import { buildTicketDays, grandTotalHours } from './work-ticket';
import {
  buildCompletedJobDays,
  laborRowHours,
  totalJobHours,
} from './completed-job-days';

const CONRADE = '81377aa2-4383-444f-a061-94036068c046';
const AXEL = '298b3194-20df-475e-8011-a3ad082b72ef';

/** The two cards exactly as production holds them — BOTH tagged NC&E. */
const CARDS = [
  {
    id: 'tc-conrade',
    user_id: CONRADE,
    date: D,
    clock_in_time: CONRADE_CARD.clock_in_time,
    clock_out_time: CONRADE_CARD.clock_out_time,
    net_hours: 10.09,
    total_hours: 10.09,
    regular_hours: 8,
    overtime_hours: 2.09,
    night_shift_premium_hours: 0,
    lunch_duration_minutes: 30,
    job_order_id: NCE,
  },
  {
    id: 'tc-axel',
    user_id: AXEL,
    date: D,
    clock_in_time: AXEL_CARD.clock_in_time,
    clock_out_time: AXEL_CARD.clock_out_time,
    net_hours: 9.06,
    total_hours: 9.06,
    regular_hours: 8,
    overtime_hours: 1.06,
    night_shift_premium_hours: 0,
    lunch_duration_minutes: 30,
    job_order_id: NCE,
  },
];

/** What `attributableTimecards` hands every consumer for Sterling. */
const sterlingSegments = () => {
  const out = new Map<string, { start: string; end: string; hours: number }>();
  for (const [cardId, card] of [
    ['tc-conrade', CONRADE_CARD],
    ['tc-axel', AXEL_CARD],
  ] as const) {
    const seg = splitClockDayAtJobStarts(card, day)!.find((s) => s.job_order_id === STERLING)!;
    out.set(cardId, { start: seg.start, end: seg.end, hours: seg.hours });
  }
  return out;
};

describe("Sterling's Aug 19 reads 6.17 on every surface, not 0.04 and not 19.15", () => {
  const segments = sterlingSegments();

  it('the segments themselves are 3.55 + 2.62', () => {
    expect(segments.get('tc-conrade')!.hours).toBe(3.55);
    expect(segments.get('tc-axel')!.hours).toBe(2.62);
  });

  it('PRINTED WORK TICKET — 6.17', () => {
    const days = buildTicketDays({
      range: { from: D, to: D },
      timecards: CARDS,
      logs: [],
      workItems: [],
      roles: new Map([[CONRADE, 'lead' as const], [AXEL, 'helper' as const]]),
      names: new Map([[CONRADE, 'Conrade Richardson'], [AXEL, 'Axel valverde']]),
      boundarySegments: segments,
    });
    expect(grandTotalHours(days)).toBe(6.17);
    // and every row says so, rather than the sheet quietly netting out
    expect(days[0].people.map((p) => p.hours)).toEqual([3.55, 2.62]);
    expect(days[0].people.every((p) => p.hours_boundary)).toBe(true);
  });

  it('DAILY PROGRESS PANEL (progress-by-day) — 6.17, not the two whole days', () => {
    expect(round2(clockedJobHours(CARDS, segments))).toBe(6.17);
    // The defect, pinned: the same cards without the boundary.
    expect(round2(clockedJobHours(CARDS))).toBe(19.15);
  });

  it('COMPLETED JOB TICKET day rows — 6.17', () => {
    const workDays = buildCompletedJobDays({
      logs: [],
      workItems: [],
      timecards: CARDS,
      helperLogs: [],
      names: new Map([[CONRADE, 'Conrade Richardson'], [AXEL, 'Axel valverde']]),
      boundarySegments: segments,
      job: {
        // Sterling was signed off two minutes after work started; the window
        // alone is worth 0.04h. The boundary supersedes it.
        work_started_at: '2026-08-19T20:10:53.879Z',
        route_started_at: STERLING_PRESS,
        work_completed_at: '2026-08-19T20:13:00.955Z',
        status: 'completed',
      },
    });
    expect(totalJobHours(workDays)).toBe(6.17);
  });

  it('COMPLETED JOB TICKET flat Labor Hours table — 6.17 under the same header', () => {
    const rows = CARDS.map((t) => laborRowHours(t, segments.get(t.id)));
    expect(round2(rows.reduce((s, r) => s + r.total, 0))).toBe(6.17);
    expect(rows.every((r) => r.divided)).toBe(true);
    // The defect, pinned: without the segment the table charges both paid days.
    const undivided = CARDS.map((t) => laborRowHours(t));
    expect(round2(undivided.reduce((s, r) => s + r.total, 0))).toBe(19.15);
  });

  it("a card that is NOT on this job's divided day keeps its own paid day", () => {
    // Nothing here changes an ordinary, undivided card on any surface.
    expect(laborRowHours(CARDS[0]).total).toBe(10.09);
    expect(laborRowHours(CARDS[0]).divided).toBe(false);
  });
});
