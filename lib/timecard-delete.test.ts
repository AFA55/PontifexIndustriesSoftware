import {
  groupEntriesByDay,
  multiEntryDates,
  isMultiEntryDay,
  isApprovedCard,
  canDeleteTimecard,
  normalizeDeleteReason,
  MAX_DELETE_REASON_LENGTH,
  TIMECARD_DELETE_ROLES,
} from './timecard-delete';
import { ADMIN_ROLES } from './api-auth';

const REASON = 'duplicate clock-in';

function entry(id: string, date: string, clockIn?: string | null) {
  return { id, date, clock_in_time: clockIn ?? null };
}

describe('groupEntriesByDay', () => {
  it('groups entries under their local calendar date', () => {
    const grouped = groupEntriesByDay([
      entry('a', '2026-08-03', '2026-08-03T07:00:00Z'),
      entry('b', '2026-08-04', '2026-08-04T07:00:00Z'),
      entry('c', '2026-08-03', '2026-08-03T15:00:00Z'),
    ]);
    expect(Object.keys(grouped).sort()).toEqual(['2026-08-03', '2026-08-04']);
    expect(grouped['2026-08-03']).toHaveLength(2);
    expect(grouped['2026-08-04']).toHaveLength(1);
  });

  it('orders a day by clock-in time, not insertion order', () => {
    const grouped = groupEntriesByDay([
      entry('afternoon', '2026-08-03', '2026-08-03T15:00:00Z'),
      entry('morning', '2026-08-03', '2026-08-03T07:00:00Z'),
    ]);
    expect(grouped['2026-08-03'].map((e) => e.id)).toEqual(['morning', 'afternoon']);
  });

  it('sorts entries with no clock-in last instead of throwing', () => {
    const grouped = groupEntriesByDay([
      entry('missing', '2026-08-03', null),
      entry('morning', '2026-08-03', '2026-08-03T07:00:00Z'),
    ]);
    expect(grouped['2026-08-03'].map((e) => e.id)).toEqual(['morning', 'missing']);
  });

  it('returns an empty map for no entries', () => {
    expect(groupEntriesByDay([])).toEqual({});
  });

  it('skips entries with no date rather than creating an undefined bucket', () => {
    const grouped = groupEntriesByDay([
      { id: 'x', date: '', clock_in_time: null },
      entry('ok', '2026-08-03', '2026-08-03T07:00:00Z'),
    ]);
    expect(Object.keys(grouped)).toEqual(['2026-08-03']);
  });
});

describe('multiEntryDates / isMultiEntryDay', () => {
  const week = [
    entry('mon1', '2026-08-03', '2026-08-03T07:00:00Z'),
    entry('mon2', '2026-08-03', '2026-08-03T15:00:00Z'),
    entry('tue1', '2026-08-04', '2026-08-04T07:00:00Z'),
    entry('wed1', '2026-08-05', '2026-08-05T07:00:00Z'),
    entry('wed2', '2026-08-05', '2026-08-05T13:00:00Z'),
    entry('wed3', '2026-08-05', '2026-08-05T18:00:00Z'),
  ];

  it('lists only the dates carrying more than one entry, sorted', () => {
    expect(multiEntryDates(week)).toEqual(['2026-08-03', '2026-08-05']);
  });

  it('reports a single-entry day as not multi-entry', () => {
    expect(isMultiEntryDay(week, '2026-08-04')).toBe(false);
  });

  it('reports a two-entry day as multi-entry', () => {
    expect(isMultiEntryDay(week, '2026-08-03')).toBe(true);
  });

  it('handles a three-entry day', () => {
    expect(isMultiEntryDay(week, '2026-08-05')).toBe(true);
  });

  it('reports an absent date as not multi-entry', () => {
    expect(isMultiEntryDay(week, '2026-12-25')).toBe(false);
  });

  it('returns no dates when every day has one entry', () => {
    expect(multiEntryDates([entry('a', '2026-08-03', null)])).toEqual([]);
  });
});

describe('isApprovedCard', () => {
  it('is true when is_approved is set', () => {
    expect(isApprovedCard({ is_approved: true })).toBe(true);
  });

  it('is true when approval_status says approved (the v2 column)', () => {
    expect(isApprovedCard({ approval_status: 'approved' })).toBe(true);
  });

  it('is false for a pending card', () => {
    expect(isApprovedCard({ is_approved: false, approval_status: 'pending' })).toBe(false);
  });

  it('is false when both columns are absent', () => {
    expect(isApprovedCard({})).toBe(false);
  });

  it('is false for a rejected card', () => {
    expect(isApprovedCard({ is_approved: false, approval_status: 'rejected' })).toBe(false);
  });
});

