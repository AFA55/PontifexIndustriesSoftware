/**
 * Crew carry-over for a duplicated job order.
 *
 * A duplicate exists to dispatch a SECOND CREW to the same job, so by default
 * the copy lands with nobody on it. `copyCrew` is the opt-in for the secondary
 * case ("same crew, another day/area"), and this builds the job_crew rows for
 * that copy.
 *
 * Rules encoded here:
 *  - The LEAD is never carried over. The lead lives on job_orders.assigned_to
 *    and only /api/admin/schedule-board/assign may set it (per-day ledger +
 *    sequencing + notifications). Any stray role 'lead' row is dropped.
 *  - `role` is preserved ('operator' keeps full work-performed input, 'helper'
 *    keeps the light work-log form).
 *  - `added_by` is re-stamped to the admin doing the duplication, not the
 *    person who originally crewed the source job.
 *  - tenant_id is always the caller's tenant — never read from the source row.
 *  - One row per user (the (job_order_id, user_id) unique index).
 */

export interface SourceCrewRow {
  user_id: string;
  role: string;
}

export interface CrewCopyRow {
  tenant_id: string;
  job_order_id: string;
  user_id: string;
  role: string;
  added_by: string;
}

export function buildCrewCopyRows(
  sourceCrew: SourceCrewRow[] | null | undefined,
  opts: { tenantId: string; newJobId: string; addedBy: string }
): CrewCopyRow[] {
  const seen = new Set<string>();
  const rows: CrewCopyRow[] = [];

  for (const member of sourceCrew || []) {
    if (!member?.user_id) continue;
    // The lead is not crew — it is set on the copy via the assign path.
    if (member.role === 'lead') continue;
    if (seen.has(member.user_id)) continue;
    seen.add(member.user_id);
    rows.push({
      tenant_id: opts.tenantId,
      job_order_id: opts.newJobId,
      user_id: member.user_id,
      role: member.role === 'operator' ? 'operator' : 'helper',
      added_by: opts.addedBy,
    });
  }

  return rows;
}
