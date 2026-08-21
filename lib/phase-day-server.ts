/**
 * Server side of the phase day number: read the phases, read the proven dates,
 * hand both to the pure numbering in `lib/phase-day.ts`.
 *
 * Kept apart from that file on purpose — the arithmetic is tested, this is I/O.
 *
 * ── IT MUST NEVER TAKE THE JOB SCREEN DOWN ──────────────────────────────────
 *
 * `job_phases` DOES NOT EXIST YET. Its migration is written and deliberately
 * unapplied, so every call here currently gets `PGRST205 Could not find the
 * table 'public.job_phases' in the schema cache` back from PostgREST. (NOT
 * `42P01` — that is Postgres's own undefined_table SQLSTATE, which PostgREST
 * answers with only for a table it knew about and then lost. Handling here is
 * code-agnostic, so nothing behaved differently; the comment was simply wrong,
 * and a wrong code in a comment is what the next person copies.) That is the
 * normal case today, not an incident: it is caught, it degrades to "no phases",
 * and the routes simply omit the field.
 *
 * The same restraint applies to the evidence read. This is a decoration on a
 * job payload — if any part of it fails, the crew's ticket must still render
 * with the number it has always shown. Nothing in here is allowed to throw and
 * nothing in here is allowed to change a field that already existed.
 */

import { supabaseAdmin } from './supabase-admin';
import { isTableNotFoundError } from './api-auth';
import type { JobPhase } from './job-phases';
import { phaseDayFields } from './phase-day';

/**
 * ── DO NOT ASK A HUNDRED TIMES FOR A TABLE THAT IS NOT THERE ────────────────
 *
 * Until the migration lands, every operator job load spends a round trip
 * proving `job_phases` still does not exist. This latches on the first
 * table-not-found and skips the read for a few minutes, then tries again — a
 * permanent latch would keep skipping after the founder applies the migration
 * until something redeployed, which is the same class of bug in the other
 * direction. Only table-absence latches; a transient error is not cached.
 */
const PHASES_MISSING_TTL_MS = 5 * 60 * 1000;
let phasesMissingUntil = 0;

/** Exactly the `job_phases` columns `lib/job-phases.ts` reads. */
const PHASE_COLUMNS =
  'id, job_order_id, phase_number, started_on, scope_text, parked_on, park_reason';

/** Tenant-local YYYY-MM-DD "today" (falls back to America/New_York). */
export async function tenantLocalToday(
  tenantId: string | null | undefined
): Promise<string> {
  let tz = 'America/New_York';
  try {
    if (tenantId) {
      const { data } = await supabaseAdmin
        .from('tenants')
        .select('timezone')
        .eq('id', tenantId)
        .maybeSingle();
      if (data?.timezone) tz = data.timezone;
    }
  } catch {
    /* non-critical — fall back */
  }
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

/**
 * Attach `phase_day_number` / `phase_number` to jobs that have phases.
 *
 * Mutates in place, adds nothing to a job with no phase rows, and does not run
 * a query per job.
 *
 * `today` is the tenant-local calendar day being numbered. Pass the STRING when
 * the caller already has it; pass a THUNK when it would have to be fetched,
 * because resolving it costs a `tenants` select and is only needed for a job
 * that actually has phases — which today is no job at all. Resolving it eagerly
 * put two sequential round trips on the operator's job-detail load, one of them
 * a guaranteed miss, before either could be shown to be needed.
 */
export async function attachPhaseDayNumbers(
  jobs: Array<Record<string, any>>,
  today: string | (() => string | Promise<string>)
): Promise<void> {
  if (!jobs || jobs.length === 0 || !today) return;
  // The table is known absent right now: skip the read entirely (see the latch).
  if (Date.now() < phasesMissingUntil) return;

  const jobIds = Array.from(
    new Set(jobs.map((j) => j?.id).filter((id): id is string => !!id))
  );
  if (jobIds.length === 0) return;

  try {
    const { data: phaseRows, error: phaseError } = await supabaseAdmin
      .from('job_phases')
      .select(PHASE_COLUMNS)
      .in('job_order_id', jobIds);

    if (phaseError && isTableNotFoundError(phaseError)) {
      phasesMissingUntil = Date.now() + PHASES_MISSING_TTL_MS;
      return;
    }

    // The unapplied-migration case, and every other read failure. No phases →
    // no field → the client keeps the number it already had.
    if (phaseError || !phaseRows || phaseRows.length === 0) return;

    // Only now is the tenant's calendar day worth a query.
    const todayYMD = typeof today === 'string' ? today : await today();
    if (!todayYMD) return;

    const phasesByJob = new Map<string, JobPhase[]>();
    for (const row of phaseRows as unknown as JobPhase[]) {
      const list = phasesByJob.get(row.job_order_id);
      if (list) list.push(row);
      else phasesByJob.set(row.job_order_id, [row]);
    }

    const phasedIds = Array.from(phasesByJob.keys());

    // The proven work dates. ONE definition of which days count, and it is this
    // view — a filed log, or a named crew the office placed who clocked in.
    const { data: evidence, error: evidenceError } = await supabaseAdmin
      .from('job_workday_evidence')
      .select('job_order_id, work_date')
      .in('job_order_id', phasedIds);

    if (evidenceError) return;

    const datesByJob = new Map<string, string[]>();
    for (const row of evidence || []) {
      // `work_date` is a DB `date`, so PostgREST hands it back as a bare
      // 'YYYY-MM-DD' string. It is never passed through `new Date()` here —
      // doing so is the timezone bug this codebase keeps paying for.
      const list = datesByJob.get(row.job_order_id);
      if (list) list.push(row.work_date);
      else datesByJob.set(row.job_order_id, [row.work_date]);
    }

    for (const job of jobs) {
      const phases = phasesByJob.get(job.id);
      if (!phases) continue;
      const fields = phaseDayFields({
        phases,
        provenDates: datesByJob.get(job.id) ?? [],
        today: todayYMD,
      });
      if (!fields) continue;
      job.phase_day_number = fields.phase_day_number;
      job.phase_number = fields.phase_number;
    }
  } catch {
    /* never take the operator's job screen down over a day label */
  }
}
