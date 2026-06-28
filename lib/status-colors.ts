/**
 * Canonical SEMANTIC / categorical status -> Tailwind class maps.
 *
 * These are intentionally as-is colors (green = good/done, amber/yellow = warning,
 * red = bad/expired, blue/purple = in-flight, gray = neutral/unknown). They are
 * NOT brand tokens and should not be converted to brand colors — the color *is*
 * the meaning.
 *
 * This module de-duplicates the `getStatusColor()` / `statusColor()` switch
 * statements that were copy-pasted across several admin pages. Each helper below
 * reproduces a specific call site's existing output exactly; pages with their own
 * distinct color scheme keep their own helper here rather than being force-merged
 * (merging conflicting colors would change the UI).
 *
 * Normalization note: job status comes from the DB in both hyphen (`in-route`)
 * and underscore (`in_progress`) forms depending on the source. Helpers that need
 * to accept both call `normalizeStatusKey()`.
 */

/** Lowercase a status and unify hyphen/underscore so `in-route` === `in_route`. */
export function normalizeStatusKey(status: string | null | undefined): string {
  return (status ?? '').toLowerCase().replace(/-/g, '_');
}

// ── Live operator status (solid color bar / pill) ─────────────────────────────
// Used by the Operators live board: clocked_in / en_route / in_progress / job_completed.
const LIVE_OPERATOR_STATUS_BG: Record<string, string> = {
  clocked_in: 'bg-green-500',
  en_route: 'bg-blue-500',
  in_progress: 'bg-orange-500',
  job_completed: 'bg-purple-500',
};

/** Solid background for the live-operator status board. Default gray-500. */
export function liveOperatorStatusBg(status: string): string {
  return LIVE_OPERATOR_STATUS_BG[status] ?? 'bg-gray-500';
}

// ── Schedule status (solid color dot) ─────────────────────────────────────────
// Used by Upcoming Projects: confirmed / pending_approval / tentative.
const SCHEDULE_STATUS_BG: Record<string, string> = {
  confirmed: 'bg-green-500',
  pending_approval: 'bg-yellow-500',
  tentative: 'bg-blue-500',
};

/** Solid background for the upcoming-projects schedule status. Default gray-500. */
export function scheduleStatusBg(status: string): string {
  return SCHEDULE_STATUS_BG[status] ?? 'bg-gray-500';
}

// ── Job lifecycle status (solid bg + border) ──────────────────────────────────
// Used by the job-schedule detail tabs: scheduled / in-route / in-progress / completed.
const JOB_STATUS_SOLID: Record<string, string> = {
  scheduled: 'bg-blue-500 border-blue-600',
  in_route: 'bg-yellow-500 border-yellow-600',
  in_progress: 'bg-orange-500 border-orange-600',
  completed: 'bg-green-500 border-green-600',
};

/** Solid bg + border for the job-schedule status pills. Accepts hyphen/underscore. */
export function jobStatusSolidClasses(status: string): string {
  return JOB_STATUS_SOLID[normalizeStatusKey(status)] ?? 'bg-gray-500 border-gray-600';
}

// ── Job lifecycle status (soft badge: bg-50 / text-700 / border-200) ───────────
// Used by Operator Profiles job rows.
const JOB_STATUS_SOFT: Record<string, string> = {
  completed: 'bg-green-50 text-green-700 border-green-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  scheduled: 'bg-purple-50 text-purple-700 border-purple-200',
  assigned: 'bg-purple-50 text-purple-700 border-purple-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

/** Soft badge classes for job status (operator-profiles style). Default gray. */
export function jobStatusSoftClasses(status: string): string {
  return JOB_STATUS_SOFT[normalizeStatusKey(status)] ?? 'bg-gray-50 text-gray-700 border-gray-200';
}

// ── Job lifecycle status (light pill: bg-100 / text-700, no border) ────────────
// Used by the ProfileDetailDrawer job rows.
const JOB_STATUS_PILL: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  in_progress: 'bg-blue-100 text-blue-700',
  scheduled: 'bg-purple-100 text-purple-700',
  assigned: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-red-100 text-red-700',
};

/** Light pill classes for job status (drawer style). Default gray. */
export function jobStatusPillClasses(status: string): string {
  return JOB_STATUS_PILL[normalizeStatusKey(status)] ?? 'bg-gray-100 text-gray-700';
}

// ── Facility badge / credential status (light pill + dark mode) ───────────────
// Used by Facilities: active / expired / revoked / pending.
const CREDENTIAL_STATUS: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  expired: 'bg-red-100 text-red-700 dark:bg-rose-500/15 dark:text-rose-300',
  revoked: 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/60',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-amber-500/15 dark:text-amber-300',
};

/** Credential/badge status classes (facilities style, dark-mode aware). Default gray. */
export function credentialStatusClasses(status: string): string {
  return CREDENTIAL_STATUS[status] ?? 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/60';
}

// ── Credential expiry status (green/amber/red soft badge) ─────────────────────
// Used by the ProfileDetailDrawer badge expiry: valid / expiring_soon / expired.
const EXPIRY_STATUS: Record<string, string> = {
  valid: 'bg-green-100 text-green-700 border-green-200',
  expiring_soon: 'bg-amber-100 text-amber-700 border-amber-200',
  expired: 'bg-red-100 text-red-700 border-red-200',
};

/** Expiry status (valid/expiring_soon/expired) soft badge. Default gray "no expiry". */
export function expiryStatusClasses(expiryStatus: string): string {
  return EXPIRY_STATUS[expiryStatus] ?? 'bg-gray-100 text-gray-600 border-gray-200';
}
