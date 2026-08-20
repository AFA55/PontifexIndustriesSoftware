/**
 * THE CREW WHOSE LEAD IS NOT ON PONTIFEX.
 *
 * WHY (founder, Aug 20 2026): *"Sometimes the helpers get assigned to operators
 * that aren't on the platform. What I would like to do to resolve this is just
 * to be able to assign helpers to jobs — so if the helper is in Pontifex we can
 * assign them, and it can show in their timecard even if they are assigned to
 * someone without it."*
 *
 * Patriot runs crews under a lead who is sometimes a sub, or someone not yet
 * onboarded. `job_daily_assignments` has always ALLOWED that shape — `operator_id`
 * and `helper_id` are both nullable — and in 111 production rows it had never once
 * happened: 55 rows carry both, 33 an operator alone, 23 nobody, and ZERO a helper
 * alone. The schema was ready; the office had no way to say it.
 *
 * Two things follow, and this module owns the second.
 *
 * 1. A HELPER-ONLY ROW IS A REAL PLACEMENT. It is emphatically NOT the 23-row
 *    "skeleton" shape (`operator_id` AND `helper_id` both null) that holds a date
 *    open on the board. `lib/job-clock-attribution.ts` and
 *    `lib/timecard-job-context.ts` both already test for BOTH being null before
 *    discarding a row, so a helper-only row keeps its `day_sequence` and its place
 *    in the day. That distinction is load-bearing: borrowing a skeleton's sequence
 *    once ordered Axel's Aug 12 off an empty row and moved 3.65 h onto a job he
 *    never visited.
 *
 *    ⚠️ CORRECTION, and it matters to anyone reasoning about this next. It was
 *    claimed while building this that helper-only rows all carry `day_sequence`
 *    1, and therefore could never satisfy rule 7 in lib/job-day-boundary.ts
 *    (which needs DISTINCT sequences across a person's jobs). THAT IS FALSE.
 *    `planLedgerSequences` returns `own?.day_sequence ?? 1` on an operator-less
 *    row, so a row that already carried 2 keeps 2 — two helper-only rows on one
 *    day CAN be distinct and CAN order a day. What actually keeps a helper-only
 *    row from becoming a way to bill a job with no evidence is guard (c) alone
 *    (job-day-boundary.ts): every job taking a stretch of a person's day must
 *    carry its own press or its own close. That guard does hold here, and it is
 *    the whole of the safety — do not add a second claim on top of it. Note also
 *    that a helper CAN produce a same-day press: `route_started_at` is job-level
 *    and helper-only jobs now reach `my-jobs`, so the evidence guard (c) asks for
 *    is reachable for them, which is why the shape is safe rather than merely
 *    blocked.
 *
 * 2. THE LEAD HAS A NAME, AND THE PLATFORM COULD NOT SAY IT. A real person is
 *    running that crew. `off_platform_lead_name` on `job_daily_assignments` is
 *    free text, per-day (crew is a per-day fact), and deliberately NOT a user
 *    record — inventing a shadow profile for a sub is a much larger thing than
 *    the founder asked for, and it would land in every crew picker.
 *
 * ⚠️ `job_orders.foreman_name` is NOT this. It is the CUSTOMER's site contact —
 * it pre-fills the utility-waiver signer and prints as "Site contact" on the
 * operator's ticket. Reusing it would put a Patriot sub's name on a customer
 * signature line. Checked before adding a column, because this codebase has a
 * habit of building things twice.
 *
 * ⚠️ PURE — no `supabaseAdmin`, no `next/*`. The board modal is a client
 * component and needs `normalizeOffPlatformLeadName` and the labels; anything
 * that imports the service-role key can never be reached from `'use client'`.
 */

/** The column added by supabase/migrations/20260820_off_platform_lead_name.sql. */
export const OFF_PLATFORM_LEAD_COLUMN = 'off_platform_lead_name';

/**
 * What the board calls a crew with no Pontifex lead. Said in the office's own
 * words, not the schema's: the point of the row is that a real person is running
 * it and we simply do not have them in the system.
 *
 * NOT exported. Every screen reaches it through `describeOffPlatformLead`, which
 * is the only place that decides between a named lead and an unnamed one — a
 * second caller choosing for itself is how the three surfaces printing this
 * drifted into three wordings in the first place.
 */
const OFF_PLATFORM_LEAD_LABEL = 'Lead not on Pontifex';

/** Longer than any name the office would type, short enough to print on a row. */
export const OFF_PLATFORM_LEAD_MAX_LENGTH = 80;

/**
 * Trim a typed lead name down to what we will store, or `null`.
 *
 * `null` and `''` are the SAME answer here ("we were not told who") and both must
 * store as SQL NULL — an empty string would render as a blank chip on the board,
 * which reads as a name we failed to load rather than one nobody gave us.
 */
export function normalizeOffPlatformLeadName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const collapsed = value.trim().replace(/\s+/g, ' ');
  if (!collapsed) return null;
  return collapsed.slice(0, OFF_PLATFORM_LEAD_MAX_LENGTH);
}

