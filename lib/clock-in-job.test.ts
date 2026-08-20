/**
 * The Aug 20 clock-in defect, and the rule that replaced it.
 *
 * Every case below is either the production incident itself or a shape the
 * incident proved we cannot reason about by inspection.
 */

import { pickClockInJob, compareClockInCandidates, type ClockInJobCandidate } from './clock-in-job';
import {
  isClosedJobStatus,
  isClockInEligibleStatus,
  postgrestNotInList,
  UNCLOCKABLE_INFERRED_JOB_STATUSES,
  CLOSED_JOB_STATUSES,
} from './job-status';

const INFERRED = { refuse: UNCLOCKABLE_INFERRED_JOB_STATUSES };

const STERLING = '11111111-1111-1111-1111-111111111111';
const CLEMTENN = '22222222-2222-2222-2222-222222222222';
const BWC = '33333333-3333-3333-3333-333333333333';

describe('a completed job is never selected', () => {
  it('reproduces Aug 20: the stale Sterling row loses to the real ClemTenn job', () => {
    // Both rows sat on 2026-08-20. Sterling had been completed at 16:13 the
    // previous afternoon; nothing prunes the ledger, so it was still there.
    const result = pickClockInJob([
      { job_order_id: STERLING, status: 'completed', day_sequence: 1 },
      { job_order_id: CLEMTENN, status: 'assigned', day_sequence: 2 },
    ]);
    expect(result.jobOrderId).toBe(CLEMTENN);
    expect(result.closed.map((c) => c.job_order_id)).toEqual([STERLING]);
  });

  it('picks ClemTenn even when the stale row sorts first on EVERY tiebreak', () => {
    // The old code could take either row. This asserts the status filter runs
    // BEFORE the sort, so no ordering field can resurrect a closed job.
    const result = pickClockInJob([
      { job_order_id: STERLING, status: 'completed', day_sequence: 1, started_at: '2026-08-20T11:00:00Z', scheduled_date: '2026-08-20' },
      { job_order_id: CLEMTENN, status: 'in_progress', day_sequence: 9, started_at: null, scheduled_date: '2026-08-01' },
    ]);
    expect(result.jobOrderId).toBe(CLEMTENN);
  });

  it('rejects every closed status, whichever order the rows arrive in', () => {
    for (const status of CLOSED_JOB_STATUSES) {
      const forwards = pickClockInJob([
        { job_order_id: STERLING, status, day_sequence: 1 },
        { job_order_id: CLEMTENN, status: 'assigned', day_sequence: 2 },
      ]);
      const backwards = pickClockInJob([
        { job_order_id: CLEMTENN, status: 'assigned', day_sequence: 2 },
        { job_order_id: STERLING, status, day_sequence: 1 },
      ]);
      expect(forwards.jobOrderId).toBe(CLEMTENN);
      expect(backwards.jobOrderId).toBe(CLEMTENN);
    }
  });

  it('a lone completed job resolves to null rather than to itself', () => {
    const result = pickClockInJob([{ job_order_id: STERLING, status: 'completed', day_sequence: 1 }]);
    expect(result.jobOrderId).toBeNull();
    expect(result.chosen).toBeNull();
    expect(result.closed).toHaveLength(1);
  });

  it('on_hold is NOT closed — the Aug 20 ledger placed Conrade on a held job', () => {
    // JOB-2026-974669 (ClemTenn) had been on_hold since Aug 14, never released,
    // and the office put him on it for Aug 20. It was his real job. The ledger
    // path must return it, not null.
    expect(pickClockInJob([{ job_order_id: CLEMTENN, status: 'on_hold', day_sequence: 2 }]).jobOrderId)
      .toBe(CLEMTENN);
    expect(isClosedJobStatus('on_hold')).toBe(false);
  });

  it('the UNDATED fallbacks still refuse on_hold, pending_approval and rejected', () => {
    for (const status of ['on_hold', 'pending_approval', 'rejected']) {
      expect(pickClockInJob([{ job_order_id: BWC, status }], INFERRED).jobOrderId).toBeNull();
    }
    // …and they are reported as ineligible, NOT as closed — only a closed job
    // is evidence of a stale ledger row, which is what the warning means.
    const held = pickClockInJob([{ job_order_id: BWC, status: 'on_hold' }], INFERRED);
    expect(held.closed).toHaveLength(0);
    expect(held.ineligible).toHaveLength(1);
  });

  it('a closed job is refused on BOTH paths, dated or inferred', () => {
    for (const status of CLOSED_JOB_STATUSES) {
      expect(pickClockInJob([{ job_order_id: STERLING, status }]).jobOrderId).toBeNull();
      expect(pickClockInJob([{ job_order_id: STERLING, status }], INFERRED).jobOrderId).toBeNull();
    }
  });

  it('pending_completion stays selectable — a job sent back is worked again', () => {
    const result = pickClockInJob([{ job_order_id: BWC, status: 'pending_completion', day_sequence: 1 }]);
    expect(result.jobOrderId).toBe(BWC);
  });
});