describe('canDeleteTimecard — role gate', () => {
  const pending = { is_approved: false, approval_status: 'pending' };

  it.each(['admin', 'operations_manager', 'super_admin'])('allows %s', (role) => {
    expect(canDeleteTimecard({ card: pending, role, reason: REASON }).allowed).toBe(true);
  });

  it.each(['operator', 'apprentice', 'salesman', 'shop_manager', 'inventory_manager'])(
    'refuses %s',
    (role) => {
      const result = canDeleteTimecard({ card: pending, role, reason: REASON });
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('forbidden_role');
    }
  );

  it('refuses an unknown role', () => {
    expect(canDeleteTimecard({ card: pending, role: '', reason: REASON }).code).toBe(
      'forbidden_role'
    );
  });
});

describe('canDeleteTimecard — reason gate', () => {
  const pending = { is_approved: false };

  it('refuses a missing reason', () => {
    const result = canDeleteTimecard({ card: pending, role: 'admin' });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('reason_required');
  });

  it('refuses a whitespace-only reason', () => {
    expect(canDeleteTimecard({ card: pending, role: 'admin', reason: '   ' }).code).toBe(
      'reason_required'
    );
  });

  it('refuses a reason shorter than the minimum', () => {
    expect(canDeleteTimecard({ card: pending, role: 'admin', reason: 'x' }).code).toBe(
      'reason_required'
    );
  });

  it('checks the role before the reason, so an operator never sees a reason prompt', () => {
    expect(canDeleteTimecard({ card: pending, role: 'operator', reason: '' }).code).toBe(
      'forbidden_role'
    );
  });
});

describe('canDeleteTimecard — approved card guard', () => {
  it('blocks an admin from deleting an approved card', () => {
    const result = canDeleteTimecard({
      card: { is_approved: true },
      role: 'admin',
      reason: REASON,
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('approved_locked');
  });

  it('blocks an operations_manager from deleting an approved card', () => {
    expect(
      canDeleteTimecard({ card: { approval_status: 'approved' }, role: 'operations_manager', reason: REASON })
        .code
    ).toBe('approved_locked');
  });

  it('tells the blocked admin how to proceed', () => {
    const { message } = canDeleteTimecard({
      card: { is_approved: true },
      role: 'admin',
      reason: REASON,
    });
    expect(message).toMatch(/un-approve/i);
    expect(message).toMatch(/super admin/i);
  });

  it('lets a super_admin delete an approved card', () => {
    expect(
      canDeleteTimecard({ card: { is_approved: true }, role: 'super_admin', reason: REASON }).allowed
    ).toBe(true);
  });

  it('lets an admin delete a pending card', () => {
    expect(
      canDeleteTimecard({ card: { is_approved: false }, role: 'admin', reason: REASON }).allowed
    ).toBe(true);
  });

  it('still requires a reason from a super_admin deleting an approved card', () => {
    expect(
      canDeleteTimecard({ card: { is_approved: true }, role: 'super_admin', reason: '' }).code
    ).toBe('reason_required');
  });
});

describe('TIMECARD_DELETE_ROLES stays in sync with ADMIN_ROLES', () => {
  // The route gates on requireAdmin (ADMIN_ROLES) AND then on
  // canDeleteTimecard (TIMECARD_DELETE_ROLES). If the two ever drift, the
  // narrower list silently wins and a role that requireAdmin admitted gets an
  // unexplained 403 — or worse, a role removed from ADMIN_ROLES for cause keeps
  // its delete power here. Payroll deletion must not depend on nobody noticing.
  it('contains exactly the same roles as ADMIN_ROLES', () => {
    expect([...TIMECARD_DELETE_ROLES].sort()).toEqual([...ADMIN_ROLES].sort());
  });

  it('admits every ADMIN_ROLES member through canDeleteTimecard', () => {
    for (const role of ADMIN_ROLES) {
      expect(
        canDeleteTimecard({ card: { is_approved: false }, role, reason: REASON }).allowed
      ).toBe(true);
    }
  });

  it('never admits an operator, whatever ADMIN_ROLES says', () => {
    expect(ADMIN_ROLES).not.toContain('operator');
    expect(
      canDeleteTimecard({ card: { is_approved: false }, role: 'operator', reason: REASON }).code
    ).toBe('forbidden_role');
  });
});

describe('normalizeDeleteReason', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeDeleteReason('  duplicate  ')).toBe('duplicate');
  });

  it('caps an overlong reason at the max length', () => {
    expect(normalizeDeleteReason('x'.repeat(900))).toHaveLength(MAX_DELETE_REASON_LENGTH);
  });

  it('leaves a normal reason untouched', () => {
    expect(normalizeDeleteReason(REASON)).toBe(REASON);
  });
});
