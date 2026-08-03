/**
 * Editable-column allowlist for the schedule-board inline ticket edit
 * (JobDetailView "Edit" → PATCH /api/job-orders/[id]).
 *
 * WHY THIS EXISTS (Aug 2026 live incident):
 * A PostgREST `update()` is all-or-nothing. If the payload carries ONE key that
 * is not a real column, PostgREST rejects the ENTIRE statement
 * (`PGRST204: Could not find the 'directions' column of 'job_orders' in the
 * schema cache`) and every other field on the ticket silently fails to save.
 * That is exactly what happened when the edit form gained a `directions`
 * textarea before the column existed: every edit to every field looked like it
 * saved and didn't.
 *
 * So the route NEVER forwards the raw client body. It rebuilds the update from
 * this known-good list, and anything unrecognised is dropped + logged instead
 * of poisoning the whole save.
 *
 * Every name below was verified present, updatable and non-generated in
 * `information_schema.columns` for `public.job_orders` (prod, Aug 2026).
 * Do NOT add a name here without checking the schema first.
 */

export const JOB_EDIT_ALLOWED_FIELDS = [
  // ── Job information ───────────────────────────────────────────────
  'customer_name',
  'customer_contact',
  'site_contact_phone',
  'foreman_phone', // legacy twin of site_contact_phone — form reads it as a fallback
  'address',
  'location',
  'estimated_cost',
  'po_number',
  'salesman_name',
  // ── Schedule ──────────────────────────────────────────────────────
  'scheduled_date',
  'end_date',
  'arrival_time',
  // ── Content ───────────────────────────────────────────────────────
  'description',
  'additional_info',
  'directions',
  // ── Structured jsonb ──────────────────────────────────────────────
  'jobsite_conditions',
  'site_compliance',
  'scope_details',
  // ── Classification / scope & equipment ────────────────────────────
  'job_type',
  'is_will_call',
  'equipment_needed',
  'equipment_rentals',
] as const;

export type JobEditableField = (typeof JOB_EDIT_ALLOWED_FIELDS)[number];

const ALLOWED = new Set<string>(JOB_EDIT_ALLOWED_FIELDS);

export interface FilteredJobEdit {
  /** Only the keys that map to real, editable job_orders columns. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updates: Record<string, any>;
  /** Keys the client sent that are NOT editable columns — dropped, not fatal. */
  dropped: string[];
}

/**
 * Rebuild a job-order update object from a client payload using the allowlist.
 * Pure: no I/O, no mutation of the input. Unknown keys are returned in
 * `dropped` so the caller can log them.
 */
export function filterJobEditFields(body: unknown): FilteredJobEdit {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {};
  const dropped: string[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { updates, dropped };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const src = body as Record<string, any>;
  for (const key of Object.keys(src)) {
    // `undefined` can't survive JSON, but a direct caller could pass it —
    // treat it as "not sent" rather than "set to null".
    if (src[key] === undefined) continue;
    if (ALLOWED.has(key)) {
      updates[key] = src[key];
    } else {
      dropped.push(key);
    }
  }

  return { updates, dropped };
}

/**
 * Turn a Postgres/PostgREST "unknown column" failure into a message that names
 * the offending field, so the next time a phantom column ships the office sees
 * WHICH field broke instead of an opaque 500.
 *
 * PGRST204 → "Could not find the 'directions' column of 'job_orders' in the schema cache"
 * 42703    → `column "directions" of relation "job_orders" does not exist`
 */
export function describeJobEditError(
  error: { code?: string | null; message?: string | null } | null | undefined
): string {
  const message = error?.message || 'Could not save changes. Please try again.';
  const code = error?.code || '';
  if (code !== '42703' && code !== 'PGRST204') return message;

  const column =
    message.match(/'([^']+)'\s+column/)?.[1] ??
    message.match(/column\s+"([^"]+)"/)?.[1] ??
    null;

  const field = column ? `"${column}"` : 'one of the submitted fields';
  return `Save failed: ${field} is not a column on job orders, so nothing was saved. Report this field to support.`;
}
