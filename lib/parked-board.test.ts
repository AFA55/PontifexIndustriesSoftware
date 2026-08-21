/**
 * THE PARKED COLUMN, PINNED TO THE SIX ROWS THAT ARE ACTUALLY IN PRODUCTION.
 *
 * Read out of `job_orders` on Aug 20 2026 — every job with `on_hold = true` OR
 * an `on_hold_placed_at`. Six rows. FIVE are parked. The sixth, ClemTenn
 * JOB-2026-974669, was released by hand that morning and the boolean was left
 * behind: `on_hold = true` AND `on_hold_released_at` set. If the folder read the
 * flag it would show a live, assigned job as parked forever, which is why
 * `isParked` compares the timestamps and this file proves it on the real row.
 *
 * The oldest — Pinnacle, JOB-2026-815303 — has been sitting since Jul 28. That
 * is twenty-three days that appeared on no screen anywhere.
 */

// ── A NOTE ON TIMEZONES, BECAUSE THIS TEST CANNOT PIN ONE ───────────────────
//
// `on_hold_placed_at` is a timestamptz and "how many days has this been
// sitting" is a CALENDAR question, so the answer legitimately differs by
// timezone: Yellowstone's `2026-08-20 01:15Z` is Aug 19 in Greenville, SC and
// Aug 20 in London. That is not a bug — it is why the board API computes the
// number in the TENANT's timezone and ships it down as `days_parked`.
//
// Jest cannot pin a timezone from inside a test file (`process.env.TZ` is set
// too late to reach the V8 timezone cache — verified, not assumed), so this file
// deliberately does not assert a tz-dependent number as if it were universal.
// Instead:
//   · two rows are stamped near midday UTC, so their calendar day is the same in
//     every timezone a person works in — those get exact "23 days" assertions;
//   · the other three are asserted RELATIVE to their own local placed day, which
//     tests the arithmetic on the real timestamp without inheriting the
//     machine's timezone;
//   · the escalation thresholds are asserted on plain numbers, where they live.

import fs from 'fs';
import path from 'path';
import { parseYMDLocal, toLocalYMD } from './dates';
import {
  partitionParked,
  sortLongestParkedFirst,
  parkedSeverity,
  parkedChipClasses,
  formatDaysParked,
  formatDaysWorked,
  withDaysParked,
  canRestartParkedJob,
  PARK_RESTART_ROLES,
  type ParkedBoardJob,
} from './parked-board';
import { daysParked, isParked } from './job-phases';
import { SALES_STAFF_ROLES } from './api-auth';

/** The day the Parked column was built. */
const TODAY = '2026-08-20';

/** N days after a bare 'YYYY-MM-DD', stated locally. Never toISOString(). */
function plusDays(ymd: string, n: number): string {
  const d = parseYMDLocal(ymd);
  d.setDate(d.getDate() + n);
  return toLocalYMD(d);
}

/** The job's own local park day — whatever timezone this test is running in. */
function localParkDay(job: ParkedBoardJob): string {
  return toLocalYMD(new Date(job.on_hold_placed_at!));
}

// ─── The six production rows, verbatim ──────────────────────────────────────

const PINNACLE: ParkedBoardJob = {
  id: 'pinnacle',
  job_number: 'JOB-2026-815303',
  customer_name: 'Pinnacle Contracting',
  project_name: null,
  on_hold: true,
  on_hold_placed_at: '2026-07-28 12:05:41.409003+00',
  on_hold_released_at: null,
  on_hold_reason: "Moved to Pending — contractor hasn't set a firm date",
  total_days_worked: 1,
};

const BWC_QA: ParkedBoardJob = {
  id: 'bwc-qa',
  job_number: 'QA-2026-830042',
  customer_name: 'Bwc Contracting',
  project_name: null,
  on_hold: true,
  on_hold_placed_at: '2026-08-07 11:03:15.523913+00',
  on_hold_released_at: null,
  on_hold_reason: 'Parked — contractor hasn’t set a new date',
  total_days_worked: 4,
};

const BWC_JOB: ParkedBoardJob = {
  id: 'bwc-job',
  job_number: 'JOB-2026-521763',
  customer_name: 'Bwc Contracting',
  project_name: null,
  on_hold: true,
  on_hold_placed_at: '2026-08-11 21:37:06.839+00',
  on_hold_released_at: null,
  on_hold_reason: 'Site not ready: Y',
  total_days_worked: 5,
};

