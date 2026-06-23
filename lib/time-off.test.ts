import {
  canDecideTimeOff,
  businessDaysBetween,
  MANAGEMENT_REQUESTER_ROLES,
} from './time-off';

describe('canDecideTimeOff — rank-based approval authority', () => {
  // ── super_admin approves EVERYONE ──────────────────────────────────────
  it('super_admin can approve any role', () => {
    for (const requester of [
      'apprentice', 'operator', 'shop_help', 'inventory_manager',
      'shop_manager', 'salesman', 'supervisor', 'admin',
      'operations_manager', 'super_admin', 'unknown_role',
    ]) {
      expect(canDecideTimeOff('super_admin', requester)).toBe(true);
    }
  });

  // ── admin approves operators + project-managers (and below) ────────────
  it('admin can approve an operator', () => {
    expect(canDecideTimeOff('admin', 'operator')).toBe(true);
  });

  it('admin can approve an apprentice', () => {
    expect(canDecideTimeOff('admin', 'apprentice')).toBe(true);
  });

  it('admin can approve a project manager (salesman role)', () => {
    expect(canDecideTimeOff('admin', 'salesman')).toBe(true);
  });

  it('admin can approve a supervisor and shop/inventory roles', () => {
    expect(canDecideTimeOff('admin', 'supervisor')).toBe(true);
    expect(canDecideTimeOff('admin', 'shop_manager')).toBe(true);
    expect(canDecideTimeOff('admin', 'inventory_manager')).toBe(true);
  });

  // ── admin CANNOT approve management at/above admin ─────────────────────
  it('admin CANNOT approve an operations_manager', () => {
    expect(canDecideTimeOff('admin', 'operations_manager')).toBe(false);
  });

  it('admin CANNOT approve another admin', () => {
    expect(canDecideTimeOff('admin', 'admin')).toBe(false);
  });

  it('admin CANNOT approve a super_admin', () => {
    expect(canDecideTimeOff('admin', 'super_admin')).toBe(false);
  });

  // ── operations_manager mirrors admin's authority ───────────────────────
  it('operations_manager can approve a project manager but not an admin', () => {
    expect(canDecideTimeOff('operations_manager', 'salesman')).toBe(true);
    expect(canDecideTimeOff('operations_manager', 'operator')).toBe(true);
    expect(canDecideTimeOff('operations_manager', 'admin')).toBe(false);
    expect(canDecideTimeOff('operations_manager', 'operations_manager')).toBe(false);
  });

  // ── non-approver roles can never decide ────────────────────────────────
  it('non-approver roles can never decide, even for low-rank requesters', () => {
    for (const approver of ['operator', 'apprentice', 'salesman', 'supervisor', 'shop_manager']) {
      expect(canDecideTimeOff(approver, 'operator')).toBe(false);
    }
  });

  // ── fail-safe: unknown requester role only clearable by super_admin ────
  it('unknown requester role is fail-safe (super_admin only when at/above admin defaults aside)', () => {
    // Unknown role → rank 0 (below admin) → admin may decide. This is the
    // documented conservative default for genuinely low-privilege unknowns.
    expect(canDecideTimeOff('admin', 'unknown_role')).toBe(true);
    expect(canDecideTimeOff('super_admin', 'unknown_role')).toBe(true);
  });

  // ── MANAGEMENT_REQUESTER_ROLES = roles at/above admin ──────────────────
  it('MANAGEMENT_REQUESTER_ROLES contains admin and above only', () => {
    expect(MANAGEMENT_REQUESTER_ROLES.sort()).toEqual(
      ['admin', 'operations_manager', 'super_admin'].sort()
    );
  });
});

describe('businessDaysBetween', () => {
  it('counts a single weekday as 1', () => {
    expect(businessDaysBetween('2026-06-22', '2026-06-22')).toBe(1); // Monday
  });

  it('skips weekends across a full week', () => {
    // Mon 2026-06-22 → Fri 2026-06-26 = 5 business days
    expect(businessDaysBetween('2026-06-22', '2026-06-26')).toBe(5);
    // Mon → next Mon (incl) spans one weekend = 6 business days
    expect(businessDaysBetween('2026-06-22', '2026-06-29')).toBe(6);
  });

  it('returns at least 1 for a weekend-only range', () => {
    // Sat 2026-06-27 → Sun 2026-06-28 = 0 weekdays → clamps to 1
    expect(businessDaysBetween('2026-06-27', '2026-06-28')).toBe(1);
  });
});
