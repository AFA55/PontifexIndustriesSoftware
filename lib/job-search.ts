/**
 * Global job search — query parsing and result ranking.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The founder reads job numbers out of chat messages, printed tickets and
 * invoices, then has to find that job in the app. He types them the way a person
 * types: sometimes the whole thing (`JOB-2026-793440`), sometimes just the tail
 * (`793440`), sometimes the year and tail (`2026-793440`), and usually in
 * lowercase because a phone keyboard auto-lowercases. All four have to land on
 * the same job.
 *
 * Production job numbers carry four prefixes (verified Aug 19 2026 against
 * `job_orders`): JOB (46 rows), QA (10), TEST (5), DEMO (1). The serial is
 * normally `{year}-{6 digits}` but is not guaranteed — `JOB-2026-MYTEST` is a
 * real row — so nothing here may reject a query for failing a digit shape.
 *
 * This module is pure. It does no I/O so it can be unit-tested without a
 * database, and so the API route and any future caller share one definition of
 * "what did he mean by that".
 */

/**
 * Roles that may use the global job search.
 *
 * Restated from `SALES_STAFF_ROLES` in `lib/api-auth.ts` because a client
 * component cannot import that module — it pulls in `lib/supabase-admin.ts` and
 * the service_role key with it. `lib/job-search.test.ts` asserts the two lists
 * are identical.
 *
 * This is deliberately NOT the admin-layout audience. `shop_manager` and
 * `shop_help` sit in that layout but the job-detail page turns them away, so
 * showing them results they cannot open would be a dead end. They get no box.
 */
export const JOB_SEARCH_ROLES: readonly string[] = [
  'admin',
  'super_admin',
  'operations_manager',
  'supervisor',
  'salesman',
];

/** True when this role may use the global job search. */
export function canSearchJobs(role: string | null | undefined): boolean {
  if (!role) return false;
  return JOB_SEARCH_ROLES.includes(role);
}

/** Job-number prefixes that exist in production. Order matters only for docs. */
export const JOB_NUMBER_PREFIXES = ['JOB', 'QA', 'TEST', 'DEMO'] as const;

export type JobNumberPrefix = (typeof JOB_NUMBER_PREFIXES)[number];

export interface ParsedJobQuery {
  /** The raw query, trimmed. Empty string when the caller sent nothing usable. */
  raw: string;
  /** Upper-cased, punctuation-normalised form used to build patterns. */
  normalized: string;
  /** The prefix the caller typed, or null when they typed a bare serial. */
  prefix: JobNumberPrefix | null;
  /** Everything after the prefix — '2026-793440', '793440', 'MYTEST', ''. */
  serial: string;
  /**
   * True when the query plausibly names a job number. Used only for RANKING —
   * a false here never suppresses a job-number query, because a customer called
   * "793" would otherwise be unfindable.
   */
  isJobNumberLike: boolean;
  /** `ilike` pattern to match against `job_orders.job_number`. */
  jobNumberPattern: string;
  /** `ilike` pattern for the free-text columns (customer name, address). */
  textPattern: string;
}

/**
 * Strip the characters that would turn a user's typing into a wildcard or a
 * filter separator.
 *
 * `%` and `_` are SQL LIKE wildcards: a founder pasting `100%_complete` would
 * otherwise match half the table. Backslash is the LIKE escape character. We
 * drop rather than escape them — this is a search box, not a query language,
 * and no production job number, customer name or address contains them in a way
 * a user would search for.
 *
 * `*` is stripped for the same reason and is the easiest one to miss: it is not
 * a SQL wildcard, but PostgREST maps `*` to `%` inside an `ilike` value, AND it
 * sits in the `x-www-form-urlencoded` safe set so `URLSearchParams` passes it
 * through unencoded. A query of `**` would otherwise reach the database as
 * `%%%%` and match every row in the tenant.
 *
 * NOTE: commas and parentheses are deliberately KEPT. They are safe inside
 * `.ilike()` (the client URL-encodes the value) and they are common in
 * addresses ("123 Main St, Boston"). They would NOT be safe inside a PostgREST
 * `.or()` string, which is exactly why the API route runs separate queries
 * instead of one `.or()`.
 */
export function sanitizeSearchText(input: string): string {
  return input.replace(/[%_\\*]/g, '').trim();
}

/**
 * Normalise a job-number-ish query: upper-case, and treat runs of whitespace,
 * underscores, slashes and repeated dashes as a single dash. So `job 2026
 * 793440`, `JOB_2026_793440` and `job--2026--793440` all become
 * `JOB-2026-793440`.
 *
 * The underscore is turned into a separator here rather than stripped by
 * `sanitizeSearchText`, because on this path it is a separator the user typed,
 * not a LIKE wildcard — and no underscore survives to reach the query.
 *
 * `*` is dropped for the reason spelled out on `sanitizeSearchText`: PostgREST
 * reads it as `%` inside an `ilike` value. It must go here too, or a bare `**`
 * would skip the free-text sanitizer and reach `job_number` as `%****%`.
 */
