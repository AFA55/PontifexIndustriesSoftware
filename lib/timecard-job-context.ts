/**
 * WHERE WAS THIS PERSON, ON THIS DAY?
 *
 * WHY (founder + Amanda, Aug 20): *"It will be easier when processing timecards
 * to be able to see contractor name, job ID and project name when doing payroll,
 * and work performed be separate. Their hours in the timecard are true, and then
 * when we separate between jobs is more when we look at the ticket and work
 * performed."*
 *
 * That settles a question that had been open since Aug 19. The timecard and the
 * work ticket are two documents answering two questions:
 *
 *   TIMECARD  — what do we PAY this person?    hours = the true clocked day,
 *               WHOLE and never divided; jobs are LISTED for reference.
 *   TICKET    — what do we BILL this customer? hours = DIVIDED per job at each
 *               In Route press (lib/job-day-boundary.ts).
 *
 * So this module names jobs. It never apportions hours, and nothing that reads
 * it may. `lib/job-day-boundary.ts` is deliberately NOT imported here.
 *
 * ── THE PRECEDENCE LADDER: BOARD > FILED LOG > CLOCK-IN TAG ──────────────────
 *
 * Three kinds of record can name a job for a person-day, and on real data they
 * disagree. `resolveDayJobs` below is the ONE implementation of the rule; the
 * ticket splitter (`lib/job-clock-attribution.ts`) calls the same function, so
 * the two surfaces can never drift into two different answers about where
 * somebody was.
 *
 *   1. `job_daily_assignments` — the office's own per-day placement. When the
 *      office placed this person ANYWHERE that day, that placement IS the day's
 *      job list.
 *   2. `daily_job_logs` / `helper_work_logs` — the paperwork the crew filed.
 *      Consulted only when rung 1 said nothing at all.
 *   3. `timecards.job_order_id` — the clock-in stamp. LAST, and marked inferred
 *      when it is what answered.
 *
 * WHY THE CLOCK-IN TAG IS LAST, despite being stored on the payroll row itself.
 * It is a 7 a.m. guess that is never revisited. The crew clocks in 07:00–07:15
 * ET; the office finishes the board 07:15–08:10. **Every card is stamped before
 * the board is ready.** Proven twice on Axel Valverde, to the second:
 *
 *   • Tue Aug 11 — clocked in 11:10:18Z. The only assignment row that existed
 *     for him at that instant was Leifeng Construction (day_sequence 3, created
 *     the previous afternoon), so the card was stamped Leifeng. The office
 *     created his real first job, Industrial Safety Coatings (day_sequence 1),
 *     at 11:14:30Z — four minutes twelve seconds later. The card was never
 *     updated.
 *   • Wed Aug 12 — clocked in 11:05:09Z with NO board row at all for that date,
 *     so the resolver reused Leifeng again. The office placed him on Estes
 *     Heating and Air at 12:06:19Z — sixty-one minutes later. The card still
 *     says Leifeng; the founder confirms he was at Estes with Keontre.
 *
 * Leifeng (JOB-2026-400368) has null `assigned_to` and `helper_assigned_to`, no
 * `job_crew` row, and has sat `status='scheduled'` since Aug 10 — it is not even
 * reachable today. That tag is pure residue. Any design that trusts the frozen
 * stamp is wrong for the whole crew, not for two people.
 *
 * WHY THE BOARD OUTRANKS THE FILED LOG. A completed job stays reachable on a
 * phone and catches later filings. Keontre's real week, Aug 17–20 2026: two AM
 * King jobs at one address, QA-2026-533392 (scheduled 8/17 only, completed, no
 * project name) and JOB-2026-898480 ("GE - KAA pit infill", 8/19 onward). His
 * Wednesday 8/19 card AND the board both name 898480; his Wednesday LOG names
 * the old 533392. Ranking the log first would print the wrong project on a
 * payroll document. Same shape as Dante's Aug 12 closeout, and as Nate's Aug 20
 * clock-in.
 *
 * ── AND THE DISAGREEMENT IS REPORTED, NOT SWALLOWED ──────────────────────────
 *
 * A timecard that quietly picks the wrong job is WORSE than one that shows
 * none, because the office would trust it. So a job named only by a rung the
 * ladder outranked comes back in `conflicts` — visible on the card, next to the
 * job that won, so a human can see the two and decide. Keontre's Wednesday
 * prints 898480 with a note that a work log for that day names 533392; Axel's
 * Aug 12 prints Estes with a note that his clock-in tag says Leifeng. Catching
 * that discrepancy is a thing the office is being asked to do and today cannot.
 *
 * Nothing here repairs the underlying rows. His Wednesday log is his own filed
 * work; re-pointing it would change what an operator recorded.
 *
 * ⚠️ Deliberately READ-time. Nothing here writes a derived value back into the
 * payroll record. A derivation can be wrong; a guess written into `timecards` is
 * indistinguishable from something the operator actually did, and payroll is the
 * last place to put a guess.
 *
 * ⚠️ A DEAD QUERY MUST NEVER PRESENT AS "no job". That is indistinguishable on
 * a printed timecard from the defect this module exists to fix, and the office
 * runs payroll off the printout. Every read throws (`TimecardJobContextError`);
 * `loadTimecardDayJobs` catches once and hands the caller an `error` string it
 * is expected to PRINT, so a failure reads as "could not load" and never as a
 * blank.
 *
 * ⚠️ SERVER ONLY. This imports `supabaseAdmin`, which carries the service-role
 * key. Never import it — not even the pure `format*` helpers — from a `'use
 * client'` file; API routes format the labels and send strings.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  resolveDayJobs,
  personDayKey,
  type JobDayEvidence,
  type DayJobResolution,
  type JobEvidenceSource,
  type TimecardJobContext,
  type TimecardDayJobs,
} from '@/lib/timecard-job-rules';

// The RULE and the WORDS for it live in lib/timecard-job-rules.ts, which has no
// database import; this module owns the READS. Re-exported so every existing
// call site keeps one import, and so a `'use client'` page that only needs a
// formatter can reach for the pure module instead of this one.
export * from '@/lib/timecard-job-rules';

// ── The data layer ───────────────────────────────────────────────────────────

export interface TimecardLike {
  id: string;
  user_id: string;
  /** YYYY-MM-DD */
  date: string;
  job_order_id?: string | null;
}

