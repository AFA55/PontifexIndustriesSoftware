/**
 * Payload builder for duplicating a job_orders row.
 *
 * ── WHY THIS FILE EXISTS: the "Failed to duplicate" bug (Aug 2026) ──────────
 * `job_orders` carries GENERATED ALWAYS columns — `total_cost` and
 * `gross_profit`, added by the job-cost-tracking migration (Jul 2, 2026). They
 * are computed by Postgres from labor/material/equipment/fuel/subcontractor/
 * other cost, and Postgres REFUSES any INSERT that names them:
 *
 *   ERROR: cannot insert a non-DEFAULT value into column "total_cost"
 *   SQLSTATE 428C9 (ERRCODE_GENERATED_ALWAYS)
 *
 * The duplicate route copied EVERY key off the source row, so every duplicate
 * INSERT included those two columns and the whole statement was rejected.
 * Confirmed in production: 0 of 11 job_orders rows had `parent_job_id` set —
 * no duplicate had ever succeeded since that migration landed.
 *
 * ── HOW TO CHECK / EXTEND ───────────────────────────────────────────────────
 * If a future migration adds another generated column, add it to
 * GENERATED_COLUMNS below. To list them:
 *
 *   SELECT column_name, generation_expression
 *     FROM information_schema.columns
 *    WHERE table_schema = 'public'
 *      AND table_name   = 'job_orders'
 *      AND is_generated <> 'NEVER';
 *
 * We deliberately do NOT query information_schema at request time — the
 * duplicate button is a hot path and PostgREST does not expose that view
 * anyway. Instead the list below is the declared truth, and
 * `generatedColumnFromInsertError()` + a bounded retry in the routes act as a
 * self-healing safety net: if Postgres names a column we did not know about,
 * we drop it, log loudly, and retry rather than failing the whole duplicate.
 */

/**
 * Columns Postgres computes itself — never insertable.
 * Keep in sync with the information_schema query above.
 */
export const JOB_ORDER_GENERATED_COLUMNS: ReadonlySet<string> = new Set([
  'total_cost',
  'gross_profit',
]);

/**
 * ── ALLOWLIST, NOT A DENYLIST — and that distinction is the whole point ──────
 *
 * `job_orders` has 206 columns and grows with almost every migration. The first
 * version of this file used a 15-entry denylist, which was safe only because
 * the generated-column bug meant no duplicate INSERT had ever succeeded. The
 * moment duplication started working, that denylist would have carried onto a
 * brand-new ticket:
 *
 *   • work_started_at / arrived_at_jobsite_at / work_completed_at — the board
 *     reads exactly these to paint the live pill, so a fresh unassigned copy
 *     would render "Working" or "Done" the instant it was created;
 *   • completion_signature / liability_release_* / utility_waiver_* /
 *     work_order_* — a customer's SIGNATURE on work that has not happened;
 *   • work_performed / photo_urls / operator_notes — the previous crew's log;
 *   • billing_status / invoice_number / invoiced_at / paid_at — the copy is
 *     born already invoiced;
 *   • labor_cost / material_cost / … — the GENERATED total_cost recomputes off
 *     these, so job-cost reporting double-counts.
 *
 * So: a column is copied ONLY if it is named here. Anything a future migration
 * adds is NOT copied until someone deliberately adds it — the safe default.
 * The rule of thumb: copy what DEFINES the job (who, where, what work, what
 * gear, what it should cost). Never copy what RECORDS a job being done.
 */
export const DUPLICATE_COPYABLE_COLUMNS: readonly string[] = [
  // Identity / classification
  'tenant_id',
  'title',
  'project_name',
  'description',
  'job_type',
  'priority',
  'dispatch_priority',
  'schedule_category',
  'schedule_color',
  'schedule_color_label',
  'scheduling_flexibility',
  'created_via',
  // Customer
  'customer_id',
  'customer_name',
  'customer_contact',
  'customer_email',
  'customer_job_number',
  'job_site_number',
  'po_number',
  // Site
  'address',
  'location',
  'directions',
  'facility_id',
  'jobsite_latitude',
  'jobsite_longitude',
  'jobsite_geocoded_at',
  'foreman_name',
  'foreman_phone',
  'site_contact_phone',
  // Plan (intent, never actuals)
  'arrival_time',
  'estimated_start_time',
  'estimated_end_time',
  'estimated_hours',
  'estimated_cost',
  'crew_size',
  'is_multi_day',
  'is_will_call',
  // Equipment
  'equipment_needed',
  'equipment_selections',
  'mandatory_equipment',
  'special_equipment',
  'special_equipment_notes',
  'equipment_rentals',
  'equipment_rental_flags',
  // Scope & site conditions
  'scope_details',
  'scope_photo_urls',
  'expected_scope',
  'jobsite_conditions',
  'site_compliance',
  'additional_info',
  'additional_safety_requirements',
  'ppe_required',
  'permits',
  'permit_required',
  'required_documents',
  'work_environment',
  'dispatch_notes',
  'require_waiver_signature',
  'require_completion_signature',
  // Commercial intent (rates, not amounts billed)
  'billing_type',
  'hourly_rate',
  'mileage_rate',
  'commission_rate',
  'track_financials',
  'salesman_name',
  'salesperson_email',
  'project_manager_id',
];

const COPYABLE = new Set(DUPLICATE_COPYABLE_COLUMNS);

/**
 * True only for columns the copy is allowed to inherit. Generated columns can
 * never be inserted, so they are refused even if someone allowlists one.
 */
export function isCopyableColumn(key: string): boolean {
  return COPYABLE.has(key) && !JOB_ORDER_GENERATED_COLUMNS.has(key);
}

