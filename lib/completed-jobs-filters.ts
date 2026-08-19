/**
 * lib/completed-jobs-filters.ts — WHO finished it and WHEN it finished, for the
 * Completed Jobs Archive.
 *
 * Founder, Aug 19 2026: "I would like to be able to filter completed jobs —
 * filter by project manager, and filter by date newest to old."
 *
 * ── WHICH FIELD IS THE PROJECT MANAGER ────────────────────────────────────────
 * NOT `job_orders.project_manager_id`. That column exists and is NULL on all 18
 * completed jobs in production — filtering on it would render an empty screen
 * that reads as a broken page rather than as an empty filter. The name the
 * office actually recognises is `salesman_name` (populated on 17 of 18), the
 * same column the two printed tickets show as "Quoted By". The 18th row has no
 * `salesman_name` but does have `created_by`, so this file reuses the exact
 * fallback the tickets use (lib/job-ticket-quoted-by.ts): the column, else the
 * full name of the profile behind `created_by`. Two surfaces naming the same
 * person differently is how the office stops trusting either one.
 *
 * ── WHICH DATE IS "NEWEST" ────────────────────────────────────────────────────
 * "When this job actually finished", which no single column carries:
 *   work_completed_at       10/18   the crew's finish stamp
 *   completion_submitted_at  9/18   jobs finished via the newer flow have ONLY this
 *   completion_signed_at     9/18   the customer's signature
 *   office_completed_at      0/18   the office close (none yet, but it will happen)
 * Between them every completed job in production has at least one, but that is a
 * fact about today's data and not a guarantee, so a job carrying none falls back
 * to the bare `end_date` / `scheduled_date` calendar day, and a job with neither
 * sorts LAST in BOTH directions — an undated row must never masquerade as the
 * newest thing the crew finished.
 *
 * Pure: no DB, no network, so every rule here is unit-tested in
 * completed-jobs-filters.test.ts.
 */

import { parseYMDLocal } from './dates';

export interface CompletedJobLike {
  job_number?: string | null;
  /** The RAW column. The office types this into the schedule form's "Submitted By". */
  salesman_name?: string | null;
  /** Fallback identity — the profile that filled the form. */
  created_by?: string | null;
  work_completed_at?: string | null;
  completion_submitted_at?: string | null;
  completion_signed_at?: string | null;
  office_completed_at?: string | null;
  /** Bare 'YYYY-MM-DD' columns. NEVER new Date() these — parseYMDLocal only. */
  end_date?: string | null;
  scheduled_date?: string | null;
}

/** Sentinel for "this job names nobody", so it is filterable instead of invisible. */
export const NO_PROJECT_MANAGER = '__none__';

export const NO_PROJECT_MANAGER_LABEL = 'No project manager';

export type SortDirection = 'newest' | 'oldest';

export function isSortDirection(v: unknown): v is SortDirection {
  return v === 'newest' || v === 'oldest';
}

/** Names keyed by profile id, for the `created_by` fallback. */
export type CreatorNames = Record<string, string>;

/**
 * The project manager's display name, or null when the job names nobody.
 * Mirrors resolveQuotedBy() so this screen and the printed ticket agree.
 */
export function projectManagerOf(
  job: CompletedJobLike,
  creatorNames: CreatorNames = {}
): string | null {
  const direct = String(job.salesman_name ?? '').trim();
  if (direct) return direct;
  const createdBy = String(job.created_by ?? '').trim();
  if (!createdBy) return null;
  const viaCreator = String(creatorNames[createdBy] ?? '').trim();
  return viaCreator || null;
}

/**
 * Every project manager who actually HAS a completed job, A–Z.
 *
 * Derived from the rows on screen rather than from the profiles table on
 * purpose: an option built this way can never be a dead one, because the job
 * that produced it is sitting right there behind the filter.
 */
export function projectManagerOptions(
  jobs: CompletedJobLike[],
  creatorNames: CreatorNames = {}
): string[] {
  const seen = new Set<string>();
  for (const job of jobs) {
    const name = projectManagerOf(job, creatorNames);
    if (name) seen.add(name);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

export function matchesProjectManager(
  job: CompletedJobLike,
  selected: string | null,
  creatorNames: CreatorNames = {}
): boolean {
  if (!selected) return true;
  const name = projectManagerOf(job, creatorNames);
  if (selected === NO_PROJECT_MANAGER) return name === null;
  return name === selected;
}

/**
 * WHEN the job finished, and what KIND of value said so — the screen has to
 * print the same moment it sorted by, or the list looks shuffled.
 *   'timestamp' — a real completion instant (ISO string, render as date-time)
 *   'date'      — only a bare calendar day survives (render via formatDay)
 *   'none'      — nothing dates this job; it sorts last and prints '—'
 */
export type CompletionMoment =
  | { kind: 'timestamp'; iso: string; ms: number }
  | { kind: 'date'; ymd: string; ms: number }
  | { kind: 'none'; ms: null };

const NO_MOMENT: CompletionMoment = { kind: 'none', ms: null };

export function completionMoment(job: CompletedJobLike): CompletionMoment {
  const stamps = [
    job.work_completed_at,
    job.completion_submitted_at,
    job.completion_signed_at,
    job.office_completed_at,
  ];
  for (const stamp of stamps) {
    const iso = String(stamp ?? '').trim();
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (!Number.isNaN(ms)) return { kind: 'timestamp', iso, ms };
  }
  for (const day of [job.end_date, job.scheduled_date]) {
    const ymd = String(day ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
    const ms = parseYMDLocal(ymd).getTime();
    if (!Number.isNaN(ms)) return { kind: 'date', ymd, ms };
  }
  return NO_MOMENT;
}

/**
 * Newest first by default. Undated jobs are pinned to the END in BOTH
 * directions: "oldest first" must not promote a row whose age nobody knows.
 * Job number breaks ties so the order is stable across reloads.
 */
export function sortByCompletion<T extends CompletedJobLike>(
  jobs: T[],
  direction: SortDirection = 'newest'
): T[] {
  return [...jobs].sort((a, b) => {
    const am = completionMoment(a).ms;
    const bm = completionMoment(b).ms;
    if (am === null || bm === null) {
      if (am === bm) return String(a.job_number ?? '').localeCompare(String(b.job_number ?? ''));
      return am === null ? 1 : -1;
    }
    if (am !== bm) return direction === 'newest' ? bm - am : am - bm;
    return String(a.job_number ?? '').localeCompare(String(b.job_number ?? ''));
  });
}
