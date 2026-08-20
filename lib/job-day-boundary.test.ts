import { jobCloseOnDate, jobStartOnDate, splitClockDayAtJobStarts } from './job-day-boundary';
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

// ── KEON MCKNIGHT, TUE AUG 11 2026 — THE CLOSE FALLBACK, VERBATIM ───────────
// Keon ran Industrial Safety Coatings in the morning and Leifeng in the
// afternoon, with Axel helping on both. Leifeng was day 2, so its only press is
// an Aug 10 copy that guard (a) rejects; before rule 6 the whole day abstained
// and Leifeng took all of it (9.12 h off its log) while ISC printed 0.06 h — the
// length of its own log session, the same phantom class as Dante's 0.09.
const ISC = '7dc77ea1-c63e-41a7-be58-5f8697ed0811';
const LEIFENG = 'd38d68f9-d938-4d98-89f1-9582e39be325';
const AUG11 = '2026-08-11';

const ISC_PRESS = '2026-08-11T11:31:50.078Z'; // 07:31 EDT
const ISC_CLOSE = '2026-08-11T15:04:36.460Z'; // 11:04 EDT
const LEIFENG_STALE_PRESS = '2026-08-10T14:07:03.384Z'; // the PREVIOUS day
const LEIFENG_CLOSE = '2026-08-11T20:07:12.812Z'; // 16:07 EDT

/** Keon's card and Axel's, exactly as production holds them. */
const KEON_CARD = {
  clock_in_time: '2026-08-11T11:00:00.000Z', // 07:00 EDT
  clock_out_time: '2026-08-11T21:32:09.645Z', // 17:32 EDT
};
const AXEL_AUG11_CARD = {
  clock_in_time: '2026-08-11T11:10:18.923Z', // 07:10 EDT
  clock_out_time: '2026-08-11T21:24:00.000Z', // 17:24 EDT
};

/** The board: ISC is Keon's #1 that day, Leifeng his #3. */
const aug11 = [
  { job_order_id: ISC, started_at: ISC_PRESS, completed_at: ISC_CLOSE, day_sequence: 1 },
  { job_order_id: LEIFENG, started_at: null, completed_at: LEIFENG_CLOSE, day_sequence: 3 },
];

