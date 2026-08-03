/**
 * Who receives a job ticket on dispatch — pure, dependency-free so it can be
 * unit-tested without dragging in the Supabase/Resend/SMS import chain.
 * Consumed by lib/dispatch.ts.
 */

export interface DispatchRecipient {
  userId: string;
  role: 'operator' | 'helper';
}

/**
 * The lead (job_orders.assigned_to), the helper slot
 * (job_orders.helper_assigned_to), and every extra job_crew member —
 * de-duplicated, slot role winning over crew role.
 *
 * This answers the founder's question: "if I assign 2 operators… even though I
 * make one a lead, does the other operator still get the ticket?" Dispatch used
 * to read the two slots ONLY, so anyone added through the "+" (job_crew) path
 * was silently skipped and never got a ticket or a text.
 */
export function resolveDispatchRecipients(
  job: { assigned_to?: string | null; helper_assigned_to?: string | null },
  crew: { user_id: string; role: string }[] = [],
): DispatchRecipient[] {
  const out: DispatchRecipient[] = [];
  const seen = new Set<string>();
  const add = (userId: string | null | undefined, role: 'operator' | 'helper') => {
    if (!userId || seen.has(userId)) return;
    seen.add(userId);
    out.push({ userId, role });
  };
  add(job.assigned_to, 'operator');
  add(job.helper_assigned_to, 'helper');
  for (const c of crew) add(c.user_id, c.role === 'helper' ? 'helper' : 'operator');
  return out;
}