/** RELEASED BY HAND, FLAG LEFT BEHIND. Must never appear in the folder. */
const CLEMTENN: ParkedBoardJob = {
  id: 'clemtenn',
  job_number: 'JOB-2026-974669',
  customer_name: 'ClemTenn',
  project_name: null,
  on_hold: true,
  on_hold_placed_at: '2026-08-14 20:18:01.568068+00',
  on_hold_released_at: '2026-08-20 12:02:01.493567+00',
  on_hold_reason: 'Parked — contractor hasn’t set a new date',
  total_days_worked: 1,
};

const MESSER: ParkedBoardJob = {
  id: 'messer',
  job_number: 'JOB-2026-396494',
  customer_name: 'Messer Construction',
  project_name: 'Michelin MARC MSTC',
  on_hold: true,
  on_hold_placed_at: '2026-08-17 21:28:55.177412+00',
  on_hold_released_at: null,
  on_hold_reason: 'Site not ready: Electrician are not ready',
  total_days_worked: 1,
};

const YELLOWSTONE: ParkedBoardJob = {
  id: 'yellowstone',
  job_number: 'JOB-2026-630612',
  customer_name: 'Yellowstone Landscape',
  project_name: '5 Cutler Way, Greenville, SC',
  on_hold: true,
  on_hold_placed_at: '2026-08-20 01:15:43.886366+00',
  on_hold_released_at: null,
  on_hold_reason: 'Parked — contractor hasn’t set a new date',
  total_days_worked: 0,
};

/** Whatever order PostgREST felt like. The module is not allowed to care. */
const PRODUCTION_SIX: ParkedBoardJob[] = [
  MESSER,
  CLEMTENN,
  YELLOWSTONE,
  PINNACLE,
  BWC_JOB,
  BWC_QA,
];

// ─── Who lands in the folder ────────────────────────────────────────────────

describe('partitionParked — the six production rows', () => {
  it('files five as parked and lets ClemTenn through as moving', () => {
    const { parked, moving } = partitionParked(PRODUCTION_SIX);

    expect(parked.map((j) => j.job_number)).toEqual([
      'JOB-2026-815303', // Pinnacle, Jul 28 — the oldest
      'QA-2026-830042',
      'JOB-2026-521763',
      'JOB-2026-396494',
      'JOB-2026-630612',
    ]);
    expect(moving.map((j) => j.job_number)).toEqual(['JOB-2026-974669']);
  });

  it('does not show the released-but-flag-left-true job as parked', () => {
    // The one shape that would break a hand-rolled `job.on_hold === true`.
    expect(CLEMTENN.on_hold).toBe(true);
    expect(isParked(CLEMTENN)).toBe(false);
    expect(partitionParked([CLEMTENN]).parked).toHaveLength(0);
  });

  it('loses nothing — every input comes out exactly once', () => {
    const { parked, moving } = partitionParked(PRODUCTION_SIX);
    expect(parked.length + moving.length).toBe(PRODUCTION_SIX.length);
    const seen = [...parked, ...moving].map((j) => j.id).sort();
    expect(seen).toEqual(PRODUCTION_SIX.map((j) => j.id).sort());
  });

  it('re-parking after a release puts the job back in the folder', () => {
    // What makes park/restart repeatable: a second park stamps a placed_at
    // LATER than the previous released_at.
    const reparked = { ...CLEMTENN, on_hold_placed_at: '2026-08-20 18:00:00+00' };
    expect(partitionParked([reparked]).parked).toHaveLength(1);
  });
});

