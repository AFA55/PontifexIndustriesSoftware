/**
 * Tests for job status-transition hardening helpers.
 */

import {
  STATUS_RANK,
  STATUS_TIMESTAMP_FIELD,
  MAX_FUTURE_SKEW_MS,
  MAX_PAST_AGE_MS,
  isJobStatus,
  isValidTransition,
  validateTransitionTimestamp,
} from './job-status';

describe('isJobStatus', () => {
  it('recognizes valid statuses', () => {
    expect(isJobStatus('in_route')).toBe(true);
    expect(isJobStatus('completed')).toBe(true);
  });
  it('rejects unknown / non-string', () => {
    expect(isJobStatus('frobnicate')).toBe(false);
    expect(isJobStatus(null)).toBe(false);
    expect(isJobStatus(5)).toBe(false);
    expect(isJobStatus(undefined)).toBe(false);
  });
});

describe('STATUS_RANK ordering', () => {
  it('walks the pipeline forward', () => {
    expect(STATUS_RANK.scheduled).toBeLessThan(STATUS_RANK.in_route);
    expect(STATUS_RANK.in_route).toBeLessThan(STATUS_RANK.on_site);
    expect(STATUS_RANK.on_site).toBeLessThan(STATUS_RANK.in_progress);
    expect(STATUS_RANK.in_progress).toBeLessThan(STATUS_RANK.completed);
  });
});

describe('STATUS_TIMESTAMP_FIELD', () => {
  it('maps lifecycle statuses to their job_orders timestamp columns', () => {
    expect(STATUS_TIMESTAMP_FIELD.in_route).toBe('in_route_at');
    expect(STATUS_TIMESTAMP_FIELD.on_site).toBe('arrived_at_jobsite_at');
    expect(STATUS_TIMESTAMP_FIELD.in_progress).toBe('work_started_at');
    expect(STATUS_TIMESTAMP_FIELD.completed).toBe('work_completed_at');
  });
});

describe('isValidTransition', () => {
  it('allows the happy-path operator walk', () => {
    expect(isValidTransition('scheduled', 'in_route')).toBe(true);
    expect(isValidTransition('in_route', 'on_site')).toBe(true);
    expect(isValidTransition('on_site', 'in_progress')).toBe(true);
    expect(isValidTransition('in_progress', 'completed')).toBe(true);
    expect(isValidTransition('in_route', 'in_progress')).toBe(true); // skip on_site
  });
  it('allows idempotent no-ops', () => {
    expect(isValidTransition('in_progress', 'in_progress')).toBe(true);
    expect(isValidTransition('completed', 'completed')).toBe(true);
  });
  it('rejects backwards transitions', () => {
    expect(isValidTransition('in_progress', 'in_route')).toBe(false);
    expect(isValidTransition('on_site', 'scheduled')).toBe(false);
    expect(isValidTransition('completed', 'in_route')).toBe(false);
  });
  it('allows entering terminal states', () => {
    expect(isValidTransition('in_progress', 'cancelled')).toBe(true);
    expect(isValidTransition('scheduled', 'cancelled')).toBe(true);
    expect(isValidTransition('completed', 'archived')).toBe(true);
  });
  it('rejects leaving a terminal state', () => {
    expect(isValidTransition('cancelled', 'in_progress')).toBe(false);
    expect(isValidTransition('archived', 'scheduled')).toBe(false);
    expect(isValidTransition('cancelled', 'archived')).toBe(false);
  });
  it('is permissive for unknown statuses (never hard-blocks)', () => {
    expect(isValidTransition('weird', 'in_route')).toBe(true);
    expect(isValidTransition('in_route', 'weird')).toBe(true);
    expect(isValidTransition(null, undefined)).toBe(true);
  });
});

describe('validateTransitionTimestamp', () => {
  const now = new Date('2026-05-24T12:00:00.000Z');

  it('accepts a current timestamp and returns ISO', () => {
    const ts = '2026-05-24T11:59:00.000Z';
    expect(validateTransitionTimestamp(ts, now)).toBe(
      new Date(ts).toISOString()
    );
  });
  it('accepts a slightly-future timestamp within skew', () => {
    const ts = new Date(now.getTime() + MAX_FUTURE_SKEW_MS - 1000);
    expect(validateTransitionTimestamp(ts, now)).toBe(ts.toISOString());
  });
  it('rejects a timestamp too far in the future', () => {
    const ts = new Date(now.getTime() + MAX_FUTURE_SKEW_MS + 60_000);
    expect(validateTransitionTimestamp(ts, now)).toBeNull();
  });
  it('accepts a recent past timestamp', () => {
    const ts = new Date(now.getTime() - 60 * 60 * 1000); // 1h ago
    expect(validateTransitionTimestamp(ts, now)).toBe(ts.toISOString());
  });
  it('rejects a wildly-backdated timestamp', () => {
    const ts = new Date(now.getTime() - MAX_PAST_AGE_MS - 60_000);
    expect(validateTransitionTimestamp(ts, now)).toBeNull();
  });
  it('accepts numeric epoch and Date inputs', () => {
    const epoch = now.getTime() - 1000;
    expect(validateTransitionTimestamp(epoch, now)).toBe(
      new Date(epoch).toISOString()
    );
    expect(validateTransitionTimestamp(new Date(epoch), now)).toBe(
      new Date(epoch).toISOString()
    );
  });
  it('returns null for empty / unparseable / wrong-type input', () => {
    expect(validateTransitionTimestamp(null, now)).toBeNull();
    expect(validateTransitionTimestamp(undefined, now)).toBeNull();
    expect(validateTransitionTimestamp('', now)).toBeNull();
    expect(validateTransitionTimestamp('not-a-date', now)).toBeNull();
    expect(validateTransitionTimestamp({}, now)).toBeNull();
  });
});
