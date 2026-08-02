import { dayCompletePermission } from './day-complete-auth';

/**
 * Guards the daily-log POST gate (/api/job-orders/[id]/daily-log):
 * crew members must get 403 even when they already hold daily_job_logs rows
 * (the work-items day-note upsert creates one — B1 guardian finding).
 */
describe('dayCompletePermission', () => {
  const base = {
    isLead: false,
    isHelperSlot: false,
    isAdmin: false,
    isCrewMember: false,
    hasExistingLog: false,
  };

  it('allows the lead', () => {
    expect(dayCompletePermission({ ...base, isLead: true })).toEqual({ allowed: true });
  });

  it('allows the helper slot (pre-existing behavior)', () => {
    expect(dayCompletePermission({ ...base, isHelperSlot: true })).toEqual({ allowed: true });
  });

  it('allows admins', () => {
    expect(dayCompletePermission({ ...base, isAdmin: true })).toEqual({ allowed: true });
  });

  it('B1: DENIES a crew member even with an existing daily log (day-note row must not unlock completion)', () => {
    expect(
      dayCompletePermission({ ...base, isCrewMember: true, hasExistingLog: true })
    ).toEqual({ allowed: false, reason: 'crew_not_lead' });
  });

  it('denies a crew member without logs too', () => {
    expect(dayCompletePermission({ ...base, isCrewMember: true })).toEqual({
      allowed: false,
      reason: 'crew_not_lead',
    });
  });

  it('keeps the ex-lead fallback: existing log + NOT crewed → allowed', () => {
    expect(dayCompletePermission({ ...base, hasExistingLog: true })).toEqual({ allowed: true });
  });

  it('denies a stranger (no slot, no crew, no logs)', () => {
    expect(dayCompletePermission(base)).toEqual({ allowed: false, reason: 'not_assigned' });
  });

  it('lead status wins over crew membership (stale crew row on the current lead)', () => {
    expect(
      dayCompletePermission({ ...base, isLead: true, isCrewMember: true })
    ).toEqual({ allowed: true });
  });
});