export interface DuplicateOptions {
  /** Fresh JOB-{year}-{6} number for the copy. */
  jobNumber: string;
  /** Date the copy is scheduled for (YYYY-MM-DD). */
  scheduledDate: string;
  /** Optional multi-day end date; anything falsy clears it. */
  endDate?: string | null;
  /** The row being copied — the copy links back to it. */
  parentJobId: string;
  /** "Same crew, another day" — carry the helper seat over. Lead never copies. */
  copyCrew?: boolean;
  /** Free-text reason appended to the copy's notes. */
  notes?: string | null;
  /**
   * Who clicked Duplicate. `created_by` is deliberately NOT copyable — the copy
   * is a new record authored by whoever made it, not by whoever entered the
   * original weeks ago.
   */
  createdBy?: string | null;
}

/**
 * Build the INSERT payload for a duplicated job order.
 *
 * Pure: no DB access, no clock, no randomness — everything variable arrives via
 * `opts`, which is what makes the exclusion rules unit-testable.
 */
export function buildDuplicatePayload(
  original: Record<string, any>,
  opts: DuplicateOptions
): Record<string, any> {
  const payload: Record<string, any> = {};

  for (const [key, value] of Object.entries(original || {})) {
    if (!isCopyableColumn(key)) continue;
    payload[key] = value;
  }

  payload.job_number = opts.jobNumber;
  payload.scheduled_date = opts.scheduledDate;
  payload.end_date = opts.endDate || null;
  payload.status = 'scheduled';
  payload.parent_job_id = opts.parentJobId;
  if (opts.createdBy) payload.created_by = opts.createdBy;

  if (opts.copyCrew) {
    payload.helper_assigned_to = original?.helper_assigned_to ?? null;
  }

  if (opts.notes) {
    // NEVER invent a column. `job_orders` has NO plain `notes` column (job notes
    // live in job_notes; the row has operator_notes / dispatch_notes /
    // completion_notes / additional_info). Writing a key the table doesn't have
    // fails the INSERT exactly the way the generated columns did — so the
    // duplicate reason always lands in `additional_info`, which is real and is
    // on the copy allowlist.
    const existing = payload.additional_info || '';
    payload.additional_info = existing
      ? `${existing}\n---\nDuplicated: ${opts.notes}`
      : `Duplicated: ${opts.notes}`;
  }

  return payload;
}

/** Postgres SQLSTATE for "cannot insert a non-DEFAULT value into a generated column". */
export const GENERATED_ALWAYS_SQLSTATE = '428C9';

/**
 * Pull the offending column name out of a Postgres generated-column error so a
 * caller can drop it and retry. Returns null when the error is something else.
 *
 * Postgres wording: cannot insert a non-DEFAULT value into column "total_cost"
 * PostgREST also surfaces a "column X is a generated column" variant.
 */
export function generatedColumnFromInsertError(
  error: { code?: string | null; message?: string | null } | null | undefined
): string | null {
  if (!error) return null;
  const message = error.message || '';
  const looksGenerated =
    error.code === GENERATED_ALWAYS_SQLSTATE ||
    /non-DEFAULT value into column/i.test(message) ||
    /generated column/i.test(message);
  if (!looksGenerated) return null;
  const match = message.match(/column "([^"]+)"/i);
  return match ? match[1] : null;
}

/**
 * Strip a set of columns from a payload (used by the retry path).
 * Returns a new object; the input is untouched.
 */
export function withoutColumns(
  payload: Record<string, any>,
  columns: Iterable<string>
): Record<string, any> {
  const drop = new Set(columns);
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (drop.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Minimal shape of the Supabase client bit we need (kept injectable for tests). */
export interface JobOrderInsertClient {
  from(table: string): {
    insert(payload: Record<string, any>): {
      select(columns: string): {
        single(): Promise<{ data: any; error: any }>;
      };
    };
  };
}

/**
 * INSERT a duplicate row, self-healing past generated columns we did not know
 * about. Postgres names one offending column per error, so a small bounded
 * retry covers a couple of surprises without ever looping.
 *
 * On success returns `{ data }`. On failure returns `{ error }` with the raw
 * Postgres error so the caller can surface a real message.
 */
export async function insertJobOrderCopy(
  client: JobOrderInsertClient,
  payload: Record<string, any>,
  selectColumns = '*',
  maxAttempts = 3
): Promise<{ data: any; error: any; strippedColumns: string[] }> {
  let attemptPayload = payload;
  const stripped: string[] = [];
  let lastError: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await client
      .from('job_orders')
      .insert(attemptPayload)
      .select(selectColumns)
      .single();

    if (!error) return { data, error: null, strippedColumns: stripped };
    lastError = error;

    const column = generatedColumnFromInsertError(error);
    if (!column || !(column in attemptPayload)) break;

    console.warn(
      `[duplicate] job_orders.${column} is a GENERATED column and cannot be inserted. ` +
        'Dropped it and retried — add it to JOB_ORDER_GENERATED_COLUMNS in lib/duplicate-job-order.ts.'
    );
    stripped.push(column);
    attemptPayload = withoutColumns(attemptPayload, [column]);
  }

  return { data: null, error: lastError, strippedColumns: stripped };
}

/**
 * Human-readable failure text for a duplicate INSERT.
 *
 * The founder hit a bare "Failed to duplicate" that told him nothing. Surface
 * the actual Postgres message (plus details/hint when present) — these routes
 * are management-only, so there is no meaningful information disclosure.
 */
export function describeInsertError(
  error: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null | undefined,
  prefix = 'Failed to duplicate job'
): string {
  if (!error) return prefix;
  const bits = [error.message, error.details, error.hint].filter(Boolean);
  const body = bits.length ? bits.join(' — ') : 'unknown database error';
  return error.code ? `${prefix}: ${body} (${error.code})` : `${prefix}: ${body}`;
}
