/**
 * The Supabase-backed implementation of HealthDataSource.
 *
 * TWO RULES GOVERN EVERY QUERY IN THIS FILE.
 *
 * 1. EXPLICIT tenant_id, ALWAYS. `supabaseAdmin` uses the service role and
 *    bypasses RLS completely, so there is no safety net under a forgotten
 *    scope — a missing `.eq('tenant_id', …)` is a cross-tenant data leak, full
 *    stop. Where a query needs a second table, that table is filtered by
 *    tenant_id too rather than trusting the id list it was handed.
 *
 * 2. THROW, NEVER RETURN EMPTY. Every Supabase error becomes an exception, which
 *    `runMetric` turns into status 'unknown'. Returning `data ?? []` on error —
 *    the reflex this codebase is full of — would make a broken query look like a
 *    perfectly healthy zero, which is the precise failure this feature exists to
 *    end. PostgREST rejects an ENTIRE select when one column name is wrong, so
 *    this is not hypothetical: it is how a feature returns nothing and looks
 *    merely empty while `tsc` and `npm run build` both pass.
 *
 * Every column named below was verified against information_schema on project
 * klatddoyncxidgqtcjnu on 2026-08-17 before it was written.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import type {
  AgingJobRow,
  CloseoutRow,
  CompletedJobRow,
  CrewRow,
  HealthDataSource,
  TimecardRow,
} from './types';

/**
 * Roles whose people are paid for hours and can stand on a crew.
 *
 * Intentionally NOT `CREW_SLOT_ROLES` from lib/rbac: that list includes
 * super_admin so the founder can be dispatched to a job, and flagging the
 * platform owner for a missing hourly rate would be noise. Salesmen and office
 * admins are excluded for the same reason — they are not paid off a timecard.
 */
const PAID_CREW_ROLES = [
  'operator',
  'apprentice',
  'supervisor',
  'shop_manager',
  'operations_manager',
] as const;

/** Statuses where a job is still live work, so an empty crew slot is a problem. */
const LIVE_JOB_STATUSES = ['scheduled', 'assigned', 'in_progress', 'on_hold'] as const;