describe("Keon's Aug 11 2026 — a day divided at a CLOSE, not a press", () => {
  it("Leifeng's press really is unusable — the day cannot divide on presses", () => {
    // The log row carries Aug 10's stamp and so does the job. Guard (a) rejects
    // both, which is what made this day abstain in the first place. The row's
    // same-day CLOSE is sitting right there and the start rule does not see it:
    // `jobStartOnDate` reads start columns only.
    expect(
      jobStartOnDate(
        AUG11,
        [{ job_order_id: LEIFENG, log_date: AUG11, route_started_at: LEIFENG_STALE_PRESS }],
        { in_route_at: LEIFENG_STALE_PRESS, route_started_at: null },
        LEIFENG
      )
    ).toBeNull();
    expect(
      jobCloseOnDate(
        AUG11,
        [{ job_order_id: LEIFENG, log_date: AUG11, day_completed_at: LEIFENG_CLOSE }],
        null,
        LEIFENG
      )
    ).toBe(LEIFENG_CLOSE);
  });

  it("ISC's close IS on the day, and is what draws the line", () => {
    expect(
      jobCloseOnDate(
        AUG11,
        [{ job_order_id: ISC, log_date: AUG11, day_completed_at: ISC_CLOSE }],
        { work_completed_at: ISC_CLOSE },
        ISC
      )
    ).toBe(ISC_CLOSE);
  });

  it("Keon's day divides 4.07 / 6.45 at ISC's close", () => {
    const segments = splitClockDayAtJobStarts(KEON_CARD, aug11);
    expect(segments).not.toBeNull();
    expect(hoursFor(segments, ISC)).toBe(4.07);
    expect(hoursFor(segments, LEIFENG)).toBe(6.45);
  });

  it('Axel divides IDENTICALLY, from his own card — a two-man day splits both men', () => {
    // The regression that would matter most on an invoice: one man divided and
    // the other billed whole would put 9.73 helper-hours on Leifeng alone.
    const segments = splitClockDayAtJobStarts(AXEL_AUG11_CARD, aug11);
    expect(segments).not.toBeNull();
    expect(hoursFor(segments, ISC)).toBe(3.9);
    expect(hoursFor(segments, LEIFENG)).toBe(6.32);
  });

  it('the 0.06 and 9.12 log figures are nowhere in the answer', () => {
    for (const card of [KEON_CARD, AXEL_AUG11_CARD]) {
      const segments = splitClockDayAtJobStarts(card, aug11)!;
      for (const s of segments) expect(s.hours).toBeGreaterThan(1);
      expect(segments.map((s) => s.hours)).not.toContain(0.06);
      expect(segments.map((s) => s.hours)).not.toContain(9.12);
    }
  });

  it('ISC runs from CLOCK-IN to its close; Leifeng from that close to CLOCK-OUT', () => {
    const segments = splitClockDayAtJobStarts(KEON_CARD, aug11)!;
    const isc = segments.find((s) => s.job_order_id === ISC)!;
    const lei = segments.find((s) => s.job_order_id === LEIFENG)!;
    expect(isc.start).toBe(new Date(KEON_CARD.clock_in_time).toISOString());
    expect(isc.end).toBe(new Date(ISC_CLOSE).toISOString());
    expect(lei.start).toBe(new Date(ISC_CLOSE).toISOString());
    // Rule 4 is untouched: the LAST job runs to clock-out, NOT to its own close.
    expect(lei.end).toBe(new Date(KEON_CARD.clock_out_time).toISOString());
    expect(lei.end).not.toBe(new Date(LEIFENG_CLOSE).toISOString());
  });

  it('the drive to job 2 bills to job 2 — the same reading as under a press', () => {
    // Under rule 3 the segment opens at the press, BEFORE the crew has driven
    // anywhere. Under rule 6 it opens at the previous job's close, which is
    // earlier still: they close out, pack up, THEN drive. Either way every
    // minute of the drive falls inside the second job's stretch.
    const segments = splitClockDayAtJobStarts(KEON_CARD, aug11)!;
    const lei = segments.find((s) => s.job_order_id === LEIFENG)!;
    const drivePress = new Date('2026-08-11T15:20:00Z').getTime(); // any later departure
    expect(new Date(lei.start).getTime()).toBeLessThanOrEqual(drivePress);
    expect(new Date(lei.end).getTime()).toBeGreaterThan(drivePress);
  });

  it('every segment of the day is marked board-ordered AND close-divided', () => {
    const segments = splitClockDayAtJobStarts(KEON_CARD, aug11)!;
    expect(segments.every((s) => s.divided_by_board)).toBe(true);
    expect(segments.every((s) => s.divided_by_close)).toBe(true);
    // …and a fully-pressed day is NEITHER, so the sheet can tell them apart.
    const pressed = splitClockDayAtJobStarts(CONRADE_CARD, day)!;
    expect(pressed.some((s) => s.divided_by_board)).toBe(false);
    expect(pressed.some((s) => s.divided_by_close)).toBe(false);
  });

  it('the shares still never sum past the clocked span', () => {
    for (const card of [KEON_CARD, AXEL_AUG11_CARD]) {
      const segments = splitClockDayAtJobStarts(card, aug11)!;
      const sum = segments.reduce((s, x) => s + x.hours, 0);
      const gross =
        (new Date(card.clock_out_time).getTime() - new Date(card.clock_in_time).getTime()) / 3600000;
      expect(sum).toBeLessThanOrEqual(gross);
    }
  });
});

