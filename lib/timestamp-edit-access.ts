/**
 * Who may correct a crew's job timestamps.
 *
 * WHY THIS IS ITS OWN FILE
 * ────────────────────────
 * `PATCH /api/admin/jobs/[id]/timestamps` is `requireAdmin` — admin,
 * super_admin, operations_manager. The job-detail page that carries the edit
 * controls admits a WIDER set: it also lets `salesman` and `supervisor` in,
 * because those are the roles the project managers hold. So the edit pencils
 * rendered for people the API refuses: they filled in a time, pressed Save, and
 * got "Forbidden. Admin access required." That is this codebase's recurring
 * defect — the UI says yes and the API says no, which reads as the app being
 * broken rather than as a permission.
 *
 * The client cannot import `ADMIN_ROLES` from `lib/api-auth.ts`: that module
 * pulls in `lib/supabase-admin.ts` and the service_role key with it. So the
 * list is restated here, and `lib/timestamp-edit-access.test.ts` asserts the
 * two lists are identical — if someone widens or narrows the API guard, the
 * test fails rather than the founder discovering it at a 403.
 */

/** Roles that `requireAdmin` admits. Kept in lockstep with `ADMIN_ROLES`. */
export const TIMESTAMP_EDIT_ROLES: readonly string[] = [
  'admin',
  'super_admin',
  'operations_manager',
];

/**
 * True when this role may open the timestamp editor.
 *
 * Callers must use this to decide whether to RENDER the control. Never gate it
 * with `hidden={...}` — Tailwind's `[hidden]{display:none}` loses to a `flex`
 * or `inline-flex` class at equal specificity and the button shows anyway.
 */
export function canEditJobTimestamps(role: string | null | undefined): boolean {
  if (!role) return false;
  return TIMESTAMP_EDIT_ROLES.includes(role);
}

/**
 * WHICH TIMESTAMP EDITS RE-DIVIDE A CREW'S CLOCKED DAY.
 *
 * `jobStartOnDate` in `lib/job-day-boundary.ts` takes the EARLIEST of a job's
 * `route_started_at`, `in_route_at` and `work_started_at` as the moment that job
 * takes over the day. Whichever of the three is the minimum is the boundary, so
 * moving ANY of them can move it — and moving it shortens or lengthens the
 * previous job's stretch on the same day, on a ticket that may already be
 * invoiced.
 *
 * This started as a set containing only `in_route_at`, which was right for the
 * common shape (In Route pressed first) and silently wrong for the rest. A job
 * with In Route 07:30 and Work Started 08:10, corrected to Work Started 06:50,
 * moves the boundary forty minutes earlier with no warning at all. And clearing
 * In Route nulls BOTH press columns, after which `work_started_at` is the only
 * candidate left and every later edit to it moves the boundary.
 *
 * `work_completed_at` JOINED THE SET WHEN THE CLOSE FALLBACK SHIPPED (Aug 20).
 * It is not a start stamp and never will be — rule 5 still says a completion
 * does not end its own job's segment. But rule 6 in `lib/job-day-boundary.ts`
 * hands the NEXT job the close of the one before it whenever that next job has
 * no usable same-day press, so editing a completion time now moves a boundary
 * one job downstream. On Keon's Aug 11 it is the ONLY thing holding the line
 * between ISC and Leifeng: move ISC's close and every hour on both invoices
 * moves with it. A field that can do that has to carry the same warning as a
 * press, whatever kind of stamp it is.
 *
 * Kept in one place because the client modal (which must warn BEFORE the click)
 * and the PATCH route (which returns the note AFTER it) have to agree; when they
 * disagree the office either gets a warning about nothing or no warning about
 * something. `arrived_at_jobsite_at` is deliberately absent — it is read by
 * neither the start rule nor the close rule.
 */
export const BOUNDARY_TIMESTAMP_FIELDS: readonly string[] = [
  'in_route_at',
  'route_started_at',
  'work_started_at',
  // Not a start. A boundary all the same — see the note above.
  'work_completed_at',
];

/** True when editing this timestamp column can move a job-day boundary. */
export function movesJobDayBoundary(field: string | null | undefined): boolean {
  if (!field) return false;
  return BOUNDARY_TIMESTAMP_FIELDS.includes(field);
}