/** Turn a PostgREST error into a throw carrying the message the founder needs. */
function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? 'unknown database error'}`);
}

const COMPLETED_JOB_COLUMNS =
  'id, job_number, customer_signature, completion_signature, completion_signature_url, ' +
  'completion_signed_at, office_completed_at, work_completed_at';

export function createSupabaseHealthDataSource(): HealthDataSource {
  return {
    async recentCompletedJobs(tenantId: string, limit: number): Promise<CompletedJobRow[]> {
      // Ordered by when the work actually finished. Jobs with no
      // work_completed_at (never went through the field flow at all — 8 of
      // Patriot's 15 today) sort LAST rather than first, so a small sample is
      // spent on the jobs we know the most about.
      const { data, error } = await supabaseAdmin
        .from('job_orders')
        .select(COMPLETED_JOB_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .is('deleted_at', null)
        .order('work_completed_at', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error) fail('reading completed jobs', error);
      return (data ?? []) as unknown as CompletedJobRow[];
    },

    async recentCloseouts(tenantId: string, sinceYMD: string): Promise<CloseoutRow[]> {
      // daily_job_logs.tenant_id is NOT NULL and fully backfilled (verified
      // 2026-08-17: 0 of 58 rows null), so it can be filtered directly.
      const { data: logs, error } = await supabaseAdmin
        .from('daily_job_logs')
        .select('job_order_id, log_date')
        .eq('tenant_id', tenantId)
        .not('day_completed_at', 'is', null)
        .gte('log_date', sinceYMD);
      if (error) fail('reading day closeouts', error);

      const rows = (logs ?? []) as Array<{ job_order_id: string; log_date: string }>;
      if (rows.length === 0) return [];

      // Second query rather than a PostgREST embed: an embed's alias depends on
      // the FK's generated name, which is exactly the kind of string that
      // typechecks, builds, and then returns nothing in production.
      const jobIds = Array.from(new Set(rows.map((r) => r.job_order_id)));
      const { data: jobs, error: jobErr } = await supabaseAdmin
        .from('job_orders')
        .select('id, status, job_number')
        .eq('tenant_id', tenantId) // re-scoped, not trusted from the id list
        .is('deleted_at', null)
        .in('id', jobIds);
      if (jobErr) fail('reading jobs for day closeouts', jobErr);

      const jobById = new Map(
        ((jobs ?? []) as Array<{ id: string; status: string | null; job_number: string | null }>).map(
          (j) => [j.id, j]
        )
      );

      // A closeout whose job was deleted or belongs elsewhere is dropped, not
      // counted as stuck — it would be an unfixable permanent breach.
      return rows
        .filter((r) => jobById.has(r.job_order_id))
        .map((r) => ({
          job_order_id: r.job_order_id,
          log_date: r.log_date,
          job_status: jobById.get(r.job_order_id)?.status ?? null,
          job_number: jobById.get(r.job_order_id)?.job_number ?? null,
        }));
    },

    async recentTimecards(tenantId: string, sinceYMD: string): Promise<TimecardRow[]> {
      const { data, error } = await supabaseAdmin
        .from('timecards')
        .select('id, job_order_id')
        .eq('tenant_id', tenantId)
        .gte('date', sinceYMD);
      if (error) fail('reading timecards', error);
      return (data ?? []) as TimecardRow[];
    },

    async unassignedAgingJobs(tenantId: string, cutoffYMD: string): Promise<AgingJobRow[]> {
      const { data, error } = await supabaseAdmin
        .from('job_orders')
        .select('id, job_number, scheduled_date')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .in('status', LIVE_JOB_STATUSES as unknown as string[])
        .is('assigned_to', null)
        .is('helper_assigned_to', null)
        // Never scheduled at all is just as forgotten as scheduled and passed.
        .or(`scheduled_date.lt.${cutoffYMD},scheduled_date.is.null`);
      if (error) fail('reading unassigned jobs', error);

      const candidates = (data ?? []) as AgingJobRow[];
      if (candidates.length === 0) return [];

      // A job can also be crewed through job_crew without either named slot
      // being filled. Missing this check would report properly-staffed
      // multi-operator jobs as abandoned.
      const { data: crew, error: crewErr } = await supabaseAdmin
        .from('job_crew')
        .select('job_order_id')
        .eq('tenant_id', tenantId)
        .in(
          'job_order_id',
          candidates.map((c) => c.id)
        );
      if (crewErr) fail('reading job crew', crewErr);

      const crewed = new Set(
        ((crew ?? []) as Array<{ job_order_id: string }>).map((c) => c.job_order_id)
      );
      return candidates.filter((c) => !crewed.has(c.id));
    },

    async activeCrew(tenantId: string, sinceYMD: string): Promise<CrewRow[]> {
      // NO `.eq('active', true)`, deliberately, and this is the whole point of
      // the metric. Patriot today: 18 people filed a timecard in the last 90
      // days; Javi (apprentice) and David (supervisor) are both switched off,
      // both NOT deleted, and both have no hourly rate. Filtering on `active`
      // shrinks the denominator to 13 and hides exactly the two people whose
      // hours still cost $0 — the metric would conceal the failure it exists
      // to catch, and going green would be a lie.
      //
      // `deleted_at` IS still excluded: a deleted profile is gone, not merely
      // switched off, and nobody can set a rate on one.
      const { data: profiles, error } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, hourly_rate')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .in('role', PAID_CREW_ROLES as unknown as string[]);
      if (error) fail('reading crew profiles', error);

      const crew = (profiles ?? []) as CrewRow[];
      if (crew.length === 0) return [];

      // "Active" means they actually worked, not that a flag says so — in
      // BOTH directions. A profile left switched on for somebody who quit in
      // April is not a payroll hole; a profile switched off for somebody who
      // filed hours last month very much is.
      const { data: cards, error: cardErr } = await supabaseAdmin
        .from('timecards')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .gte('date', sinceYMD)
        .in(
          'user_id',
          crew.map((c) => c.id)
        );
      if (cardErr) fail('reading timecards for crew activity', cardErr);

      const worked = new Set(((cards ?? []) as Array<{ user_id: string }>).map((c) => c.user_id));
      return crew.filter((c) => worked.has(c.id));
    },
  };
}