describe('sortLongestParkedFirst', () => {
  it('puts the job nobody has looked at longest on top', () => {
    const sorted = sortLongestParkedFirst([YELLOWSTONE, PINNACLE, MESSER]);
    expect(sorted.map((j) => j.job_number)).toEqual([
      'JOB-2026-815303',
      'JOB-2026-396494',
      'JOB-2026-630612',
    ]);
  });

  it('is stable when two jobs were parked at the same instant', () => {
    const a = { ...BWC_QA, id: 'a', job_number: 'JOB-2026-000002' };
    const b = { ...BWC_QA, id: 'b', job_number: 'JOB-2026-000001' };
    expect(sortLongestParkedFirst([a, b]).map((j) => j.id)).toEqual(['b', 'a']);
    expect(sortLongestParkedFirst([b, a]).map((j) => j.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the caller’s array', () => {
    const input = [YELLOWSTONE, PINNACLE];
    sortLongestParkedFirst(input);
    expect(input[0].id).toBe('yellowstone');
  });
});

// ─── The number nobody could see ────────────────────────────────────────────

describe('days parked, on the real timestamps', () => {
  // Stamped 12:05Z and 11:03Z — the same calendar day in every timezone anyone
  // runs this in, so the headline numbers can be stated outright.
  it('Pinnacle has been sitting 23 days as of Aug 20', () => {
    expect(daysParked(PINNACLE, TODAY)).toBe(23);
  });

  it('the BWC quick-add has been sitting 13 days as of Aug 20', () => {
    expect(daysParked(BWC_QA, TODAY)).toBe(13);
  });

  // The three evening/early-morning stamps, asserted against their own local
  // park day so the arithmetic is tested without the timezone riding along.
  it.each([
    ['JOB-2026-521763', BWC_JOB],
    ['JOB-2026-396494', MESSER],
    ['JOB-2026-630612', YELLOWSTONE],
  ])('%s counts whole days from the day it was parked', (_num, job) => {
    const parkDay = localParkDay(job);
    expect(daysParked(job, parkDay)).toBe(0); // parked today
    expect(daysParked(job, plusDays(parkDay, 1))).toBe(1);
    expect(daysParked(job, plusDays(parkDay, 9))).toBe(9);
    expect(daysParked(job, plusDays(parkDay, 23))).toBe(23);
  });

  it('never goes negative if the clock disagrees with the stamp', () => {
    const parkDay = localParkDay(YELLOWSTONE);
    expect(daysParked(YELLOWSTONE, plusDays(parkDay, -3))).toBe(0);
  });

  it('gives the released job no age at all', () => {
    expect(daysParked(CLEMTENN, TODAY)).toBeNull();
  });

  it('attaches days_parked without touching anything else', () => {
    const [withAge] = withDaysParked([PINNACLE], TODAY);
    expect(withAge.days_parked).toBe(23);
    expect(withAge.job_number).toBe('JOB-2026-815303');
    expect(withAge.on_hold_reason).toBe(PINNACLE.on_hold_reason);
  });

  it('leaves days_parked null on a job that is not parked', () => {
    const [released] = withDaysParked([CLEMTENN], TODAY);
    expect(released.days_parked).toBeNull();
  });
});

// ─── Escalating colour ──────────────────────────────────────────────────────

describe('parkedSeverity thresholds', () => {
  it.each([
    [0, 'fresh'],
    [2, 'fresh'],
    [3, 'watch'], // will-call's own first step
    [6, 'watch'],
    [7, 'late'],
    [13, 'late'],
    [14, 'critical'],
    [23, 'critical'], // Pinnacle today
  ])('%s days reads as %s', (days, expected) => {
    expect(parkedSeverity(days)).toBe(expected);
  });

  it('never gets quieter as a job sits longer', () => {
    // The property that matters on the board: the chip only ever escalates.
    const rank = { fresh: 0, watch: 1, late: 2, critical: 3 } as const;
    let previous = -1;
    for (let days = 0; days <= 40; days++) {
      const current = rank[parkedSeverity(days)];
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('shouts about the two oldest production jobs and not the newest', () => {
    expect(parkedSeverity(daysParked(PINNACLE, TODAY))).toBe('critical'); // 23 days
    expect(parkedSeverity(daysParked(BWC_QA, TODAY))).toBe('late'); // 13 days
    expect(parkedSeverity(daysParked(YELLOWSTONE, localParkDay(YELLOWSTONE)))).toBe('fresh');
  });

  it('gives each step a visibly different chip', () => {
    const classes = [0, 3, 7, 14].map(parkedChipClasses);
    expect(new Set(classes).size).toBe(4);
    expect(parkedChipClasses(23)).toContain('bg-red-600');
    expect(parkedChipClasses(1)).toContain('bg-gray-100');
  });

  it('treats an unknown age as the quietest thing on the card, never a crash', () => {
    expect(parkedSeverity(null)).toBe('fresh');
    expect(parkedSeverity(undefined)).toBe('fresh');
    expect(parkedSeverity(NaN)).toBe('fresh');
    expect(typeof parkedChipClasses(null)).toBe('string');
  });
});

// ─── Wording ────────────────────────────────────────────────────────────────

describe('formatDaysParked', () => {
  it('reads like a person wrote it', () => {
    expect(formatDaysParked(0)).toBe('Parked today');
    expect(formatDaysParked(1)).toBe('1 day parked');
    expect(formatDaysParked(10)).toBe('10 days parked');
    expect(formatDaysParked(23)).toBe('23 days parked');
  });

  it('renders NOTHING rather than "NaN days" when the age is unknown', () => {
    // This is the pre-migration state: schedule_board_view has no on_hold
    // columns yet, so nothing can be computed.
    expect(formatDaysParked(null)).toBeNull();
    expect(formatDaysParked(undefined)).toBeNull();
    expect(formatDaysParked(NaN)).toBeNull();
    expect(formatDaysParked(-1)).toBeNull();
  });
});

describe('formatDaysWorked', () => {
  it('says what the job has already cost', () => {
    expect(formatDaysWorked(5)).toBe('5 days worked so far');
    expect(formatDaysWorked(1)).toBe('1 day worked so far');
  });

  it('stays silent for a job nobody has worked yet', () => {
    // Yellowstone: parked before anyone got a day on it.
    expect(formatDaysWorked(YELLOWSTONE.total_days_worked)).toBeNull();
    expect(formatDaysWorked(null)).toBeNull();
    expect(formatDaysWorked(undefined)).toBeNull();
  });
});

// ─── Degrading before the migration lands ───────────────────────────────────

describe('a board row from before the migration', () => {
  const preMigration = {
    id: 'legacy',
    job_number: 'JOB-2026-111111',
    customer_name: 'Anyone',
  } as ParkedBoardJob;

  it('is simply not parked — no crash, no folder entry, no age', () => {
    expect(isParked(preMigration)).toBe(false);
    expect(partitionParked([preMigration]).parked).toHaveLength(0);
    expect(daysParked(preMigration, TODAY)).toBeNull();
    expect(formatDaysParked(daysParked(preMigration, TODAY))).toBeNull();
  });
});

// ─── Who gets the Restart button ────────────────────────────────────────────

describe('canRestartParkedJob', () => {
  it('admits exactly the roles that can already park a job', () => {
    for (const role of ['super_admin', 'operations_manager', 'admin', 'supervisor', 'salesman']) {
      expect(canRestartParkedJob(role)).toBe(true);
    }
  });

  it('refuses shop_manager, who is read-only on the board', () => {
    expect(canRestartParkedJob('shop_manager')).toBe(false);
  });

  it('refuses the field', () => {
    expect(canRestartParkedJob('operator')).toBe(false);
    expect(canRestartParkedJob('apprentice')).toBe(false);
    expect(canRestartParkedJob('inventory_manager')).toBe(false);
    expect(canRestartParkedJob(null)).toBe(false);
    expect(canRestartParkedJob(undefined)).toBe(false);
    expect(canRestartParkedJob('')).toBe(false);
  });
});

/**
 * ── ONE PERMISSION, FOUR SURFACES, NO DRIFT ─────────────────────────────────
 *
 * The platform's signature defect is a page that admits a role the API refuses,
 * or offers a button the API refuses — the screen shows an error instead of a
 * permission. This feature shipped with both halves of that: the board rendered
 * `canEdit && canRestartParkedJob(role)`, where `canEdit` is three roles plus a
 * feature flag, while the route guard (`requireSalesStaff`), this module's
 * `PARK_RESTART_ROLES` and the `job_phases` RLS policy all name the same five.
 * A salesman the API accepts never saw the button; a flagged operator the API
 * refuses would have seen it.
 *
 * The five roles of `SALES_STAFF_ROLES` are canonical — they are what already
 * governs parking and reactivating a job, and a restart is the same act. These
 * assertions read the OTHER THREE surfaces from source so that changing any one
 * of them alone fails here.
 */
describe('the restart permission is one set, in four places', () => {
  const REPO_ROOT = path.resolve(__dirname, '..');
  const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

  it('PARK_RESTART_ROLES is exactly SALES_STAFF_ROLES — the route guard\'s set', () => {
    expect([...PARK_RESTART_ROLES].sort()).toEqual([...SALES_STAFF_ROLES].sort());
  });

  it('the job_phases RLS policy names the same five roles', () => {
    const sql = read('supabase/migrations/20260820b_park_and_restart.sql');
    const call = sql.match(/current_user_has_role\(([^)]*)\)/);
    expect(call).not.toBeNull();
    const roles = Array.from(call![1].matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
    expect(roles.sort()).toEqual([...PARK_RESTART_ROLES].sort());
  });

  it('the restart route is guarded by requireSalesStaff, not a hand-rolled list', () => {
    expect(read('app/api/admin/jobs/[id]/restart/route.ts')).toContain(
      'await requireSalesStaff(request)'
    );
  });

  it('the board decides the button on the role ALONE, never `canEdit &&`', () => {
    const page = read('app/dashboard/admin/schedule-board/page.tsx');
    expect(page).toContain('canRestart={canRestartParkedJob(userRole)}');
    expect(page).not.toMatch(/canRestart=\{[^}]*canEdit/);
  });
});
