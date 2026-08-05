/**
 * Nullable list columns on job_orders, made safe to render.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `job_orders` has a dozen list-shaped columns — equipment_needed, permits,
 * ppe_required, photo_urls, scope_photo_urls, equipment_selections — and every
 * one of them is NULLABLE. A job created through Quick Add, or duplicated from
 * one, simply doesn't have them.
 *
 * The UI mapped over them directly. So on 5 Aug 2026 two live tickets became
 * unopenable:
 *   • Zack's JOB-2026-424813   — photo_urls was NULL
 *   • Devin's QA-2026-830042   — equipment_needed was NULL
 *   • and its duplicate JOB-2026-521763 — both NULL
 * all failing with "cannot read properties of undefined (reading 'map')".
 * Fourteen separate `.map()` call sites had no guard.
 *
 * The lesson isn't "add a null check there" — it's that a list column read from
 * the database should never reach a component as anything but a list. Normalize
 * once, at the boundary, and the whole class of crash disappears.
 */

/** The job_orders columns that are list-shaped and nullable. */
export const JOB_LIST_COLUMNS = [
  'equipment_needed',
  'equipment_selections',
  'permits',
  'ppe_required',
  'photo_urls',
  'scope_photo_urls',
  'takeoff_page_ids',
  'attachments',
] as const;

/**
 * Anything → an array you can safely `.map()`.
 *
 * Handles the four shapes these columns actually arrive in: a real array, NULL,
 * a JSON string (some writers stringify), and a single bare value.
 */
export function asArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
      } catch {
        return [];
      }
    }
    // A comma-joined string is how job_type and friends are stored.
    return trimmed ? (trimmed.split(',').map((s) => s.trim()).filter(Boolean) as unknown as T[]) : [];
  }
  // A lone object/number that should have been a one-item list.
  return [value as T];
}

/**
 * Normalize every known list column on a job row so the UI can render it
 * without defensive checks. Returns a new object; the input is untouched.
 *
 * Call this wherever a job row crosses from the database into a response.
 */
export function normalizeJobArrays<T extends Record<string, unknown>>(job: T): T {
  if (!job || typeof job !== 'object') return job;
  const out: Record<string, unknown> = { ...job };
  for (const col of JOB_LIST_COLUMNS) {
    if (col in out) out[col] = asArray(out[col]);
  }
  return out as T;
}

/** Same, for a list of job rows. */
export function normalizeJobArraysAll<T extends Record<string, unknown>>(jobs: T[] | null | undefined): T[] {
  return (jobs ?? []).map(normalizeJobArrays);
}