describe('two open jobs resolve deterministically', () => {
  const twoOpen: ClockInJobCandidate[] = [
    { job_order_id: CLEMTENN, status: 'assigned', day_sequence: 2 },
    { job_order_id: STERLING, status: 'assigned', day_sequence: 1 },
  ];

  it("takes the day's FIRST job — the founder's model, not an arbitrary row", () => {
    expect(pickClockInJob(twoOpen).jobOrderId).toBe(STERLING);
    expect(pickClockInJob([...twoOpen].reverse()).jobOrderId).toBe(STERLING);
    expect(pickClockInJob(twoOpen).contested).toBe(true);
  });

  it('is stable across every input permutation of three open jobs', () => {
    const jobs: ClockInJobCandidate[] = [
      { job_order_id: STERLING, status: 'assigned', day_sequence: 3 },
      { job_order_id: CLEMTENN, status: 'assigned', day_sequence: 1 },
      { job_order_id: BWC, status: 'assigned', day_sequence: 2 },
    ];
    const permutations = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ];
    for (const p of permutations) {
      expect(pickClockInJob(p.map((i) => jobs[i])).jobOrderId).toBe(CLEMTENN);
    }
  });

  it('moves the day on once job one closes — the In Route model, mid-day', () => {
    // Clocking back in after lunch, with job #1 finished at 11:40.
    const result = pickClockInJob([
      { job_order_id: STERLING, status: 'completed', day_sequence: 1 },
      { job_order_id: CLEMTENN, status: 'in_progress', day_sequence: 2 },
      { job_order_id: BWC, status: 'assigned', day_sequence: 3 },
    ]);
    expect(result.jobOrderId).toBe(CLEMTENN);
  });

  it('falls to the earliest press when the office sequenced neither job', () => {
    // The job-level and crew fallbacks carry no day_sequence at all.
    const result = pickClockInJob([
      { job_order_id: STERLING, status: 'assigned', started_at: '2026-08-20T14:05:00Z' },
      { job_order_id: CLEMTENN, status: 'assigned', started_at: '2026-08-20T11:03:00Z' },
    ]);
    expect(result.jobOrderId).toBe(CLEMTENN);
  });

  it('an unpressed job sorts after a pressed one, never before', () => {
    const pressedFirst = pickClockInJob([
      { job_order_id: STERLING, status: 'assigned', started_at: null },
      { job_order_id: CLEMTENN, status: 'assigned', started_at: '2026-08-20T11:03:00Z' },
    ]);
    expect(pressedFirst.jobOrderId).toBe(CLEMTENN);
  });

  it('a sequenced job outranks an unsequenced one even if the latter was pressed', () => {
    // The board's own ordering is the authority; a press only breaks ties
    // between candidates the board did not sequence.
    const result = pickClockInJob([
      { job_order_id: STERLING, status: 'assigned', started_at: '2026-08-20T06:00:00Z' },
      { job_order_id: CLEMTENN, status: 'assigned', day_sequence: 1, started_at: null },
    ]);
    expect(result.jobOrderId).toBe(CLEMTENN);
  });

  it("prefers today's job over one carried in from last week", () => {
    const result = pickClockInJob([
      { job_order_id: STERLING, status: 'in_progress', scheduled_date: '2026-08-13' },
      { job_order_id: CLEMTENN, status: 'assigned', scheduled_date: '2026-08-20' },
    ]);
    expect(result.jobOrderId).toBe(CLEMTENN);
  });

  it('breaks a total tie on job id rather than on arrival order', () => {
    const a: ClockInJobCandidate = { job_order_id: STERLING, status: 'assigned', day_sequence: 1, scheduled_date: '2026-08-20' };
    const b: ClockInJobCandidate = { job_order_id: CLEMTENN, status: 'assigned', day_sequence: 1, scheduled_date: '2026-08-20' };
    expect(pickClockInJob([a, b]).jobOrderId).toBe(STERLING);
    expect(pickClockInJob([b, a]).jobOrderId).toBe(STERLING);
    expect(compareClockInCandidates(a, b)).toBeLessThan(0);
    expect(compareClockInCandidates(b, a)).toBeGreaterThan(0);
  });

  it('a single open job is not reported as contested', () => {
    expect(pickClockInJob([{ job_order_id: BWC, status: 'assigned' }]).contested).toBe(false);
  });
});

