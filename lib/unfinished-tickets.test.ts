/**
 * Tests for the clock-out "is today's ticket handled?" predicates
 * (lib/unfinished-tickets.ts).
 *
 * The regression these lock down: draft-autosave and day-note SKELETON rows in
 * daily_job_logs (day_completed_at NULL) used to satisfy the clock-out gate, so
 * an operator who merely opened the work-performed page was never warned. Same
 * class of bug on the helper side with the empty "start" helper_work_logs row.
 */

import {
  isOperatorTicketHandled,
  isHelperLogHandled,
  operatorUnfinishedJobs,
  helperUnfinishedJobs,
  statusNotInList,
  OPERATOR_EXCLUDED_STATUSES,
  HELPER_EXCLUDED_STATUSES,
  type OperatorDailyLogRow,
  type HelperWorkLogRow,
} from './unfinished-tickets';

const opLog = (over: Partial<OperatorDailyLogRow> = {}): OperatorDailyLogRow => ({
  job_order_id: 'job-1',
  day_completed_at: null,
  ...over,
});

const helperLog = (over: Partial<HelperWorkLogRow> = {}): HelperWorkLogRow => ({
  job_order_id: 'job-1',
  completed_at: null,
  work_description: '',
  ...over,
});

describe('excluded job statuses', () => {
  it('excludes on_hold for BOTH roles — a job parked to Pending owes no ticket', () => {
    // Regression: without on_hold in the operator list, a parked multi-day job
    // warned (and fired a bell reminder) on every clock-out until end_date.
    expect(OPERATOR_EXCLUDED_STATUSES).toContain('on_hold');
    expect(HELPER_EXCLUDED_STATUSES).toContain('on_hold');
  });

  it('excludes the terminal states for both roles', () => {
    for (const s of ['cancelled', 'completed', 'pending_completion']) {
      expect(OPERATOR_EXCLUDED_STATUSES).toContain(s);
      expect(HELPER_EXCLUDED_STATUSES).toContain(s);
    }
  });

  it('the two roles exclude the same set (order is irrelevant)', () => {
    expect([...OPERATOR_EXCLUDED_STATUSES].sort()).toEqual([...HELPER_EXCLUDED_STATUSES].sort());
  });

  it('builds the PostgREST not-in literal', () => {
    expect(statusNotInList(['cancelled', 'on_hold'])).toBe('("cancelled","on_hold")');
    expect(statusNotInList(OPERATOR_EXCLUDED_STATUSES)).toBe(
      '("cancelled","completed","pending_completion","on_hold")',
    );
  });
});

describe('isOperatorTicketHandled', () => {
  it('is false when there is no log at all', () => {
    expect(isOperatorTicketHandled(null)).toBe(false);
    expect(isOperatorTicketHandled(undefined)).toBe(false);
  });

  it('is FALSE for a draft-autosave / day-note skeleton row (the bug)', () => {
    expect(isOperatorTicketHandled(opLog({ day_completed_at: null }))).toBe(false);
  });

  it('is true once the day was submitted (day_completed_at set)', () => {
    expect(isOperatorTicketHandled(opLog({ day_completed_at: '2026-08-01T22:10:00Z' }))).toBe(true);
  });
});

describe('isHelperLogHandled', () => {
  it('is false with no log', () => {
    expect(isHelperLogHandled(null)).toBe(false);
  });

  it('is FALSE for the empty "start" row inserted on start_now', () => {
    expect(isHelperLogHandled(helperLog({ completed_at: null, work_description: '' }))).toBe(false);
    expect(isHelperLogHandled(helperLog({ work_description: '   ' }))).toBe(false);
    expect(isHelperLogHandled(helperLog({ work_description: null }))).toBe(false);
  });

  it('is true once completed', () => {
    expect(isHelperLogHandled(helperLog({ completed_at: '2026-08-01T22:10:00Z' }))).toBe(true);
  });

  it('is true when they wrote what they did, even before completing', () => {
    expect(isHelperLogHandled(helperLog({ work_description: 'Ran the slab saw' }))).toBe(true);
  });
});

describe('operatorUnfinishedJobs', () => {
  const jobs = [
    { id: 'job-1', job_number: 'JOB-2026-000001', customer_name: 'Acme' },
    { id: 'job-2', job_number: 'JOB-2026-000002', customer_name: 'Globex' },
  ];

  it('warns about every job when no logs exist', () => {
    expect(operatorUnfinishedJobs(jobs, []).map((j) => j.id)).toEqual(['job-1', 'job-2']);
  });

  it('still warns when only a draft skeleton row exists', () => {
    const logs = [opLog({ job_order_id: 'job-1' })];
    expect(operatorUnfinishedJobs(jobs, logs).map((j) => j.id)).toEqual(['job-1', 'job-2']);
  });

  it('clears the job whose day was completed, keeps the other', () => {
    const logs = [
      opLog({ job_order_id: 'job-1', day_completed_at: '2026-08-01T22:00:00Z' }),
      opLog({ job_order_id: 'job-2' }), // day-note row only
    ];
    expect(operatorUnfinishedJobs(jobs, logs).map((j) => j.id)).toEqual(['job-2']);
  });

  it('is empty when every ticket was submitted', () => {
    const logs = [
      opLog({ job_order_id: 'job-1', day_completed_at: '2026-08-01T22:00:00Z' }),
      opLog({ job_order_id: 'job-2', day_completed_at: '2026-08-01T22:05:00Z' }),
    ];
    expect(operatorUnfinishedJobs(jobs, logs)).toEqual([]);
  });
});

describe('helperUnfinishedJobs', () => {
  const jobs = [
    { id: 'job-1', job_number: 'JOB-2026-000001', customer_name: 'Acme' },
    { id: 'job-2', job_number: 'JOB-2026-000002', customer_name: 'Globex' },
  ];

  it('still warns when only the empty start row exists', () => {
    const logs = [helperLog({ job_order_id: 'job-1' })];
    expect(helperUnfinishedJobs(jobs, logs).map((j) => j.id)).toEqual(['job-1', 'job-2']);
  });

  it('clears jobs with a completed or described log', () => {
    const logs = [
      helperLog({ job_order_id: 'job-1', completed_at: '2026-08-01T22:00:00Z' }),
      helperLog({ job_order_id: 'job-2', work_description: 'Held the wall panels' }),
    ];
    expect(helperUnfinishedJobs(jobs, logs)).toEqual([]);
  });
});
