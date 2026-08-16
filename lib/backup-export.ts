/**
 * The decisions the nightly export makes, kept pure so they can be tested
 * without a database or a bucket. See app/api/cron/backup-export/route.ts.
 */

/**
 * Tables NOT worth carrying off-site every night.
 *
 * Deliberately a SHORT list of patterns, not an allow-list of what to include.
 * The backup this replaces named six tables by hand and therefore omitted
 * `timecards` — the payroll — for as long as it existed. An exclude-list fails
 * safe: a table added next month is backed up because nobody had to remember
 * it.
 */
export const BACKUP_EXCLUDED_TABLES: RegExp[] = [
  // Ad-hoc rescue copies someone made during an incident. They are duplicates
  // of live data by definition and several are large.
  /^_.*backup/i,
  /_backup_\d{8}$/i,
  // High-volume, low-value telemetry. Losing yesterday's request log does not
  // cost the business anything; losing a timecard does.
  /^error_logs$/i,
  /^login_attempts$/i,
  /^api_request_logs$/i,
];

/** `pontifex/<stamp>/<suffix>` — one folder per run, so a restore is obvious. */
export function backupObjectKey(stamp: string, suffix: string): string {
  return `pontifex/${stamp}/${suffix}`;
}

/**
 * Newline-delimited JSON: one row per line.
 *
 * Chosen over a single JSON array because a truncated NDJSON file is still
 * readable up to the last complete line, while a truncated array is a syntax
 * error that yields nothing. On a backup, partial recovery beats total loss.
 */
export function toNdjson(rows: unknown[]): string {
  return rows.map((r) => JSON.stringify(r)).join('\n');
}

/**
 * Serverless functions are killed at a hard limit, and a killed run writes no
 * log row at all — so the work stops before that, leaving time to record what
 * happened. A partial backup that KNOWS it is partial is useful; one that
 * vanished mid-write is not.
 */
export function storageBudgetExhausted(startedAtMs: number, budgetMs: number, now = Date.now()): boolean {
  return now - startedAtMs >= budgetMs;
}
