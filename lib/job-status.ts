/**
 * lib/job-status.ts
 *
 * Pure helpers for hardening operator job status-transition handling.
 *
 * Goals:
 *  - A canonical forward-only ordering of the job lifecycle so we can detect
 *    illogical / backwards transitions.
 *  - Timestamp validation so a corrupted or retried request can't write a
 *    timestamp far in the future or wildly in the past.
 *
 * These functions are intentionally pure (no I/O) so they are trivially unit
 * testable and safe to call from any route. They are CONSERVATIVE: when a
 * transition is ambiguous they err toward "permissive" so we never block a
 * legitimate live operator flow — callers decide whether to warn or reject.
 */

/** All recognized job statuses. */
export type JobStatus =
  | 'pending_approval'
  | 'scheduled'
  | 'assigned'
  | 'in_route'
  | 'on_site'
  | 'in_progress'
  | 'pending_completion'
  | 'completed'
  | 'cancelled'
  | 'archived';

/**
 * Forward-only rank for the linear operator pipeline. Higher = later.
 *
 * `cancelled` / `archived` are terminal side-states and deliberately get a
 * very high rank so nothing "advances" out of them, but they are excluded
 * from the monotonic forward check (handled separately) since they are not
 * part of the normal walk.
 */
export const STATUS_RANK: Record<JobStatus, number> = {
  pending_approval: 0,
  scheduled: 1,
  assigned: 2,
  in_route: 3,
  on_site: 4,
  in_progress: 5,
  pending_completion: 6,
  completed: 7,
  archived: 8,
  cancelled: 9,
};

/** Terminal states the pipeline cannot advance out of via the operator flow. */
const TERMINAL_STATES: ReadonlySet<JobStatus> = new Set<JobStatus>([
  'completed',
  'cancelled',
  'archived',
]);

/**
 * The set of timestamp columns on job_orders that map to a given status. Used
 * by callers to know which "first transition" timestamp to stamp server-side.
 */
export const STATUS_TIMESTAMP_FIELD: Partial<Record<JobStatus, string>> = {
  in_route: 'in_route_at',
  on_site: 'arrived_at_jobsite_at',
  in_progress: 'work_started_at',
  completed: 'work_completed_at',
};

/** Max minutes a client-supplied timestamp may lead the server clock. */
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000; // 5 minutes
/** Max age (ms) a client-supplied timestamp may predate the server clock. */
export const MAX_PAST_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === 'string' && value in STATUS_RANK;
}

/**
 * Returns true if moving `from` -> `to` is a sane (non-backwards) transition.
 *
 * Rules:
 *  - Unknown statuses are treated permissively (return true) so we never hard
 *    block an unexpected-but-legitimate state the DB allows.
 *  - A no-op (`from === to`) is allowed (idempotent retries).
 *  - Moving INTO a terminal state is always allowed.
 *  - Moving OUT of a terminal state is disallowed (e.g. completed -> in_route),
 *    EXCEPT `pending_completion`/admin reopen paths are not terminal here.
 *  - Otherwise the rank must be non-decreasing (forward-only).
 */
export function isValidTransition(from: unknown, to: unknown): boolean {
  if (!isJobStatus(to)) return true; // permissive: let caller/DB decide
  if (!isJobStatus(from)) return true; // unknown current state — don't block
  if (from === to) return true; // idempotent

  // Entering a terminal state is fine from anywhere forward.
  if (TERMINAL_STATES.has(to)) {
    // but you can't go cancelled -> archived backwards in rank; archived(8) >
    // cancelled(9) so guard explicitly: allow completed->archived only.
    if (from === 'completed' && to === 'archived') return true;
    if (TERMINAL_STATES.has(from)) return false; // no terminal -> terminal hops
    return true;
  }

  // Leaving a terminal state toward a non-terminal state is backwards.
  if (TERMINAL_STATES.has(from)) return false;

  // Otherwise forward-only by rank.
  return STATUS_RANK[to] >= STATUS_RANK[from];
}

/**
 * Validate a client-supplied timestamp against the server clock.
 *
 * Returns:
 *  - a normalized ISO string (clamped to `now` if it was in the future within
 *    tolerance is NOT applied — future beyond skew is rejected) when valid,
 *  - `null` when the value is unparseable, too far in the future, or too far
 *    in the past — signalling the caller should fall back to a server-side
 *    `new Date()` instead of trusting the client.
 *
 * @param ts  the candidate timestamp (string | number | Date | null)
 * @param now reference "now" (defaults to current server time)
 */
export function validateTransitionTimestamp(
  ts: unknown,
  now: Date = new Date()
): string | null {
  if (ts === null || ts === undefined || ts === '') return null;

  let parsed: Date;
  if (ts instanceof Date) {
    parsed = ts;
  } else if (typeof ts === 'number') {
    parsed = new Date(ts);
  } else if (typeof ts === 'string') {
    parsed = new Date(ts);
  } else {
    return null;
  }

  const t = parsed.getTime();
  if (Number.isNaN(t)) return null;

  const nowMs = now.getTime();

  // Reject timestamps too far in the future (clock skew / corruption).
  if (t > nowMs + MAX_FUTURE_SKEW_MS) return null;

  // Reject timestamps absurdly in the past (stale retry / corruption).
  if (t < nowMs - MAX_PAST_AGE_MS) return null;

  return parsed.toISOString();
}
