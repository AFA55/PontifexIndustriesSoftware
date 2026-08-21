import fs from 'fs';
import path from 'path';

/**
 * ── EVERY WAY BACK ONTO THE SCHEDULE MUST RELEASE THE PARK ──────────────────
 *
 * The recurring defect in this codebase is something built and never connected.
 * Eight instances in one week, including one where a new rule ran in three
 * places and there was a fourth. `releaseParkedJobFields()` is exactly the
 * shape that keeps happening: a small rule that has to fire at several call
 * sites, where missing one is invisible — `tsc` passes, the build passes, and
 * the only symptom is a job quietly sitting parked with a named man on it.
 *
 * That is not hypothetical. It already happened: JOB-2026-974669 (ClemTenn) sat
 * `on_hold` from Aug 14 with `on_hold_released_at` null while the office placed
 * Conrade on it for Aug 20.
 *
 * So this test does not check the four sites I happen to know about. It SCANS
 * the source for the shape of the problem — any write to `job_orders` that sets
 * a scheduling or crewing column — and requires each one to either release the
 * park or be on the allowlist below with a reason. A future route that puts a
 * job back on the calendar fails this test on the day it is written, which is
 * the only moment the omission is cheap.
 */

const REPO_ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'lib'];

/** Columns whose assignment means "this job is on the calendar / has a crew". */
const SCHEDULING_COLUMNS = [
  'scheduled_date',
  'scheduled_end_date',
  'end_date',
  'assigned_to',
  'helper_assigned_to',
];

/**
 * Files that write a scheduling column but must NOT release a park, each with
 * the reason. Anything not here has to call the helper.
 */
const ALLOWLIST: Record<string, string> = {
  // Approving a pending_approval submission. `on_hold` is not reachable from
  // pending_approval, so there is no park to release.
  'app/api/admin/job-orders/[id]/approve/route.ts': 'approval out of pending_approval',

  // Applies an approved change request's dates. A change request cannot be
  // raised against a parked job; the restart flow owns those.
  'app/api/admin/job-change-requests/[id]/route.ts': 'change-request application',

  // Reads the day ledger each morning and syncs the lead onto job_orders. Its
  // own fetch filters `.in('status', ['scheduled','assigned','in_progress'])`,
  // so a parked job never reaches the update — and by the time this runs, the
  // crewing path that placed the ledger row has already released the park.
  'lib/dispatch.ts': 'cannot reach a parked job (status filter on its fetch)',

  // IS the release, and more besides: it re-dates the job, swaps the scope and
  // opens a new phase in one statement. It sets `on_hold: false` and
  // `on_hold_released_at` inline because it also decides the status from the
  // crew, so delegating would be a round trip to compute what it already knows.
  'app/api/admin/jobs/[id]/restart/route.ts': 'the restart path — releases inline',

  // ── Scan false positives ────────────────────────────────────────────────
  // The scan is deliberately coarse: it looks for `job_orders`, `.update(` and
  // a scheduling-column assignment ANYWHERE in the file. These four name the
  // columns in a type declaration or a response payload and never update a
  // scheduling column. Over-reporting is the right failure mode here — a false
  // positive costs one line with a reason; a false negative is the bug.
  'app/api/timecard/clock-in/route.ts': 'names scheduled_date in a response payload only',
  'app/api/job-orders/[id]/generate-completion-pdf/route.ts':
    'names scheduled_date in a PDF payload only',
  'app/dashboard/admin/completed-job-tickets/[id]/page.tsx': 'type declaration only',
  'app/dashboard/admin/debug/active-jobs/page.tsx': 'type declaration only',
  'app/api/admin/schedule-form/route.ts':
    'INSERTs a new job; its only update() sets customer_id — a job cannot be parked before it exists',
};

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === '.claude') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Does this file UPDATE job_orders with a scheduling column?
 *
 * Deliberately coarse — it looks for a `job_orders` reference, an `.update(`,
 * and a scheduling column assignment in the same file. A coarse scan that
 * over-reports is the right trade here: a false positive costs one allowlist
 * line with a reason, while a false negative is the bug this exists to catch.
 */
function writesSchedulingColumn(source: string): boolean {
  if (!source.includes("'job_orders'")) return false;
  if (!source.includes('.update(')) return false;
  return SCHEDULING_COLUMNS.some((col) =>
    new RegExp(`(^|[^\\w.])${col}\\s*:`, 'm').test(source)
  );
}

describe('un-park coverage — no fourth place', () => {
  const offenders: string[] = [];
  const allowlistUsed = new Set<string>();

  const files = SCAN_DIRS.flatMap((d) => walk(path.join(REPO_ROOT, d)));

  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');
    if (!writesSchedulingColumn(source)) continue;

    if (rel in ALLOWLIST) {
      allowlistUsed.add(rel);
      continue;
    }
    if (source.includes('releaseParkedJobFields')) continue;
    offenders.push(rel);
  }

  it('scanned a meaningful number of files (the scan itself still works)', () => {
    // If a refactor moves these directories, the scan would silently pass by
    // finding nothing. Assert it is actually looking at the codebase.
    expect(files.length).toBeGreaterThan(200);
  });

  it('every job_orders write that schedules or crews a job releases the park', () => {
    expect(offenders).toEqual([]);
  });

  it('the allowlist has no stale entries', () => {
    const stale = Object.keys(ALLOWLIST).filter((f) => !allowlistUsed.has(f));
    expect(stale).toEqual([]);
  });

  it('covers every path the ClemTenn bug could have taken', () => {
    // Named explicitly so that deleting the helper from any one of them fails
    // with a message that says which.
    const mustRelease = [
      'lib/reassign.ts', // per-day crewing (assign + reorder both route here)
      'app/api/admin/schedule-board/assign/route.ts', // legacy direct crewing
      'app/api/admin/schedule-board/reorder/route.ts', // legacy direct reorder
      'app/api/admin/job-orders/[id]/route.ts', // board date move
      'app/api/admin/jobs/[id]/schedule/route.ts', // dedicated schedule route
      'app/api/job-orders/[id]/route.ts', // inline board editor
      'app/api/admin/schedule-board/auto-schedule/route.ts', // THE FOURTH PLACE
      'app/api/job-orders/[id]/status/route.ts', // operator presses In Route
    ];
    for (const rel of mustRelease) {
      const source = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect(`${rel}: ${source.includes('releaseParkedJobFields')}`).toBe(`${rel}: true`);
    }
  });
});