/**
 * No tenant to scope by. Distinct from a failed read, and deliberately NOT
 * caught by `loadTimecardDayJobs`: a read failure degrades to a printed "job
 * lookup failed", but an unscoped read must not happen at all, so this one
 * propagates and the caller's route fails loudly.
 */
export class TimecardTenantScopeError extends Error {
  constructor() {
    super(
      'resolveTimecardDayJobs: tenantId is required. These are service-role ' +
        'reads with RLS bypassed — without a tenant they would return every ' +
        "tenant's jobs onto one company's payroll document."
    );
    this.name = 'TimecardTenantScopeError';
  }
}

/**
 * A failed read, named. See the module note: never a silent empty result.
 */
export class TimecardJobContextError extends Error {
  constructor(
    /** Which read failed, in plain words, e.g. 'daily assignments'. */
    readonly step: string,
    readonly pgError: { message?: string; code?: string; details?: string; hint?: string } | null
  ) {
    super(
      `resolveTimecardDayJobs: the ${step} query failed — ` +
        `${pgError?.message ?? 'unknown error'}${pgError?.code ? ` [${pgError.code}]` : ''}`
    );
    this.name = 'TimecardJobContextError';
  }
}

function rowsOrThrow(result: { data: unknown; error: unknown }, step: string): any[] {
  if (result.error) {
    // The PostgREST `details`/`hint` name the offending column and exist only on
    // the error object, so log the object as well as throwing the message.
    console.error(`[resolveTimecardDayJobs] ${step} query failed`, result.error);
    throw new TimecardJobContextError(step, result.error as any);
  }
  return ((result.data as any[]) ?? []);
}

