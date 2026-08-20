import {
  canEditJobTimestamps,
  movesJobDayBoundary,
  BOUNDARY_TIMESTAMP_FIELDS,
  TIMESTAMP_EDIT_ROLES,
} from './timestamp-edit-access';
import { ADMIN_ROLES } from './api-auth';
import { jobStartOnDate, type JobStartStamps } from './job-day-boundary';

describe('canEditJobTimestamps — the gate on the job timestamp editor', () => {
  it('admits exactly the roles requireAdmin admits', () => {
    // THE POINT OF THIS TEST. The editor's PATCH route is `requireAdmin`. If
    // someone widens or narrows that guard without updating the client list,
    // this fails here instead of the founder discovering it at a 403 — or,
    // worse, a supervisor discovering they can rewrite invoiced hours.
    expect([...TIMESTAMP_EDIT_ROLES].sort()).toEqual([...ADMIN_ROLES].sort());
  });

  it.each(['admin', 'super_admin', 'operations_manager'])('admits %s', (role) => {
    expect(canEditJobTimestamps(role)).toBe(true);
  });

  it.each([
    // salesman and supervisor are the project-manager roles. The job-detail
    // page admits them, so before this gate existed they saw the edit pencils
    // and got "Forbidden. Admin access required." on save.
    'salesman',
    'supervisor',
    'shop_manager',
    'shop_help',
    'inventory_manager',
    'operator',
    'apprentice',
  ])('refuses %s', (role) => {
    expect(canEditJobTimestamps(role)).toBe(false);
  });

  it.each([null, undefined, '', 'ADMIN', 'Admin', 'super admin'])(
    'refuses %p rather than failing open',
    (role) => {
      expect(canEditJobTimestamps(role as string | null | undefined)).toBe(false);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// WHICH EDITS RE-DIVIDE A CLOCKED DAY
//
// The set started out as `{ in_route_at }` alone, which is right for the common
// shape and silently wrong for the rest: `jobStartOnDate` takes the MINIMUM of
// route_started_at, in_route_at and work_started_at, so `work_started_at` is the
// boundary whenever it is the earliest — and after the Clear button nulls both
// press columns it is the ONLY candidate left. Editing it without a warning
// moved another job's already-invoiced hours.
//
// These tests do not restate the list; they DERIVE it by moving one stamp at a
// time through the real `jobStartOnDate` and asking whether the boundary moved.
// If someone adds a start-stamp candidate to lib/job-day-boundary.ts and forgets
// this set, the last test fails.
// ─────────────────────────────────────────────────────────────────────────────

describe('movesJobDayBoundary — which timestamp edits move another job’s hours', () => {
  const DATE = '2026-08-19'; // America/New_York, the tenant default

  it.each(['in_route_at', 'route_started_at', 'work_started_at'])(
    'treats %s as a boundary field',
    (field) => {
      expect(movesJobDayBoundary(field)).toBe(true);
    }
  );

  it.each(['arrived_at_jobsite_at', 'work_completed_at', 'day_completed_at'])(
    'leaves %s alone — it is not a start stamp',
    (field) => {
      expect(movesJobDayBoundary(field)).toBe(false);
    }
  );

  it.each([null, undefined, ''])('refuses %p rather than throwing', (field) => {
    expect(movesJobDayBoundary(field as string | null | undefined)).toBe(false);
  });

  it('THE BUG: correcting Work Started earlier moves the boundary', () => {
    // In Route 07:30 EDT, Work Started 08:10 EDT. The office corrects Work
    // Started to 06:50 — the minimum is now Work Started, forty minutes earlier,
    // and the previous job's stretch on that day shortens by forty minutes.
    const before: JobStartStamps = {
      in_route_at: '2026-08-19T11:30:00.000Z',
      work_started_at: '2026-08-19T12:10:00.000Z',
    };
    const after: JobStartStamps = {
      in_route_at: '2026-08-19T11:30:00.000Z',
      work_started_at: '2026-08-19T10:50:00.000Z',
    };

    expect(jobStartOnDate(DATE, null, before)).toBe('2026-08-19T11:30:00.000Z');
    expect(jobStartOnDate(DATE, null, after)).toBe('2026-08-19T10:50:00.000Z');
    expect(movesJobDayBoundary('work_started_at')).toBe(true);
  });

  it('AND AFTER CLEAR: with both press columns null, Work Started IS the boundary', () => {
    // PATCH /timestamps nulls route_started_at alongside in_route_at when In
    // Route is cleared, which leaves work_started_at as the only candidate.
    const cleared: JobStartStamps = {
      in_route_at: null,
      route_started_at: null,
      work_started_at: '2026-08-19T12:10:00.000Z',
    };
    expect(jobStartOnDate(DATE, null, cleared)).toBe('2026-08-19T12:10:00.000Z');
  });

  it('covers every stamp jobStartOnDate actually reads', () => {
    // Move each field on its own, from a baseline where it is not the minimum,
    // to a time that IS the minimum. If the boundary changes, that field can
    // move another job's hours and must be in the set.
    const BASE: Required<JobStartStamps> = {
      route_started_at: '2026-08-19T13:00:00.000Z',
      in_route_at: '2026-08-19T13:00:00.000Z',
      work_started_at: '2026-08-19T13:00:00.000Z',
    };
    const EARLIER = '2026-08-19T11:00:00.000Z';

    const baseline = jobStartOnDate(DATE, null, BASE);
    expect(baseline).toBe('2026-08-19T13:00:00.000Z');

    const moversFound: string[] = [];
    for (const field of Object.keys(BASE) as (keyof JobStartStamps)[]) {
      const moved = jobStartOnDate(DATE, null, { ...BASE, [field]: EARLIER });
      if (moved !== baseline) moversFound.push(field);
    }

    expect(moversFound.sort()).toEqual([...BOUNDARY_TIMESTAMP_FIELDS].sort());
  });
});
