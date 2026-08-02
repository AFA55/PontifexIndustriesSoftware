/**
 * Completion-aware smart clock-out reminder — pure logic.
 *
 * Operators forget to clock out after finishing their job ticket. The
 * clock-out-reminders cron nudges them ~30 minutes after their LAST ticket of
 * the day completes (job `work_completed_at` for single/final days, or
 * `daily_job_logs.day_completed_at` for a multi-day "Done for Today"), with
 * the delay stretched for long drives back to the shop so the nudge lands
 * around when they arrive, not mid-drive.
 *
 * Everything here is pure + unit-tested (lib/clock-out-reminder.test.ts); the
 * cron route (app/api/cron/clock-out-reminders/route.ts) does the queries and
 * delivery. Follows the reminder-timing.ts pattern.
 */

import { calculateDistance } from '@/lib/geolocation';

// ── Tunables ─────────────────────────────────────────────────────────────────

/** Never remind sooner than this after the last ticket completes. */
export const MIN_REMINDER_DELAY_MINUTES = 30;
/** Never wait longer than this, no matter how long the drive back is. */
export const MAX_REMINDER_DELAY_MINUTES = 120;
/** Slack added on top of the drive time (park, unload, walk in). */
export const DRIVE_BUFFER_MINUTES = 10;
/** Admin escalation fires this long AFTER the operator reminder threshold. */
export const ESCALATION_AFTER_MINUTES = 60;

/**
 * Statuses that stop a not-yet-completed job from counting as "unfinished".
 * MUST stay in sync with BOTH lists in the clock-out gate
 * (app/api/timecard/clock-out/route.ts — `.not('status', 'in', ...)`):
 * the helper list additionally excludes 'on_hold' because a job parked to
 * Pending must not leave a helper counted as "still has a ticket" (that
 * exact state left helpers hard-stuck in production once already).
 */
export const OPERATOR_UNFINISHED_EXCLUDED_STATUSES = [
  'cancelled',
  'completed',
  'pending_completion',
] as const;
export const HELPER_UNFINISHED_EXCLUDED_STATUSES = [
  'cancelled',
  'on_hold',
  'pending_completion',
  'completed',
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

/** The job_orders columns this feature reads. */
export interface ReminderJob {
  id: string;
  job_number: string | null;
  status: string | null;
  work_completed_at: string | null;
  drive_time: number | null; // minutes, trigger-computed (route_started_at → work_started_at); proxy for the drive back
  jobsite_latitude: number | null;
  jobsite_longitude: number | null;
}

/** One possible "they finished at this instant" event. */
export interface CompletionCandidate {
  /** ISO timestamp (job.work_completed_at or daily_job_logs.day_completed_at). */
  at: string | null;
  /** The job the completion belongs to (drives the drive-time lookup). */
  job: ReminderJob | null;
}

export interface CompletionInstant {
  atMs: number;
  job: ReminderJob | null;
}

// ── Predicates ───────────────────────────────────────────────────────────────

/**
 * Mirror of the clock-out route's unfinished-ticket predicate: a dispatched
 * job still blocks ("don't nag between jobs") when it has no completion
 * timestamp, isn't in a terminal/cancelled status, and has no "Done for
 * Today" daily log for the shift date. `workerSlot` picks the status list:
 * the worker's relationship to THIS job (lead operator vs helper/crew), not
 * their profile role.
 */
export function isJobUnfinished(
  job: Pick<ReminderJob, 'status' | 'work_completed_at'>,
  hasDailyLogForDate: boolean,
  workerSlot: 'operator' | 'helper' = 'operator'
): boolean {
  if (job.work_completed_at) return false;
  const excluded: readonly string[] =
    workerSlot === 'helper'
      ? HELPER_UNFINISHED_EXCLUDED_STATUSES
      : OPERATOR_UNFINISHED_EXCLUDED_STATUSES;
  if (job.status && excluded.includes(job.status)) return false;
  return !hasDailyLogForDate;
}

/**
 * Pick the LATEST completion instant among candidates, ignoring anything that
 * predates the open timecard's clock-in (a completion stamped on a previous
 * shift must never trigger a reminder on today's card — this is also what
 * makes night shifts safe across midnight). Returns null when the user has no
 * completion this shift (the existing 10/12/15h elapsed reminders cover that).
 */
export function resolveCompletionInstant(
  candidates: CompletionCandidate[],
  clockInIso: string | null
): CompletionInstant | null {
  const clockInMs = clockInIso ? Date.parse(clockInIso) : NaN;
  let best: CompletionInstant | null = null;
  for (const c of candidates) {
    if (!c.at) continue;
    const ms = Date.parse(c.at);
    if (!Number.isFinite(ms)) continue;
    if (Number.isFinite(clockInMs) && ms < clockInMs) continue; // previous shift
    if (!best || ms > best.atMs) best = { atMs: ms, job: c.job };
  }
  return best;
}

// ── Drive time / delay ───────────────────────────────────────────────────────

/**
 * Straight-line → drive-minutes heuristic, same numbers as lib/drive-time.ts'
 * fallback (road factor 1.3, ~28 mph local). Deliberately NOT the Google
 * Routes API — this runs inside a cron loop (cost/latency).
 */
export function estimateDriveMinutesFromCoords(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const straightMiles = calculateDistance(fromLat, fromLng, toLat, toLng) / 1609.344;
  const roadMiles = straightMiles * 1.3;
  const ASSUMED_LOCAL_MPH = 28;
  return Math.max(1, Math.round((roadMiles / ASSUMED_LOCAL_MPH) * 60));
}

/**
 * Drive minutes jobsite → shop for the completed job:
 * scheduled `drive_time` column if set, else a haversine estimate when the
 * job has geocoded coordinates, else null (no drive data → base delay).
 */
export function driveMinutesForJob(
  job: Pick<ReminderJob, 'drive_time' | 'jobsite_latitude' | 'jobsite_longitude'> | null,
  shop: { latitude: number; longitude: number } | null
): number | null {
  if (!job) return null;
  if (typeof job.drive_time === 'number' && Number.isFinite(job.drive_time) && job.drive_time > 0) {
    return job.drive_time;
  }
  if (shop && job.jobsite_latitude != null && job.jobsite_longitude != null) {
    return estimateDriveMinutesFromCoords(
      job.jobsite_latitude,
      job.jobsite_longitude,
      shop.latitude,
      shop.longitude
    );
  }
  return null;
}

/**
 * Minutes to wait after the last completion before reminding:
 * clamp(max(30, drive + 10), 30, 120). No drive data → 30. A 45-min drive →
 * 55 (the nudge lands roughly when they're back at the shop, not mid-drive).
 */
export function reminderDelayMinutes(driveMinutes: number | null | undefined): number {
  const drive =
    typeof driveMinutes === 'number' && Number.isFinite(driveMinutes) && driveMinutes > 0
      ? driveMinutes
      : 0;
  return Math.min(
    MAX_REMINDER_DELAY_MINUTES,
    Math.max(MIN_REMINDER_DELAY_MINUTES, drive + DRIVE_BUFFER_MINUTES)
  );
}

// ── Copy helpers ─────────────────────────────────────────────────────────────

/** "about 35 minutes ago" / "about an hour ago" / "about 3 hours ago". */
export function formatMinutesAgo(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `about ${m} minutes ago`;
  if (m < 105) return 'about an hour ago';
  return `about ${Math.round(m / 60)} hours ago`;
}