/**
 * Resolve every job each person was on, for each day a card exists, in a fixed
 * number of queries — never one per row.
 *
 * @param timecards the cards whose person-days should be resolved
 * @param tenantId  applied to EVERY read, unconditionally. `supabaseAdmin`
 *                  bypasses RLS, so this is the only thing keeping another
 *                  tenant's job name off a payroll document. REQUIRED — the
 *                  old `if (tenantId) q = q.eq(...)` shape (the idiom
 *                  `lib/api-auth.ts` documents as unsafe) turned a null tenant
 *                  into four unscoped cross-tenant reads. It refuses now
 *                  instead of degrading.
 * @returns map keyed by `personDayKey(user_id, date)`
 * @throws TimecardTenantScopeError if `tenantId` is missing.
 * @throws TimecardJobContextError if any read fails.
 */
export async function resolveTimecardDayJobs(
  timecards: TimecardLike[],
  tenantId: string
): Promise<Map<string, TimecardDayJobs>> {
  // Checked BEFORE the early return: a caller with no cards today would
  // otherwise get a pass and only blow up on the week somebody worked.
  if (!tenantId) throw new TimecardTenantScopeError();

  const out = new Map<string, TimecardDayJobs>();
  if (timecards.length === 0) return out;

  const userIds = [...new Set(timecards.map((t) => t.user_id).filter(Boolean))];
  const dates = [...new Set(timecards.map((t) => t.date).filter(Boolean))];
  if (userIds.length === 0 || dates.length === 0) return out;

  /** person-day → the evidence naming a job, before the ladder is applied. */
  const evidence = new Map<string, JobDayEvidence[]>();
  /** Every person-day we must answer for, card or not. */
  const personDays = new Map<string, { userId: string; date: string }>();
  const note = (userId: string, date: string, jobId: string | null | undefined, source: JobEvidenceSource) => {
    if (!userId || !date) return;
    const key = personDayKey(userId, date);
    if (!personDays.has(key)) return; // not one of the days we were asked about
    if (!jobId) return;
    const list = evidence.get(key) ?? [];
    list.push({ jobId, source });
    evidence.set(key, list);
  };

  for (const t of timecards) {
    if (!t.user_id || !t.date) continue;
    personDays.set(personDayKey(t.user_id, t.date), { userId: t.user_id, date: t.date });
  }
  // Rung 1 — the card's own stamp.
  for (const t of timecards) note(t.user_id, t.date, t.job_order_id ?? null, 'timecard');

  // Rung 2 — the office's per-day ledger. Both slots: helpers file only the
  // helper log, and leaving `helper_id` out is how a helper's day loses its job.
  // The `.or()` keeps this to the people we were asked about; without it the
  // read pulled every assignment row in the tenant for those dates.
  const idList = userIds.join(',');
  const ledgerQuery = supabaseAdmin
    .from('job_daily_assignments')
    .select('job_order_id, assignment_date, operator_id, helper_id')
    .eq('tenant_id', tenantId)
    .in('assignment_date', dates)
    .or(`operator_id.in.(${idList}),helper_id.in.(${idList})`);

  // Rung 3 — the paperwork they filed.
  const opLogQuery = supabaseAdmin
    .from('daily_job_logs')
    .select('job_order_id, operator_id, log_date')
    .eq('tenant_id', tenantId)
    .in('operator_id', userIds)
    .in('log_date', dates);

  const helperLogQuery = supabaseAdmin
    .from('helper_work_logs')
    .select('job_order_id, helper_id, log_date')
    .eq('tenant_id', tenantId)
    .in('helper_id', userIds)
    .in('log_date', dates);

  const [ledgerRes, opLogRes, helperLogRes] = await Promise.all([
    ledgerQuery,
    opLogQuery,
    helperLogQuery,
  ]);
  const ledger = rowsOrThrow(ledgerRes, 'daily assignments');
  const opLogs = rowsOrThrow(opLogRes, 'operator daily logs');
  const helperLogs = rowsOrThrow(helperLogRes, 'helper work logs');

  for (const r of ledger) {
    // Empty skeleton rows hold a date open on the board — nobody was placed, so
    // they must not count as the office having spoken.
    if (!r.operator_id && !r.helper_id) continue;
    note(r.operator_id, r.assignment_date, r.job_order_id, 'day_ledger');
    note(r.helper_id, r.assignment_date, r.job_order_id, 'day_ledger');
  }
  for (const r of opLogs) note(r.operator_id, r.log_date, r.job_order_id, 'operator_log');
  for (const r of helperLogs) note(r.helper_id, r.log_date, r.job_order_id, 'helper_log');

  // Apply the ladder once per person-day.
  const resolutions = new Map<string, DayJobResolution>();
  const neededJobIds = new Set<string>();
  for (const [key] of personDays) {
    const res = resolveDayJobs(evidence.get(key) ?? []);
    resolutions.set(key, res);
    for (const j of res.jobIds) neededJobIds.add(j);
    for (const j of res.conflictJobIds) neededJobIds.add(j);
  }

  // One lookup for every job we landed on.
  const jobById = new Map<string, {
    id: string;
    job_number: string | null;
    customer_name: string | null;
    project_name: string | null;
    status: string | null;
  }>();
  if (neededJobIds.size > 0) {
    const jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, project_name, status')
      .eq('tenant_id', tenantId)
      .in('id', [...neededJobIds]);
    for (const j of rowsOrThrow(await jobQuery, 'job identity')) jobById.set(j.id, j);
  }

  for (const [key, { userId, date }] of personDays) {
    const res = resolutions.get(key)!;
    const hydrate = (jobId: string): TimecardJobContext | null => {
      const job = jobById.get(jobId);
      // A job the tenant filter excluded is NOT this tenant's to show.
      if (!job) return null;
      return {
        jobOrderId: jobId,
        jobNumber: job.job_number,
        customerName: job.customer_name,
        projectName: job.project_name,
        jobStatus: job.status,
        // Always present; the fallback is the most conservative rung, so a
        // hypothetical miss degrades to "inferred" rather than to "recorded".
        source: res.sourceByJobId.get(jobId) ?? 'timecard',
      };
    };
    const jobs = res.jobIds.map(hydrate).filter((j): j is TimecardJobContext => j !== null);
    const conflicts = res.conflictJobIds
      .map(hydrate)
      .filter((j): j is TimecardJobContext => j !== null);
    out.set(key, { userId, date, jobs, conflicts, unresolved: jobs.length === 0 });
  }

  return out;
}

