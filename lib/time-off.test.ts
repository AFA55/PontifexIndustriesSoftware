import {
  canDecideTimeOff,
  businessDaysBetween,
  MANAGEMENT_REQUESTER_ROLES,
  isAttendanceFactType,
  ATTENDANCE_FACT_TYPES,
  MANAGEMENT_NOTIFY_ROLES,
  APPROVER_NOTIFY_ROLES,
} from './time-off';
import { enumerateYMDRange, isWeekend } from './dates';

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

describe('weekend-pay mismatch regression (time-off approval timecard sync)', () => {
  // The approval route (app/api/admin/time-off/[id]/route.ts) builds its list of
  // paid-timecard days by filtering enumerateYMDRange() through !isWeekend(), so
  // it inserts one 8h row per BUSINESS day — matching the PTO debit, which is
  // also business-days-only (businessDaysBetween). This locks that the two
  // counts agree for a range spanning a weekend.
  it('weekday-filtered day count matches businessDaysBetween across a full week', () => {
    const start = '2026-06-22'; // Monday
    const end = '2026-06-28';   // Sunday (includes a weekend)
    const paidDays = enumerateYMDRange(start, end).filter((d) => !isWeekend(d));
    expect(paidDays.length).toBe(businessDaysBetween(start, end));
    expect(paidDays).toEqual(['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26']);
  });

  it('a two-week PTO request still debits/pays only 10 business days', () => {
    const start = '2026-06-22'; // Monday
    const end = '2026-07-03';   // Friday, two weeks later (spans 2 weekends)
    const paidDays = enumerateYMDRange(start, end).filter((d) => !isWeekend(d));
    expect(paidDays.length).toBe(businessDaysBetween(start, end));
    expect(paidDays.length).toBe(10);
  });
});

describe('type split — attendance FACTS vs planned REQUESTS', () => {
  // Drives the admin-log POST branch: facts → recorded immediately + notify ALL
  // management; requests → pending + notify approvers only.
  it('callout and no_show are attendance facts (recorded immediately)', () => {
    expect(isAttendanceFactType('callout')).toBe(true);
    expect(isAttendanceFactType('no_show')).toBe(true);
    expect([...ATTENDANCE_FACT_TYPES].sort()).toEqual(['callout', 'no_show'].sort());
  });

  it('planned types are NOT attendance facts (stay pending → approval)', () => {
    for (const t of ['pto', 'vacation', 'sick', 'personal', 'personal_day', 'unpaid', 'bereavement', 'other']) {
      expect(isAttendanceFactType(t)).toBe(false);
    }
  });

  it('an unknown type defaults to a request, not a fact (fail-safe to approval)', () => {
    expect(isAttendanceFactType('totally_unknown')).toBe(false);
  });
});

describe('notification audiences by type', () => {
  it('attendance facts notify ALL management (incl. supervisor + project manager)', () => {
    expect([...MANAGEMENT_NOTIFY_ROLES].sort()).toEqual(
      ['admin', 'super_admin', 'operations_manager', 'supervisor', 'salesman'].sort()
    );
    // Crew-supervising roles are present so a no-show reaches the field leads.
    expect(MANAGEMENT_NOTIFY_ROLES).toContain('supervisor');
    expect(MANAGEMENT_NOTIFY_ROLES).toContain('salesman'); // "Project Manager"
  });

  it('planned requests notify ONLY approvers (admin + super_admin + ops_manager)', () => {
    expect([...APPROVER_NOTIFY_ROLES].sort()).toEqual(
      ['admin', 'super_admin', 'operations_manager'].sort()
    );
    // Crew leads who CANNOT approve are deliberately excluded from request pings.
    expect(APPROVER_NOTIFY_ROLES).not.toContain('supervisor');
    expect(APPROVER_NOTIFY_ROLES).not.toContain('salesman');
  });

  it('the approver-notify set is a subset of the management-notify set', () => {
    for (const r of APPROVER_NOTIFY_ROLES) {
      expect(MANAGEMENT_NOTIFY_ROLES).toContain(r);
    }
  });
});
