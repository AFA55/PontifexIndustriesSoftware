/**
 * THE PARKED COLUMN — presentation rules for jobs that are sitting still.
 *
 * Leifeng (JOB-2026-400368) sat parked ten days and nobody saw it, because a
 * parked job is simply absent from the board. On the day this was written
 * production held SIX jobs in `on_hold`, five still parked, the oldest since
 * Jul 28 — twenty-three days. The founder's first decision was that they get a
 * column of their own, showing how long each has been sitting.
 *
 * This module is deliberately PURE and shared by the board API and the folder
 * component, so "which jobs are parked" is answered once and identically on
 * both sides of the wire. It owns none of the semantics — `isParked` and
 * `daysParked` live in `lib/job-phases.ts` and are the single predicate — it
 * only owns ORDER, SEVERITY and WORDING.
 */

import { daysParked, isParked, type ParkableJob } from './job-phases';
import { toLocalYMD } from './dates';

/**
 * What the board actually hands around: the park columns plus the couple of
 * fields the card prints. Every one is optional because the view columns are
 * APPENDED by a migration that may not be applied yet — an absent column must
 * degrade to "not parked", never to a crash or a "NaN days" chip.
 */
export interface ParkedBoardJob extends ParkableJob {
  id?: string;
  job_number?: string | null;
  customer_name?: string | null;
  project_name?: string | null;
  /** Owned by `update_total_days_worked` — days this job has PROVEN work on. */
  total_days_worked?: number | null;
}

/**
 * Who may restart a job.
 *
 * Matches the EXISTING park machinery exactly: `/park` and `/reactivate` are
 * guarded by `requireSalesStaff`, and the `job_phases` write policy names the
 * same five roles. Deliberately NOT the schedule-VIEWER set — that admits
 * shop_manager, who is documented read-only and has no business restarting a
 * customer's job. A viewer who cannot use the button must not be shown it.
 */
export const PARK_RESTART_ROLES = [
  'super_admin',
  'operations_manager',
  'admin',
  'supervisor',
  'salesman',
] as const;

export function canRestartParkedJob(role: string | null | undefined): boolean {
  if (!role) return false;
  return (PARK_RESTART_ROLES as readonly string[]).includes(role);
}

/**
 * Longest-sitting first. The whole point of the column is that the oldest job
 * is the one nobody has looked at, so it goes on top.
 *
 * Ties break on job number so the order is stable between renders; a column
 * that reshuffles on every poll is a column the office stops trusting.
 */
export function sortLongestParkedFirst<T extends ParkedBoardJob>(
  jobs: readonly T[]
): T[] {
  return [...jobs].sort((a, b) => {
    const ta = a.on_hold_placed_at ? new Date(a.on_hold_placed_at).getTime() : 0;
    const tb = b.on_hold_placed_at ? new Date(b.on_hold_placed_at).getTime() : 0;
    if (ta !== tb) return ta - tb; // earlier placement = longer sitting = first
    return (a.job_number || '').localeCompare(b.job_number || '');
  });
}

/**
 * Split a board fetch into the jobs that are sitting and the jobs that are
 * moving.
 *
 * THIS IS WHAT STOPS A PARKED JOB DRAWING TWICE. A parked job still satisfies
 * the board's date filter, so without diverting it here it renders in its
 * operator's row AND in the Parked folder — the office would see one job in two
 * places and reasonably conclude the crew is on it.
 */
export function partitionParked<T extends ParkedBoardJob>(
  jobs: readonly T[]
): { parked: T[]; moving: T[] } {
  const parked: T[] = [];
  const moving: T[] = [];
  for (const job of jobs) {
    if (isParked(job)) parked.push(job);
    else moving.push(job);
  }
  return { parked: sortLongestParkedFirst(parked), moving };
}

export type ParkedSeverity = 'fresh' | 'watch' | 'late' | 'critical';

/**
 * How loud the days chip gets.
 *
 * The 3-day and 7-day steps are borrowed verbatim from the will-call folder's
 * "days waiting" chip, because the office already reads that grammar. The
 * 14-day step is new and exists because will-call never had to describe
 * twenty-three days of silence: at a fortnight the chip stops being a tint and
 * becomes a solid red block, which is the only thing that would have caught
 * Leifeng before the tenth day.
 */
export function parkedSeverity(days: number | null | undefined): ParkedSeverity {
  if (typeof days !== 'number' || !Number.isFinite(days)) return 'fresh';
  if (days >= 14) return 'critical';
  if (days >= 7) return 'late';
  if (days >= 3) return 'watch';
  return 'fresh';
}

const SEVERITY_CLASSES: Record<ParkedSeverity, string> = {
  critical: 'bg-red-600 text-white',
  late: 'bg-red-100 text-red-700',
  watch: 'bg-orange-100 text-orange-700',
  fresh: 'bg-gray-100 text-gray-600',
};

export function parkedChipClasses(days: number | null | undefined): string {
  return SEVERITY_CLASSES[parkedSeverity(days)];
}

/**
 * The chip's words. `null` when the number is unknowable — which happens when
 * the migration appending the on_hold columns to `schedule_board_view` has not
 * been applied. Rendering nothing beats rendering "NaN days".
 */
export function formatDaysParked(days: number | null | undefined): string | null {
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) return null;
  if (days === 0) return 'Parked today';
  if (days === 1) return '1 day parked';
  return `${days} days parked`;
}

/** "3 days worked so far" — the cost already sunk into a job that is not moving. */
export function formatDaysWorked(total: number | null | undefined): string | null {
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return null;
  return `${total} ${total === 1 ? 'day' : 'days'} worked so far`;
}

/**
 * Attach `days_parked` to each parked job, computed against a caller-supplied
 * calendar day.
 *
 * The API passes the TENANT's today (not UTC's, not the server's) so the number
 * the office reads is the number of days it has actually lived through.
 */
export function withDaysParked<T extends ParkedBoardJob>(
  jobs: readonly T[],
  today: string = toLocalYMD()
): (T & { days_parked: number | null })[] {
  return jobs.map((job) => ({ ...job, days_parked: daysParked(job, today) }));
}
