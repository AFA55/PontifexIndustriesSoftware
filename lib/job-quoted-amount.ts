/**
 * lib/job-quoted-amount.ts — WHAT DID WE QUOTE THIS JOB AT?
 *
 * One rule, one label, for every screen that shows the quoted figure.
 *
 * WHY (guardian, Aug 17 2026): two columns hold this number and only one was
 * ever read per screen. `job_quote` is non-null on 1 of 48 production jobs;
 * `estimated_cost` — what the schedule form actually writes — is set on 9. So
 * the Completed Jobs modal (which reads `estimated_cost` first) showed
 * "Quoted $X" while the P&L page for the SAME job showed a $0 quote and a blank
 * margin, because its route read only `job_quote`. Two screens the office
 * prices work from cannot answer "what did we quote?" differently.
 *
 * PRECEDENCE: `estimated_cost` first (the form's field), `job_quote` as the
 * fallback (the older column, still authoritative where it is set), `null` when
 * neither is recorded — which is NOT the same as zero and must render as '—',
 * never as "$0 quoted".
 */

export interface QuotableJob {
  estimated_cost?: number | null;
  job_quote?: number | null;
}

/** The quoted amount, or `null` when the office never recorded one. */
export function quotedAmount(job: QuotableJob | null | undefined): number | null {
  for (const raw of [job?.estimated_cost, job?.job_quote]) {
    if (raw == null) continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** The label every screen uses for it, so two screens can't name it differently. */
export const QUOTED_AMOUNT_LABEL = 'Quoted Amount';
