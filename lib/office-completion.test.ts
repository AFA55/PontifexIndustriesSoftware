/**
 * The rule the founder set: "read-only after he submits his current day."
 *
 * The case worth protecting is the middle one — an operator halfway through
 * entering a day's footage when the office closes the job must not lose it.
 */

import {
  operatorAccess,
  canOperatorEdit,
  operatorNotice,
  canOfficeClose,
  officeCloseAffordance,
} from './office-completion';

const CLOSED = '2026-08-06T14:00:00Z';

describe('officeCloseAffordance', () => {
  it('offers the close on the jobs that are actually stuck', () => {
    // The founder's print-only tickets: scheduled, nobody assigned, nobody ever
    // closed them. 12 of these were sitting on the board.
    expect(officeCloseAffordance({ status: 'scheduled' }, 'admin')).toBe('close');
    expect(officeCloseAffordance({ status: 'assigned' }, 'operations_manager')).toBe('close');
    expect(officeCloseAffordance({ status: 'on_hold' }, 'supervisor')).toBe('close');
    expect(officeCloseAffordance({ status: 'in_progress' }, 'super_admin')).toBe('close');
  });

  it('offers the undo once the office has closed it', () => {
    expect(
      officeCloseAffordance({ status: 'completed', officeCompletedAt: CLOSED }, 'admin')
    ).toBe('reopen');
  });

  it('stays out of the way when the operator signed the job off himself', () => {
    expect(
      officeCloseAffordance({ status: 'completed', operatorCompletedAt: CLOSED }, 'admin')
    ).toBe('none');
    // Even mid-flight — his sign-off is the real close.
    expect(
      officeCloseAffordance({ status: 'in_progress', operatorCompletedAt: CLOSED }, 'admin')
    ).toBe('none');
  });

  it('does not offer to "complete" a job that is already settled another way', () => {
    // 8 production jobs sit at status=completed with no signature and no office
    // close. Drawing the button on them would be a false affordance.
    expect(officeCloseAffordance({ status: 'completed' }, 'admin')).toBe('none');
    expect(officeCloseAffordance({ status: 'cancelled' }, 'admin')).toBe('none');
    expect(officeCloseAffordance({ status: 'archived' }, 'admin')).toBe('none');
  });

  it('never draws the button for someone the API would refuse', () => {
    for (const role of ['operator', 'apprentice', 'salesman', 'shop_manager', 'inventory_manager']) {
      expect(officeCloseAffordance({ status: 'scheduled' }, role)).toBe('none');
      expect(canOfficeClose(role)).toBe(false);
    }
    expect(officeCloseAffordance({ status: 'scheduled' }, undefined)).toBe('none');
    expect(officeCloseAffordance({ status: 'scheduled' }, null)).toBe('none');
    // …and hides the undo from them too.
    expect(officeCloseAffordance({ officeCompletedAt: CLOSED }, 'operator')).toBe('none');
  });

  it('treats a missing status as still open — a stuck job must not hide', () => {
    expect(officeCloseAffordance({}, 'admin')).toBe('close');
    expect(officeCloseAffordance({ status: null }, 'admin')).toBe('close');
  });
});

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