describe('nothing resolves to null rather than to a guess', () => {
  it('returns null for no candidates at all', () => {
    expect(pickClockInJob([]).jobOrderId).toBeNull();
    expect(pickClockInJob(null).jobOrderId).toBeNull();
    expect(pickClockInJob(undefined).jobOrderId).toBeNull();
  });

  it('returns null when every candidate is closed or ineligible', () => {
    const result = pickClockInJob([
      { job_order_id: STERLING, status: 'completed', day_sequence: 1 },
      { job_order_id: CLEMTENN, status: 'cancelled', day_sequence: 2 },
      { job_order_id: BWC, status: 'on_hold', day_sequence: 3 },
    ], INFERRED);
    expect(result.jobOrderId).toBeNull();
    expect(result.chosen).toBeNull();
    expect(result.closed).toHaveLength(2);
    expect(result.ineligible).toHaveLength(1);
  });

  it('drops rows with no job id instead of inventing one', () => {
    const result = pickClockInJob([{ job_order_id: '', status: 'assigned' } as ClockInJobCandidate]);
    expect(result.jobOrderId).toBeNull();
  });

  it('an unknown status is treated as live, not silently dropped', () => {
    // The alternative fails CLOSED: adding a status to the DB and not to this
    // file would quietly stop stamping real work.
    const result = pickClockInJob([{ job_order_id: BWC, status: 'some_future_status' }]);
    expect(result.jobOrderId).toBe(BWC);
  });

  it('a null status is treated as live', () => {
    expect(pickClockInJob([{ job_order_id: BWC, status: null }]).jobOrderId).toBe(BWC);
    expect(pickClockInJob([{ job_order_id: BWC }]).jobOrderId).toBe(BWC);
  });
});

describe('duplicate rows for one job cannot erase what an earlier row knew', () => {
  it('keeps the lowest day_sequence when the ledger holds two rows for a job', () => {
    const result = pickClockInJob([
      { job_order_id: STERLING, status: 'assigned', day_sequence: 5 },
      { job_order_id: STERLING, status: 'assigned', day_sequence: 1 },
      { job_order_id: CLEMTENN, status: 'assigned', day_sequence: 2 },
    ]);
    expect(result.jobOrderId).toBe(STERLING);
    expect(result.contested).toBe(true); // exactly two distinct jobs, not three
  });

  it('keeps the earliest press and does not lose a status seen on one copy', () => {
    const result = pickClockInJob([
      { job_order_id: STERLING, status: null, started_at: '2026-08-20T14:00:00Z' },
      { job_order_id: STERLING, status: 'completed', started_at: '2026-08-20T07:00:00Z' },
    ]);
    expect(result.jobOrderId).toBeNull();
    expect(result.closed).toHaveLength(1);
    expect(result.closed[0].started_at).toBe('2026-08-20T07:00:00Z');
  });
});

describe('the shared status vocabulary', () => {
  it('names completed, cancelled and archived as closed', () => {
    expect(isClosedJobStatus('completed')).toBe(true);
    expect(isClosedJobStatus('cancelled')).toBe(true);
    expect(isClosedJobStatus('archived')).toBe(true);
    expect(isClosedJobStatus('in_progress')).toBe(false);
    expect(isClosedJobStatus('on_hold')).toBe(false);
    expect(isClosedJobStatus(null)).toBe(false);
    expect(isClosedJobStatus(undefined)).toBe(false);
  });

  it('defaults to refusing ONLY the closed statuses', () => {
    for (const s of CLOSED_JOB_STATUSES) expect(isClockInEligibleStatus(s)).toBe(false);
    for (const s of ['on_hold', 'pending_approval', 'rejected']) {
      expect(isClockInEligibleStatus(s)).toBe(true);
      expect(isClockInEligibleStatus(s, UNCLOCKABLE_INFERRED_JOB_STATUSES)).toBe(false);
    }
    for (const s of ['scheduled', 'assigned', 'in_route', 'on_site', 'in_progress', 'pending_completion']) {
      expect(isClockInEligibleStatus(s)).toBe(true);
      expect(isClockInEligibleStatus(s, UNCLOCKABLE_INFERRED_JOB_STATUSES)).toBe(true);
    }
  });

  it('renders the PostgREST not.in literal the queries actually send', () => {
    expect(postgrestNotInList(CLOSED_JOB_STATUSES)).toBe('("completed","cancelled","archived")');
    expect(postgrestNotInList(UNCLOCKABLE_INFERRED_JOB_STATUSES)).toBe(
      '("completed","cancelled","archived","on_hold","pending_approval","rejected")'
    );
  });
});