describe('rule 7 — a close is evidence of a boundary, NEVER of an ordering', () => {
  const A = 'aaaaaaaa-0000-0000-0000-000000000000';
  const B = 'bbbbbbbb-0000-0000-0000-000000000000';
  const C = 'cccccccc-0000-0000-0000-000000000000';
  const card = { clock_in_time: '2026-08-05T11:00:00Z', clock_out_time: '2026-08-05T21:00:00Z' };

  it('a job on no board row and no press cannot be ordered — abstain', () => {
    // THE SHAPE, from Conrade's Aug 5 stamps — but NOT that day's outcome, and
    // the header used to claim otherwise. In production Conrade's Aug 5
    // RESOLVES (QA Harper 3.22 / Bwc 7.77) because Harper General never enters
    // the day's job set at all: the board named the other two and only a log
    // named Harper General, so the ladder in lib/timecard-job-rules.ts drops it
    // as a conflict before this function is ever called.
    //
    // The stamps are kept because they are the clearest illustration of why
    // ORDER MAY NEVER COME FROM A CLOSE. QA Harper pressed 11:44 and closed
    // 14:26; Harper General carried no same-day press and closed 14:27, seventy
    // seconds later; Bwc pressed 14:28. Sorting "press, else close" would slot
    // Harper General between the two and hand it 70 seconds, giving QA Harper a
    // morning the two plainly shared. With no board row it cannot be ordered,
    // and the day abstains.
    expect(
      splitClockDayAtJobStarts(card, [
        { job_order_id: A, started_at: '2026-08-05T11:44:57Z', completed_at: '2026-08-05T14:26:49Z', day_sequence: 1 },
        { job_order_id: B, started_at: null, completed_at: '2026-08-05T14:27:59Z', day_sequence: null },
        { job_order_id: C, started_at: '2026-08-05T14:28:30Z', completed_at: null, day_sequence: 2 },
      ])
    ).toBeNull();
  });

  it('the board orders the day when a press is missing', () => {
    const segments = splitClockDayAtJobStarts(card, [
      // Handed in "wrong" order, and B's close is LATER than A's press — the
      // ordering must come from the sequences, not from comparing the two.
      { job_order_id: B, started_at: null, completed_at: '2026-08-05T20:00:00Z', day_sequence: 3 },
      { job_order_id: A, started_at: '2026-08-05T12:00:00Z', completed_at: '2026-08-05T15:00:00Z', day_sequence: 1 },
    ])!;
    expect(segments.map((s) => s.job_order_id)).toEqual([A, B]);
    expect(hoursFor(segments, A)).toBe(4); // clock-in 11:00 → A's close 15:00
    expect(hoursFor(segments, B)).toBe(6); // 15:00 → clock-out 21:00
  });

  it('a fully-pressed day ignores the board, even when the board disagrees', () => {
    // Rule 5 is untouched: nothing about rule 6 or 7 may move a day that
    // already resolves. The sequences here say B first; the presses say A.
    const segments = splitClockDayAtJobStarts(card, [
      { job_order_id: A, started_at: '2026-08-05T12:00:00Z', completed_at: '2026-08-05T13:00:00Z', day_sequence: 9 },
      { job_order_id: B, started_at: '2026-08-05T18:00:00Z', completed_at: null, day_sequence: 1 },
    ])!;
    expect(segments.map((s) => s.job_order_id)).toEqual([A, B]);
    // A runs PAST its own 13:00 close to B's press — rule 5, unchanged.
    expect(hoursFor(segments, A)).toBe(7);
    expect(segments.some((s) => s.divided_by_close)).toBe(false);
  });

  it('two jobs the board calls #1 are not an order — abstain', () => {
    expect(
      splitClockDayAtJobStarts(card, [
        { job_order_id: A, started_at: '2026-08-05T12:00:00Z', completed_at: '2026-08-05T15:00:00Z', day_sequence: 1 },
        { job_order_id: B, started_at: null, completed_at: '2026-08-05T20:00:00Z', day_sequence: 1 },
      ])
    ).toBeNull();
  });

  it('EVERY segment of a board-ordered day is marked, even the press-drawn one', () => {
    // The shape that used to print `¶`. A has no press at all; B pressed at
    // 14:00. The LINE is B's real press, so no close is involved and
    // `divided_by_close` is correctly absent — but A's three hours rest on the
    // board saying A came first, and the `¶` footnote claims In/Out come from
    // clock-in or the In Route press. On A that sentence is not supported.
    const segments = splitClockDayAtJobStarts(card, [
      { job_order_id: A, started_at: null, completed_at: '2026-08-05T13:30:00Z', day_sequence: 1 },
      { job_order_id: B, started_at: '2026-08-05T14:00:00Z', completed_at: null, day_sequence: 2 },
    ])!;
    expect(segments.map((s) => s.job_order_id)).toEqual([A, B]);
    expect(hoursFor(segments, A)).toBe(3); // clock-in 11:00 → B's press 14:00
    expect(hoursFor(segments, B)).toBe(7);
    expect(segments.every((s) => s.divided_by_board)).toBe(true);
    expect(segments.some((s) => s.divided_by_close)).toBe(false);
  });
});

