/**
 * WHERE WAS THIS PERSON, ON THIS DAY?
 *
 * WHY (founder, Aug 11): "I would like to see contractor name and project name
 * in timecards, to see where operators were within a timecard. For certain
 * contractors we like to see how many hours we are working on certain projects."
 *
 * `timecards.job_order_id` is the direct answer, but it is stamped at clock-in
 * and was missing on roughly 40% of recent FIELD timecards (37 of 90, measured
 * Aug 11) — the clock-in lookup only considered the two job-level slots, so
 * anyone on `job_crew` or placed by the per-day ledger got nothing.
 *
 * The clock-in lookup is now wider, which fixes it going FORWARD. This fills in
 * the past, and any case the stamp still misses, by DERIVING from what the
 * person actually recorded that day:
 *
 *   1. the timecard's own `job_order_id`            (authoritative)
 *   2. `job_daily_assignments` for that user + date (the office's own ledger)
 *   3. `daily_job_logs`   — they filed an operator ticket for a job that day
 *   4. `helper_work_logs` — they filed a helper log for a job that day
 *
 * ⚠️ Deliberately READ-time. Nothing here writes a derived value back into the
 * payroll record. A derivation can be wrong; a guess written into `timecards`
 * is indistinguishable from something the operator actually did, and payroll is
 * the last place to put a guess.
 *
 * When nothing resolves, the caller gets `null` and must say "not recorded"
 * rather than render a blank that reads as no hours.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

export interface TimecardJobContext {
  jobOrderId: string;
  jobNumber: string | null;
  /** The contractor being billed — what the founder calls "contractor name". */
  customerName: string | null;
  /** The project, when the job has one. Many don't. */
  projectName: string | null;
  /** How we know — so the UI can be honest about a derived answer. */
  source: 'timecard' | 'day_ledger' | 'operator_log' | 'helper_log';
}

export interface TimecardLike {
  id: string;
  user_id: string;
  /** YYYY-MM-DD */
  date: string;
  job_order_id?: string | null;
}

/**
 * Resolve job context for a batch of timecards in a fixed number of queries —
 * never one query per row.
 *
 * Returns a map keyed by timecard id. Missing key = could not be resolved.
 */
export async function resolveTimecardJobContext(
  timecards: TimecardLike[],
  tenantId: string | null
): Promise<Map<string, TimecardJobContext>> {
  const out = new Map<string, TimecardJobContext>();
  if (timecards.length === 0) return out;

  const userIds = [...new Set(timecards.map((t) => t.user_id).filter(Boolean))];
  const dates = [...new Set(timecards.map((t) => t.date).filter(Boolean))];

  /** timecard id → job id, first source to answer wins. */
  const resolved = new Map<string, { jobId: string; source: TimecardJobContext['source'] }>();

  // 1. The stamp itself.
  for (const t of timecards) {
    if (t.job_order_id) resolved.set(t.id, { jobId: t.job_order_id, source: 'timecard' });
  }

  const unresolved = () => timecards.filter((t) => !resolved.has(t.id));

  // 2. The per-day ledger — the office's own record of who was where.
  if (unresolved().length > 0) {
    let q = supabaseAdmin
      .from('job_daily_assignments')
      .select('job_order_id, assignment_date, operator_id, helper_id')
      .in('assignment_date', dates);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data: ledger } = await q;

    const byKey = new Map<string, string>();
    for (const r of ledger ?? []) {
      if (r.operator_id) byKey.set(`${r.operator_id}|${r.assignment_date}`, r.job_order_id);
      if (r.helper_id) byKey.set(`${r.helper_id}|${r.assignment_date}`, r.job_order_id);
    }
    for (const t of unresolved()) {
      const jobId = byKey.get(`${t.user_id}|${t.date}`);
      if (jobId) resolved.set(t.id, { jobId, source: 'day_ledger' });
    }
  }

  // 3. They filed an operator ticket that day.
  if (unresolved().length > 0) {
    const { data: logs } = await supabaseAdmin
      .from('daily_job_logs')
      .select('job_order_id, operator_id, log_date')
      .in('operator_id', userIds)
      .in('log_date', dates);

    const byKey = new Map<string, string>();
    for (const r of logs ?? []) {
      if (r.job_order_id) byKey.set(`${r.operator_id}|${r.log_date}`, r.job_order_id);
    }
    for (const t of unresolved()) {
      const jobId = byKey.get(`${t.user_id}|${t.date}`);
      if (jobId) resolved.set(t.id, { jobId, source: 'operator_log' });
    }
  }

  // 4. They filed a helper log that day.
  if (unresolved().length > 0) {
    const { data: hlogs } = await supabaseAdmin
      .from('helper_work_logs')
      .select('job_order_id, helper_id, log_date')
      .in('helper_id', userIds)
      .in('log_date', dates);

    const byKey = new Map<string, string>();
    for (const r of hlogs ?? []) {
      if (r.job_order_id) byKey.set(`${r.helper_id}|${r.log_date}`, r.job_order_id);
    }
    for (const t of unresolved()) {
      const jobId = byKey.get(`${t.user_id}|${t.date}`);
      if (jobId) resolved.set(t.id, { jobId, source: 'helper_log' });
    }
  }

  if (resolved.size === 0) return out;

  // One lookup for every job we landed on.
  const jobIds = [...new Set([...resolved.values()].map((r) => r.jobId))];
  let jq = supabaseAdmin
    .from('job_orders')
    .select('id, job_number, customer_name, project_name')
    .in('id', jobIds);
  if (tenantId) jq = jq.eq('tenant_id', tenantId);
  const { data: jobs } = await jq;

  const jobById = new Map(
    (jobs ?? []).map((j: { id: string; job_number: string | null; customer_name: string | null; project_name: string | null }) => [j.id, j])
  );

  for (const [timecardId, r] of resolved) {
    const job = jobById.get(r.jobId);
    // A job that the tenant filter excluded is NOT this tenant's to show.
    if (!job) continue;
    out.set(timecardId, {
      jobOrderId: r.jobId,
      jobNumber: job.job_number,
      customerName: job.customer_name,
      projectName: job.project_name,
      source: r.source,
    });
  }

  return out;
}

/** "Collins Custom Builds — Purple Power", or just the contractor, or null. */
export function formatJobContextLabel(ctx: TimecardJobContext | undefined): string | null {
  if (!ctx) return null;
  const parts = [ctx.customerName, ctx.projectName].filter(Boolean);
  return parts.length > 0 ? parts.join(' — ') : ctx.jobNumber;
}