/** What `loadTimecardDayJobs` hands back — the answer, or the reason there isn't one. */
export interface TimecardDayJobsResult {
  byPersonDay: Map<string, TimecardDayJobs>;
  /**
   * Set when the lookup FAILED. The caller must print this state ("job lookup
   * failed"), never render it as a blank or as "no job" — those are different
   * and much worse claims on a document payroll is run from.
   */
  error: string | null;
}

/**
 * `resolveTimecardDayJobs`, with the READ failure caught once so a surface can
 * degrade honestly instead of 500-ing a whole payroll week over the job NAMES.
 *
 * A missing tenant is NOT caught. Degrading there would mean printing a payroll
 * sheet built from an unscoped, RLS-bypassed read — the failure the catch exists
 * to soften is "we could not name the jobs", not "we do not know whose data this
 * is". `TimecardTenantScopeError` propagates to the route.
 */
export async function loadTimecardDayJobs(
  timecards: TimecardLike[],
  tenantId: string
): Promise<TimecardDayJobsResult> {
  try {
    return { byPersonDay: await resolveTimecardDayJobs(timecards, tenantId), error: null };
  } catch (e) {
    if (e instanceof TimecardJobContextError) {
      return { byPersonDay: new Map(), error: e.message };
    }
    throw e;
  }
}