describe('guard (c) — the board is an ORDER, not a FACT', () => {
  const A = 'aaaaaaaa-0000-0000-0000-000000000000';
  const B = 'bbbbbbbb-0000-0000-0000-000000000000';

  // AXEL VALVERDE, WED AUG 12 2026, with the office's skeleton board row filled
  // in. Estes pressed 12:35:13 and closed 14:35; Leifeng carries nothing on that
  // date but an Aug 10 press copy. Before guard (c) this printed 3.65 h against
  // a job the founder says the man never went to — six-and-a-half on the longer
  // card shape — on the strength of one line of a schedule.
  const AXEL_AUG12 = {
    clock_in_time: '2026-08-12T11:05:09.858Z',
    clock_out_time: '2026-08-12T18:14:25.737Z',
  };

  it("Axel's Aug 12 abstains BY LAW, not by a half-filled board row", () => {
    expect(
      splitClockDayAtJobStarts(AXEL_AUG12, [
        {
          job_order_id: A,
          started_at: '2026-08-12T12:35:13.002Z',
          completed_at: '2026-08-12T14:35:00.000Z',
          day_sequence: 1,
        },
        // No press, no close. A board row and nothing else.
        { job_order_id: B, started_at: null, completed_at: null, day_sequence: 2 },
      ])
    ).toBeNull();
  });

  it('the FIRST job needs a fact too — it is never asked for a boundary', () => {
    // The mirror image, and the one a guard written inside rule 6 would miss:
    // an unpressed job in slot 1 is handed clock-in → the next job's press
    // without any boundary of its own ever being computed.
    expect(
      splitClockDayAtJobStarts(AXEL_AUG12, [
        { job_order_id: A, started_at: null, completed_at: null, day_sequence: 1 },
        { job_order_id: B, started_at: '2026-08-12T14:00:00.000Z', completed_at: null, day_sequence: 2 },
      ])
    ).toBeNull();
  });

  it('a same-day CLOSE is a fact — this is what saves Leifeng on Aug 11', () => {
    // Keon's and Axel's Aug 11 resolve precisely because Leifeng's own log
    // carries `day_completed_at` on that date. Take it away and the same day
    // abstains; nothing else about it differs.
    const withClose = splitClockDayAtJobStarts(KEON_CARD, aug11);
    expect(withClose).not.toBeNull();
    expect(
      splitClockDayAtJobStarts(KEON_CARD, [
        { job_order_id: ISC, started_at: ISC_PRESS, completed_at: ISC_CLOSE, day_sequence: 1 },
        { job_order_id: LEIFENG, started_at: null, completed_at: null, day_sequence: 3 },
      ])
    ).toBeNull();
  });

  it('a fully-pressed day cannot be touched by it — the press IS the fact', () => {
    // The guard must be inert wherever the day already resolves. Conrade's and
    // Axel's Aug 19 carry no closes at all in this fixture and still divide.
    expect(splitClockDayAtJobStarts(CONRADE_CARD, day)).not.toBeNull();
    expect(splitClockDayAtJobStarts(AXEL_CARD, day)).not.toBeNull();
    expect(day.every((j) => (j as { completed_at?: string }).completed_at == null)).toBe(true);
  });
});

