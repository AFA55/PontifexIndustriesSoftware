/**
 * Unit tests for the PURE parts of the shared reassignment helper
 * (lib/reassign.ts): scope→dates expansion, the status-guard predicates,
 * and same-day sequence computation. The DB write path is exercised via the
 * routes; these lock the decision logic.
 */
// Mock the side-effect modules so importing lib/reassign doesn't drag in the
// email chain (resend → postal-mime needs TextEncoder, absent in jsdom — the
// same pre-existing limitation that keeps lib/email.test.ts skipped-in-place).
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }));
jest.mock('@/lib/send-reminder', () => ({ sendNotification: jest.fn() }));
jest.mock('@/lib/sms', () => ({ sendSMS: jest.fn() }));
jest.mock('@/lib/audit', () => ({ logAuditEvent: jest.fn() }));

import {
  expandScopeDates,
  shouldPromoteToAssigned,
  shouldDowngradeToScheduled,
  computeDaySequence,
  planLedgerSequences,
  sequenceBlocks,
  ordinal,
} from './reassign';

describe('expandScopeDates', () => {
  it("scope 'day' returns only the assignment date", () => {
    expect(expandScopeDates('day', '2026-08-03', '2026-08-07')).toEqual(['2026-08-03']);
  });

  it("scope 'remaining' expands assignment date → end_date inclusive", () => {
    expect(expandScopeDates('remaining', '2026-08-03', '2026-08-06')).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
    ]);
  });

  it("scope 'remaining' on a single-day job (no end_date) collapses to the date", () => {
    expect(expandScopeDates('remaining', '2026-08-03', null)).toEqual(['2026-08-03']);
    expect(expandScopeDates('remaining', '2026-08-03', undefined)).toEqual(['2026-08-03']);
  });

  it("scope 'remaining' when end_date equals the assignment date is one day", () => {
    expect(expandScopeDates('remaining', '2026-08-03', '2026-08-03')).toEqual(['2026-08-03']);
  });

  it("scope 'remaining' when end_date is BEFORE the anchor (stale span) is one day", () => {
    expect(expandScopeDates('remaining', '2026-08-03', '2026-08-01')).toEqual(['2026-08-03']);
  });

  // is_multi_day OVERRIDES end_date. Regression guard for JOB-2026-895358
  // (Pratt): is_multi_day=false but end_date a week out, which wrote seven
  // ledger rows and put the same ticket on the crew's phone every day for a
  // week. Nine of 33 live jobs since June carry this shape.
  it('a job flagged NOT multi-day never spans, even with a later end_date', () => {
    expect(expandScopeDates('remaining', '2026-08-10', '2026-08-17', false)).toEqual(['2026-08-10']);
  });

  it('a job flagged multi-day still spans to its end_date', () => {
    expect(expandScopeDates('remaining', '2026-08-10', '2026-08-12', true)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
    ]);
  });

  it("scope 'day' stays one day whatever the multi-day flag says", () => {
    expect(expandScopeDates('day', '2026-08-10', '2026-08-17', true)).toEqual(['2026-08-10']);
  });

  it('spans a month boundary without UTC off-by-one', () => {
    expect(expandScopeDates('remaining', '2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });
});

describe('shouldPromoteToAssigned (status guard)', () => {
  it('promotes scheduled and pending_approval when an operator is set', () => {
    expect(shouldPromoteToAssigned('scheduled', 'op-1')).toBe(true);
    expect(shouldPromoteToAssigned('pending_approval', 'op-1')).toBe(true);
  });

  it('NEVER promotes/downgrades live jobs (in_route/on_site/in_progress/pending_completion)', () => {
    for (const s of ['in_route', 'on_site', 'in_progress', 'pending_completion', 'completed', 'assigned']) {
      expect(shouldPromoteToAssigned(s, 'op-1')).toBe(false);
    }
  });

  it('never promotes without an operator', () => {
    expect(shouldPromoteToAssigned('scheduled', null)).toBe(false);
  });

  it('handles null/undefined status', () => {
    expect(shouldPromoteToAssigned(null, 'op-1')).toBe(false);
    expect(shouldPromoteToAssigned(undefined, 'op-1')).toBe(false);
  });
});

describe('shouldDowngradeToScheduled (unassign guard)', () => {
  it("downgrades only 'assigned' when clearing the operator", () => {
    expect(shouldDowngradeToScheduled('assigned', null)).toBe(true);
  });

  it('never downgrades live or terminal jobs', () => {
    for (const s of ['in_route', 'on_site', 'in_progress', 'pending_completion', 'completed', 'scheduled']) {
      expect(shouldDowngradeToScheduled(s, null)).toBe(false);
    }
  });

  it('never downgrades when an operator is being SET', () => {
    expect(shouldDowngradeToScheduled('assigned', 'op-1')).toBe(false);
  });
});

describe('computeDaySequence (same-day sequencing)', () => {
  it('keeps the existing sequence when the operator has no other jobs that day', () => {
    expect(computeDaySequence([], 2, 'last')).toBe(2);
    expect(computeDaySequence([], null, 'last')).toBe(1);
    expect(computeDaySequence([], undefined, 'first')).toBe(1);
  });

  it("appends after the operator's existing jobs by default ('last')", () => {
    expect(computeDaySequence([1], null, 'last')).toBe(2);
    expect(computeDaySequence([1, 2], null, 'last')).toBe(3);
    expect(computeDaySequence([2, 5], null, 'last')).toBe(6); // gaps tolerated
  });

  it("position 'first' claims sequence 1 (others get shifted by the caller)", () => {
    expect(computeDaySequence([1, 2], null, 'first')).toBe(1);
    expect(computeDaySequence([3], 4, 'first')).toBe(1);
  });

  // Guardian B2: a same-operator resubmit (helper-only edit) must PRESERVE
  // the job's slot — never re-append it to the end of the operator's day.
  it('sameOperator preserves the job\'s existing sequence over append/first', () => {
    expect(computeDaySequence([2, 3], 1, 'last', true)).toBe(1);
    expect(computeDaySequence([2, 3], 1, 'first', true)).toBe(1);
    expect(computeDaySequence([1, 3], 2, 'last', true)).toBe(2);
    // sameOperator but somehow no own sequence → falls through to normal rules
    expect(computeDaySequence([1], null, 'last', true)).toBe(2);
  });
});

describe('planLedgerSequences (writeLedgerRows planning core)', () => {
  const others = (rows: [string, number][]) => {
    const m = new Map<string, { id: string; day_sequence: number }[]>();
    for (const [d, seq] of rows) {
      const list = m.get(d) || [];
      list.push({ id: `other-${d}-${seq}`, day_sequence: seq });
      m.set(d, list);
    }
    return m;
  };
  const own = (rows: [string, number, string | null][]) => {
    const m = new Map<string, { day_sequence: number; operator_id: string | null }>();
    for (const [d, seq, op] of rows) m.set(d, { day_sequence: seq, operator_id: op });
    return m;
  };

  // Guardian B2: helper-only edit resubmits the SAME operator — the op's #1
  // job must stay #1 even though they have other jobs that day, and nothing
  // gets shifted.
  it('same-operator resubmit preserves sequence and emits no shifts', () => {
    const plan = planLedgerSequences(
      ['2026-08-02'],
      others([['2026-08-02', 2], ['2026-08-02', 3]]),
      own([['2026-08-02', 1, 'op-A']]),
      'op-A',
      'last'
    );
    expect(plan.sequences).toEqual({ '2026-08-02': 1 });
    expect(plan.shifts).toEqual([]);
  });

  it("same-operator resubmit ignores position 'first' (no shift storm)", () => {
    const plan = planLedgerSequences(
      ['2026-08-02'],
      others([['2026-08-02', 1]]),
      own([['2026-08-02', 2, 'op-A']]),
      'op-A',
      'first'
    );
    expect(plan.sequences).toEqual({ '2026-08-02': 2 });
    expect(plan.shifts).toEqual([]);
  });

  it('operator CHANGE appends after the new operator\'s jobs', () => {
    const plan = planLedgerSequences(
      ['2026-08-02'],
      others([['2026-08-02', 1]]),
      own([['2026-08-02', 1, 'op-A']]), // row currently belongs to op-A
      'op-B',
      'last'
    );
    expect(plan.sequences).toEqual({ '2026-08-02': 2 });
    expect(plan.shifts).toEqual([]);
  });

  it("operator change with position 'first' shifts existing rows, highest first", () => {
    const plan = planLedgerSequences(
      ['2026-08-02'],
      others([['2026-08-02', 1], ['2026-08-02', 2]]),
      own([]),
      'op-B',
      'first'
    );
    expect(plan.sequences).toEqual({ '2026-08-02': 1 });
    // Highest sequence shifts first so the unique index never sees a dupe.
    expect(plan.shifts).toEqual([
      { id: 'other-2026-08-02-2', newSequence: 3 },
      { id: 'other-2026-08-02-1', newSequence: 2 },
    ]);
  });

  it('unassign keeps the row\'s slot and never shifts', () => {
    const plan = planLedgerSequences(
      ['2026-08-02'],
      others([]),
      own([['2026-08-02', 2, 'op-A']]),
      null,
      'first'
    );
    expect(plan.sequences).toEqual({ '2026-08-02': 2 });
    expect(plan.shifts).toEqual([]);
  });

  it('multi-day remaining scope plans each date independently', () => {
    const plan = planLedgerSequences(
      ['2026-08-02', '2026-08-03'],
      others([['2026-08-03', 1]]),
      own([['2026-08-02', 1, 'op-A'], ['2026-08-03', 1, 'op-A']]),
      'op-B',
      'last'
    );
    expect(plan.sequences).toEqual({ '2026-08-02': 1, '2026-08-03': 2 });
  });
});

describe('sequenceBlocks (status-route same-day gate)', () => {
  const TODAY = '2026-08-02';
  const base = {
    status: 'assigned' as string | null,
    work_completed_at: null as string | null,
    scheduled_date: TODAY as string | null,
    end_date: null as string | null,
  };

  it('an unfinished same-day job blocks', () => {
    expect(sequenceBlocks({ ...base }, false, TODAY)).toBe(true);
    expect(sequenceBlocks({ ...base, status: 'in_progress' }, false, TODAY)).toBe(true);
  });

  // Guardian B1: the not-ready flow parks job #1 on_hold with its ledger row
  // intact — job #2 must still be startable.
  it("a job parked on_hold does NOT block", () => {
    expect(sequenceBlocks({ ...base, status: 'on_hold' }, false, TODAY)).toBe(false);
  });

  it('completed / cancelled / work_completed_at do not block', () => {
    expect(sequenceBlocks({ ...base, status: 'completed' }, false, TODAY)).toBe(false);
    expect(sequenceBlocks({ ...base, status: 'cancelled' }, false, TODAY)).toBe(false);
    expect(sequenceBlocks({ ...base, work_completed_at: '2026-08-02T18:00:00Z' }, false, TODAY)).toBe(false);
  });

  it('a day-completed daily log today does not block', () => {
    expect(sequenceBlocks({ ...base }, true, TODAY)).toBe(false);
  });

  // Guardian B4: a job MOVED off today leaves a stale ledger row — its own
  // scheduled window no longer covers today, so it must not block.
  it('stale ledger row (job moved to another date) does NOT block', () => {
    expect(sequenceBlocks({ ...base, scheduled_date: '2026-08-05' }, false, TODAY)).toBe(false); // moved forward
    expect(sequenceBlocks({ ...base, scheduled_date: '2026-07-30' }, false, TODAY)).toBe(false); // moved back, single-day
    expect(sequenceBlocks({ ...base, scheduled_date: null }, false, TODAY)).toBe(false);
  });

  it('a multi-day job spanning today still blocks', () => {
    expect(
      sequenceBlocks({ ...base, scheduled_date: '2026-07-31', end_date: '2026-08-04' }, false, TODAY)
    ).toBe(true);
  });

  it('a multi-day job that ended before today does not block', () => {
    expect(
      sequenceBlocks({ ...base, scheduled_date: '2026-07-28', end_date: '2026-07-30' }, false, TODAY)
    ).toBe(false);
  });
});

describe('ordinal', () => {
  it('formats English ordinals', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(21)).toBe('21st');
  });
});