function normalizeJobNumber(input: string): string {
  return input
    .replace(/[%\\*]/g, '')
    .toUpperCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

const PREFIX_RE = new RegExp(`^(${JOB_NUMBER_PREFIXES.join('|')})-?(.*)$`);

/**
 * Work out what the caller meant and produce the `ilike` patterns to run.
 *
 * The rule, stated once:
 *  - A query that NAMES a prefix is anchored to that prefix. `QA-122769` must
 *    not return `JOB-2026-122769` — the founder who typed QA meant QA.
 *  - A query with NO prefix is matched anywhere in the number, so `793440` and
 *    `2026-793440` find the job whatever its prefix is. This is the case he
 *    hits most: he reads the tail off a ticket.
 */
export function parseJobQuery(rawInput: string): ParsedJobQuery {
  const raw = (rawInput ?? '').trim();
  const cleaned = sanitizeSearchText(raw);
  const normalized = normalizeJobNumber(raw);

  if (!normalized) {
    return {
      raw,
      normalized: '',
      prefix: null,
      serial: '',
      isJobNumberLike: false,
      jobNumberPattern: '',
      textPattern: '',
    };
  }

  const match = PREFIX_RE.exec(normalized);
  const prefix = (match?.[1] as JobNumberPrefix | undefined) ?? null;
  const serial = match ? match[2] : normalized;

  // A bare query counts as job-number-like once it carries three or more
  // digits — enough to be a serial fragment and not a house number someone
  // typed while looking for an address.
  const digitCount = (normalized.match(/\d/g) ?? []).length;
  const isJobNumberLike = prefix !== null || digitCount >= 3;

  const jobNumberPattern = prefix
    ? // Anchored to the prefix; the serial may sit anywhere after it so that a
      // partial serial ('JOB-793440') still finds 'JOB-2026-793440'.
      serial
      ? `${prefix}-%${serial}%`
      : `${prefix}-%`
    : `%${normalized}%`;

  return {
    raw,
    normalized,
    prefix,
    serial,
    isJobNumberLike,
    jobNumberPattern,
    textPattern: `%${cleaned}%`,
  };
}

// ── Result shaping ──────────────────────────────────────────────────────────

export interface JobSearchResult {
  id: string;
  job_number: string | null;
  customer_name: string | null;
  project_name: string | null;
  address: string | null;
  status: string | null;
  /** Bare 'YYYY-MM-DD' straight from the `date` column — never a Date. */
  scheduled_date: string | null;
  /** Which field matched, so the UI can say why this row is here. */
  matched_on: 'job_number' | 'customer' | 'address';
}

/**
 * Rank merged results. Exact job-number match wins outright, then job-number
 * matches, then customer, then address; ties break on the most recent
 * scheduled date so today's work floats above a job from March.
 *
 * `scheduled_date` is compared as a STRING. Bare 'YYYY-MM-DD' sorts
 * lexicographically in true date order, and never touching `new Date()` here is
 * the whole point — this codebase has shipped that timezone bug three times.
 */
export function rankJobResults(
  parsed: ParsedJobQuery,
  rows: JobSearchResult[]
): JobSearchResult[] {
  const exact = parsed.normalized;

  const weight = (r: JobSearchResult): number => {
    if (r.job_number && r.job_number.toUpperCase() === exact) return 0;
    if (r.matched_on === 'job_number') return 1;
    if (r.matched_on === 'customer') return 2;
    return 3;
  };

  return [...rows].sort((a, b) => {
    const wa = weight(a);
    const wb = weight(b);
    if (wa !== wb) return wa - wb;
    const da = a.scheduled_date ?? '';
    const db = b.scheduled_date ?? '';
    if (da !== db) return db.localeCompare(da); // newest first
    return (a.job_number ?? '').localeCompare(b.job_number ?? '');
  });
}

/**
 * Merge the per-column result sets, keeping the strongest `matched_on` for a
 * job that turned up in more than one of them (a job number search and a
 * customer search can both return the same row).
 */
export function mergeJobResults(
  groups: Array<{ matched_on: JobSearchResult['matched_on']; rows: Omit<JobSearchResult, 'matched_on'>[] }>
): JobSearchResult[] {
  const order: Record<JobSearchResult['matched_on'], number> = {
    job_number: 0,
    customer: 1,
    address: 2,
  };
  const byId = new Map<string, JobSearchResult>();
  for (const group of groups) {
    for (const row of group.rows) {
      const existing = byId.get(row.id);
      if (existing && order[existing.matched_on] <= order[group.matched_on]) continue;
      byId.set(row.id, { ...row, matched_on: group.matched_on });
    }
  }
  return [...byId.values()];
}
