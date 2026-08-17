/**
 * lib/job-ticket-quoted-by.ts — who QUOTED this job, for the printed ticket.
 *
 * WHY THIS IS ITS OWN FILE (founder, Aug 16 2026): "it has submitted by blank
 * but when I go to schedule form it shows Andres Altamirano."
 *
 * `job_orders.salesman_name` is NULL on 9 of the 48 job orders in production.
 * Only the CREATE path ever set it (POST /api/admin/schedule-form maps
 * body.submitted_by → salesman_name); the edit PATCH never sent it. Meanwhile
 * the schedule form's "Submitted By" box auto-fills with the CURRENT user on
 * mount, which is exactly why the form looked populated while the column was
 * null. Patching the write path alone leaves every existing job blank forever,
 * so the ticket falls back to the profile behind `created_by` — the person who
 * actually filled the form. 8 of those 9 rows resolve that way; the 9th has no
 * `created_by` either (a seeded demo row) and prints '—'.
 *
 * It lives here because TWO routes now render this field — the react-pdf ticket
 * (/api/job-orders/[id]/dispatch-pdf) and the HTML one (/api/admin/jobs/[id]/
 * summary → app/dashboard/admin/jobs/[id]/print). The founder's instruction on
 * Aug 17 was "we shouldn't have 2 different ways our ticket prints", and two
 * copies of a fallback rule is precisely how the two sheets start disagreeing
 * about who quoted a job.
 */

/** The `profiles` reader each route already has (its service-role client). */
export type FullNameLookup = (profileId: string) => Promise<string | null>;

export async function resolveQuotedBy(
  salesmanName: string | null | undefined,
  createdBy: string | null | undefined,
  lookup: FullNameLookup
): Promise<string> {
  const direct = String(salesmanName ?? '').trim();
  if (direct) return direct;
  if (!createdBy) return '';
  try {
    return (await lookup(createdBy))?.trim() || '';
  } catch {
    // A missing name must never cost the crew the ticket.
    return '';
  }
}