describe('rule 6 — when the close fallback must still refuse to answer', () => {
  const A = 'aaaaaaaa-0000-0000-0000-000000000000';
  const B = 'bbbbbbbb-0000-0000-0000-000000000000';
  const card = { clock_in_time: '2026-08-06T11:00:00Z', clock_out_time: '2026-08-06T21:00:00Z' };

  it("Keon's Aug 6 abstains — no press and no close on either job", () => {
    // Two jobs, both day 2, neither pressed and neither closed that day. There
    // is genuinely nothing to divide on, and an abstention the office can see
    // beats a fabricated division it cannot.
    expect(
      splitClockDayAtJobStarts(card, [
        { job_order_id: A, started_at: null, completed_at: null, day_sequence: 1 },
        { job_order_id: B, started_at: null, completed_at: null, day_sequence: 2 },
      ])
    ).toBeNull();
  });

  it("Axel and Conrade's Aug 7 abstains — a close with no same-day start behind it", () => {
    // J. Davis carries a close at 11:25:47 and NO same-day press: seventeen
    // minutes after Axel clocked in, somebody filed that job's paperwork. That
    // is the closeout-from-another-truck pattern, not a morning's work, and
    // believing it would hand J. Davis 0.28 h and Bwc the other 8.79.
    const jdavis = 'aaaaaaaa-0000-0000-0000-00000008070a';
    const bwc = 'bbbbbbbb-0000-0000-0000-00000008070b';
    const axel = {
      clock_in_time: '2026-08-07T11:08:51.349Z',
      clock_out_time: '2026-08-07T20:13:27.291Z',
    };
    expect(
      splitClockDayAtJobStarts(axel, [
        { job_order_id: jdavis, started_at: null, completed_at: '2026-08-07T11:25:47.945Z', day_sequence: 1 },
        { job_order_id: bwc, started_at: null, completed_at: null, day_sequence: 2 },
      ])
    ).toBeNull();

    // …and giving J. Davis a same-day press is STILL not enough, because Bwc
    // has no same-day fact of its own: guard (c) refuses to bill a job whose
    // only claim on the day is a line on the board.
    expect(
      splitClockDayAtJobStarts(axel, [
        {
          job_order_id: jdavis,
          started_at: '2026-08-07T11:15:00.000Z',
          completed_at: '2026-08-07T11:25:47.945Z',
          day_sequence: 1,
        },
        { job_order_id: bwc, started_at: null, completed_at: null, day_sequence: 2 },
      ])
    ).toBeNull();

    // It divides only when BOTH conditions hold, which is the whole difference
    // between this day and Keon's Aug 11: the first job demonstrably ran (its
    // own press) AND the second carries a same-day fact of its own (its close).
    const complete = splitClockDayAtJobStarts(axel, [
      {
        job_order_id: jdavis,
        started_at: '2026-08-07T11:15:00.000Z',
        completed_at: '2026-08-07T11:25:47.945Z',
        day_sequence: 1,
      },
      { job_order_id: bwc, started_at: null, completed_at: '2026-08-07T19:30:00.000Z', day_sequence: 2 },
    ]);
    expect(complete).not.toBeNull();
    expect(complete!.every((s) => s.divided_by_close)).toBe(true);
    expect(complete!.every((s) => s.divided_by_board)).toBe(true);
  });

  it('the job BEFORE never closed, so nothing marks where the day moved on', () => {
    expect(
      splitClockDayAtJobStarts(card, [
        { job_order_id: A, started_at: '2026-08-06T12:00:00Z', completed_at: null, day_sequence: 1 },
        { job_order_id: B, started_at: null, completed_at: '2026-08-06T19:00:00Z', day_sequence: 2 },
      ])
    ).toBeNull();
  });

  it('a job may not BEGIN after its own close', () => {
    // B closed at 10:00 — before A did. B therefore ran inside A's window and
    // handing it A's 16:00 close would print an impossibility.
    expect(
      splitClockDayAtJobStarts(card, [
        { job_order_id: A, started_at: '2026-08-06T12:00:00Z', completed_at: '2026-08-06T16:00:00Z', day_sequence: 1 },
        { job_order_id: B, started_at: null, completed_at: '2026-08-06T13:00:00Z', day_sequence: 2 },
      ])
    ).toBeNull();
  });

  it('a close-derived boundary may not fall before the preceding press', () => {
    expect(
      splitClockDayAtJobStarts(card, [
        { job_order_id: A, started_at: '2026-08-06T14:00:00Z', completed_at: '2026-08-06T13:00:00Z', day_sequence: 1 },
        { job_order_id: B, started_at: null, completed_at: '2026-08-06T20:00:00Z', day_sequence: 2 },
      ])
    ).toBeNull();
  });

  it('boundaries may not run backwards across three jobs', () => {
    const C = 'cccccccc-0000-0000-0000-000000000000';
    expect(
      splitClockDayAtJobStarts(card, [
        { job_order_id: A, started_at: '2026-08-06T12:00:00Z', completed_at: '2026-08-06T18:00:00Z', day_sequence: 1 },
        { job_order_id: B, started_at: null, completed_at: '2026-08-06T20:00:00Z', day_sequence: 2 },
        // C's own press is EARLIER than the close that opened B.
        { job_order_id: C, started_at: '2026-08-06T13:00:00Z', completed_at: null, day_sequence: 3 },
      ])
    ).toBeNull();
  });
});

describe('jobCloseOnDate — the mirror of jobStartOnDate, and its asymmetry', () => {
  const JOB = 'job-1';

  it('REJECTS a close that belongs to another day', () => {
    // The whole-job `work_completed_at` of a multi-day job is a different day's
    // fact on every day but the last, and is discarded exactly as a stale press.
    expect(jobCloseOnDate(AUG11, [], { work_completed_at: '2026-08-12T18:00:00Z' }, JOB)).toBeNull();
  });

  it('takes the LATEST surviving close, where a start takes the earliest', () => {
    // A job's window runs to the OUTERMOST evidence it carries. Taking the
    // earlier close would hand the next job minutes this one can prove it worked.
    const early = '2026-08-11T15:04:36.460Z';
    const late = '2026-08-11T16:30:00.000Z';
    expect(
      jobCloseOnDate(
        AUG11,
        [{ job_order_id: JOB, log_date: AUG11, day_completed_at: early }],
        { work_completed_at: late },
        JOB
      )
    ).toBe(late);
  });

  it("never reads another job's log row", () => {
    expect(
      jobCloseOnDate(
        AUG11,
        [{ job_order_id: 'someone-else', log_date: AUG11, day_completed_at: ISC_CLOSE }],
        null,
        JOB
      )
    ).toBeNull();
  });

  it('is null when nothing closed that day', () => {
    expect(jobCloseOnDate(AUG11, [], {}, JOB)).toBeNull();
    expect(jobCloseOnDate(AUG11, null, null, JOB)).toBeNull();
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
