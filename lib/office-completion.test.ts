/**
 * The rule the founder set: "read-only after he submits his current day."
 *
 * The case worth protecting is the middle one — an operator halfway through
 * entering a day's footage when the office closes the job must not lose it.
 */

import { operatorAccess, canOperatorEdit, operatorNotice } from './office-completion';

const CLOSED = '2026-08-06T14:00:00Z';

describe('operatorAccess', () => {
  it('leaves an untouched job fully editable', () => {
    expect(operatorAccess({})).toBe('editable');
    expect(operatorAccess({ officeCompletedAt: null, currentDaySubmitted: true })).toBe('editable');
    expect(canOperatorEdit({})).toBe(true);
  });

  it('lets him FINISH the day he is on when the office closes mid-day', () => {
    const state = { officeCompletedAt: CLOSED, currentDaySubmitted: false };
    expect(operatorAccess(state)).toBe('finish_current_day');
    // The point of the rule: he can still write.
    expect(canOperatorEdit(state)).toBe(true);
  });

  it('locks once that day is submitted', () => {
    const state = { officeCompletedAt: CLOSED, currentDaySubmitted: true };
    expect(operatorAccess(state)).toBe('read_only');
    expect(canOperatorEdit(state)).toBe(false);
  });

  it('treats a missing currentDaySubmitted as "not yet" — never locks by accident', () => {
    // Unknown state must not cost someone their entry.
    expect(canOperatorEdit({ officeCompletedAt: CLOSED })).toBe(true);
    expect(canOperatorEdit({ officeCompletedAt: CLOSED, currentDaySubmitted: null })).toBe(true);
  });
});

describe('operatorNotice', () => {
  it('says nothing on a normal job — a banner on every ticket stops being read', () => {
    expect(operatorNotice({})).toBeNull();
  });

  it('tells him to wrap up, and why, while he can still write', () => {
    const n = operatorNotice(
      { officeCompletedAt: CLOSED, currentDaySubmitted: false },
      'Customer confirmed finished on site'
    );
    expect(n?.tone).toBe('warning');
    expect(n?.body).toContain('Finish the day');
    expect(n?.body).toContain('Customer confirmed finished on site');
  });

  it('explains the lock, and that the job stays on his schedule', () => {
    const n = operatorNotice({ officeCompletedAt: CLOSED, currentDaySubmitted: true }, 'Closed by office');
    expect(n?.tone).toBe('locked');
    expect(n?.body).toContain('read-only');
    expect(n?.body).toContain('stays on your schedule');
  });

  it('copes with no reason given', () => {
    const n = operatorNotice({ officeCompletedAt: CLOSED, currentDaySubmitted: true }, null);
    expect(n).not.toBeNull();
    expect(n?.body).not.toContain('Reason given');
  });

  it('ignores a whitespace-only reason', () => {
    const n = operatorNotice({ officeCompletedAt: CLOSED, currentDaySubmitted: true }, '   ');
    expect(n?.body).not.toContain('Reason given');
  });
});
