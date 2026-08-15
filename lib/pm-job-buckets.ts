/**
 * UPCOMING / ACTIVE / COMPLETED — the Project Manager's three piles.
 *
 * The founder asked for "upcoming jobs, active jobs and completed jobs right on
 * their dashboard". The words are obvious; the boundaries are not, and getting
 * them wrong is how a job disappears from every list at once.
 *
 * THE RULE, in the order it is applied to each job:
 *
 *   0. `cancelled` / `archived` / soft-deleted are dropped entirely. They are
 *      not three piles plus a fourth — they are not the PM's work any more.
 *   1. status `completed`               → COMPLETED   (newest finish first)
 *   2. no start date, or start > today  → UPCOMING    (unscheduled sorts last)
 *   3. everything else                  → ACTIVE
 *
 * Rule 3 is deliberately the catch-all rather than a second date test, because
 * a date test leaves holes and a job that falls in a hole is invisible. Two
 * kinds of job land in ACTIVE without being worked today:
 *
 *   • A Monday–Friday job on a Saturday. `jobRunsOn` (lib/job-workdays.ts) says
 *     false — a span does not occupy a weekend unless the job carries
 *     `scheduling_flexibility.can_work_weekends`. The job is still running, it
 *     just is not being worked, so it stays in ACTIVE with `runs_today: false`
 *     and the UI says so.
 *   • A job whose end date has passed but which nobody closed out. Still open
 *     work, still the PM's problem, `runs_today: false`.
 *
 * Both are surfaced, never silently dropped.
 */

import { jobRunsOn, type JobSpan } from './job-workdays';

/** Statuses that mean "not this PM's work any more". */
export const PM_EXCLUDED_STATUSES = ['cancelled', 'archived'] as const;

export interface PmJob extends JobSpan {
  id: string;
  job_number: string | null;
  title?: string | null;
  customer_name: string | null;
  status: string;
  scheduled_date: string | null;
  end_date?: string | null;
  operator_name?: string | null;
  /** ISO timestamp the job was finished, when we have one. */
  completed_at?: string | null;
}

export interface PmActiveJob extends PmJob {
  /**
   * Is this job actually being worked on `today`? False on a weekend for a job
   * that does not work weekends, and false once its end date has passed with
   * nobody closing it out.
   */
  runs_today: boolean;
}

export interface PmJobBuckets {
  upcoming: PmJob[];
  active: PmActiveJob[];
  completed: PmJob[];
}

function isExcluded(status: string | null | undefined): boolean {
  return !!status && (PM_EXCLUDED_STATUSES as readonly string[]).includes(status);
}

/** Bare 'YYYY-MM-DD' strings sort correctly as strings — no Date needed. */
function byDateAsc(a: PmJob, b: PmJob): number {
  // Unscheduled jobs sort last: a PM who has not put a date on it still needs
  // to see it, but not above the work that has one.
  if (!a.scheduled_date && !b.scheduled_date) return 0;
  if (!a.scheduled_date) return 1;
  if (!b.scheduled_date) return -1;
  return a.scheduled_date < b.scheduled_date ? -1 : a.scheduled_date > b.scheduled_date ? 1 : 0;
}

/** Most recently finished first. Falls back to the scheduled day when we have no timestamp. */
function byCompletedDesc(a: PmJob, b: PmJob): number {
  const av = a.completed_at ?? a.scheduled_date ?? '';
  const bv = b.completed_at ?? b.scheduled_date ?? '';
  if (av === bv) return 0;
  return av > bv ? -1 : 1;
}

/**
 * Split a PM's jobs into the three piles.
 *
 * `todayYMD` is a bare local 'YYYY-MM-DD' — pass the TENANT's today, never
 * `new Date().toISOString()`, or the buckets flip a day early in US timezones.
 */
export function bucketPmJobs(jobs: PmJob[], todayYMD: string): PmJobBuckets {
  const upcoming: PmJob[] = [];
  const active: PmActiveJob[] = [];
  const completed: PmJob[] = [];

  for (const job of jobs ?? []) {
    if (isExcluded(job.status)) continue;

    if (job.status === 'completed') {
      completed.push(job);
      continue;
    }

    if (!job.scheduled_date || job.scheduled_date > todayYMD) {
      upcoming.push(job);
      continue;
    }

    active.push({ ...job, runs_today: jobRunsOn(job, todayYMD) });
  }

  upcoming.sort(byDateAsc);
  active.sort(byDateAsc);
  completed.sort(byCompletedDesc);

  return { upcoming, active, completed };
}

/** Which bucket a single job lands in — the same rule, for one row. */
export function pmJobBucketOf(job: PmJob, todayYMD: string): 'upcoming' | 'active' | 'completed' | null {
  if (isExcluded(job.status)) return null;
  if (job.status === 'completed') return 'completed';
  if (!job.scheduled_date || job.scheduled_date > todayYMD) return 'upcoming';
  return 'active';
}