/**
 * The one line the board row shows where an operator's name would be.
 *
 * It must never read as an error or an omission. A row that says nothing in the
 * operator seat looks exactly like the assignment failed — which is the state the
 * office is in today, and the reason this feature exists.
 */
export function describeOffPlatformLead(name: string | null | undefined): string {
  const clean = normalizeOffPlatformLeadName(name);
  return clean ? `${clean} — not on Pontifex` : OFF_PLATFORM_LEAD_LABEL;
}

/**
 * IS THIS THE ERROR A MISSING COLUMN THROWS?
 *
 * The migration is written but applied by hand, so every read and write of the
 * new column has to survive the window where the code has shipped and the column
 * has not. This is not defensive habit — PostgREST rejects the WHOLE select on one
 * unknown column name, so an unguarded `off_platform_lead_name` in the board's
 * per-day overlay would take the entire per-day ledger down with it and the board
 * would silently draw yesterday's leads. That failure has shipped here three
 * times; it is not shipping a fourth.
 *
 * Postgres answers `42703` (undefined_column) and PostgREST answers `PGRST204`
 * ("Could not find the 'x' column ... in the schema cache") depending on whether
 * the statement or the schema cache catches it first. Both are matched, plus the
 * message text as a last resort for a client that drops the code.
 *
 * IT MUST BE *THIS* COLUMN. The code alone used to be enough, and `42703` /
 * `PGRST204` are what a TYPO in any other column name answers too — so a
 * mis-spelled `helper_id` in the overlay select would have been read as "the
 * migration isn't applied", swallowed into the fallback, and the fallback would
 * have failed the same way and silently dropped the entire per-day ledger. The
 * message names the offending column in both dialects; when a client drops the
 * message there is nothing left to check but the code, and that stays allowed.
 */
export function isMissingColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined,
  column: string = OFF_PLATFORM_LEAD_COLUMN
): boolean {
  if (!error) return false;
  const message = (error.message ?? '').toLowerCase();
  const namesColumn = message.includes(column.toLowerCase());
  if (error.code === '42703' || error.code === 'PGRST204') {
    return !message || namesColumn;
  }
  if (!namesColumn) return false;
  return (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('undefined column')
  );
}

/**
 * Is this crew placement a real one, as opposed to a skeleton row?
 *
 * Shared so the answer is stated once. A helper alone IS a crew (that is the
 * whole feature); nobody at all is a date being held open.
 */
export function placesSomeone(row: {
  operator_id?: string | null;
  helper_id?: string | null;
}): boolean {
  return !!row.operator_id || !!row.helper_id;
}

/**
 * Is this a helper-only placement — the shape the office could not previously
 * create, and the one the board must not draw as "unassigned"?
 */
export function isHelperOnlyPlacement(row: {
  operator_id?: string | null;
  helper_id?: string | null;
}): boolean {
  return !row.operator_id && !!row.helper_id;
}

/**
 * WHAT THE LEAD COLUMN SHOULD HOLD AFTER A WRITE THAT PLACES THIS CREW.
 *
 * Stated ONCE because the write path needs the same answer twice — on the row it
 * upserts and in the response/audit it reports — and two copies of a rule are two
 * rules. Sent-but-not-reported is how a change becomes invisible; reported-but-
 * not-sent is a lie.
 *
 * `undefined` means "do not touch the stored value", and it is only ever
 * returned when the caller said nothing (a drag, a sequence shuffle) about a
 * crew that could legitimately have one.
 *
 * Three cases, and only one of them keeps a name:
 *   • an OPERATOR is on the row → null. A crew has one lead; a name stranded
 *     beside a real operator prints two.
 *   • NOBODY is on the row → null. This is the skeleton shape — a date held open
 *     on the board. Remove the helper from a helper-only row and the row is left
 *     with no one; leaving "Mike Sanchez" behind means the next helper assigned
 *     to that row inherits a lead who is not running that crew.
 *   • a HELPER ALONE → whatever the caller said (or silence).
 */
export function resolveOffPlatformLead(params: {
  operatorId: string | null | undefined;
  helperId: string | null | undefined;
  requested: string | null | undefined;
}): string | null | undefined {
  if (!isHelperOnlyPlacement({ operator_id: params.operatorId, helper_id: params.helperId })) {
    return null;
  }
  if (params.requested === undefined) return undefined;
  return normalizeOffPlatformLeadName(params.requested);
}

/**
 * DID THE OFFICE ACTUALLY CHANGE THE LEAD?
 *
 * Both sides normalised, because the panel's field holds raw typing and the
 * ledger holds the trimmed form — `"Mike Sanchez "` against `"Mike Sanchez"` is
 * not a change, and treating it as one fires a full crew write for nothing.
 * `undefined` on the requested side means the caller never spoke, which is never
 * a change.
 */
export function offPlatformLeadChanged(
  requested: string | null | undefined,
  stored: string | null | undefined
): boolean {
  if (requested === undefined) return false;
  return normalizeOffPlatformLeadName(requested) !== normalizeOffPlatformLeadName(stored);
}
