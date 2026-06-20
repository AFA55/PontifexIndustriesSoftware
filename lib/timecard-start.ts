/**
 * Effective start-time resolution for late detection.
 *
 * An operator's scheduled start for a given tenant-local day is resolved by precedence
 * (highest first) — see docs/plans/START_TIME_LATE_PLAN.md:
 *   1. job        — the per-job ticket start (job_orders.arrival_time / shop_arrival_time)
 *   2. day_override — a per-day override (timecard_day_overrides), most-specific match:
 *                     operator > role > all  (e.g. safety-training Monday 6:30 AM for everyone)
 *   3. standard   — the tenant standard start time (tenants.default_start_time)
 *   (none)        — no baseline → caller skips late detection (fail-open, never false-flag)
 *
 * This is the fix for "clocked in at 8 but wasn't flagged late": previously late detection
 * ONLY ran when a job arrival_time existed, so operators with no job today were never checked.
 * Now the chain falls through to the per-day override and the tenant standard.
 *
 * Reads go through the service-role client (callers already hold an explicit tenant_id),
 * so RLS is not relied on here — every query is hard-filtered by tenant_id.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type StartSource = 'job' | 'day_override' | 'standard';

export interface EffectiveStart {
  /** Local wall-clock start time as 'HH:MM' or 'HH:MM:SS', or null when none resolves. */
  startTime: string | null;
  source: StartSource | null;
  /** Today's assigned job (for notification context), present whenever one was found. */
  job: { id: string; customer_name: string | null } | null;
}

const ACTIVE_JOB_STATUSES = [
  'assigned', 'dispatched', 'in_route', 'on_site', 'in_progress', 'scheduled',
];

export async function resolveEffectiveStart(params: {
  supabaseAdmin: SupabaseClient;
  tenantId: string;
  operatorId: string;
  role: string | null;
  /** Tenant-local calendar date 'YYYY-MM-DD'. */
  localDate: string;
  isShopHours: boolean;
}): Promise<EffectiveStart> {
  const { supabaseAdmin, tenantId, operatorId, role, localDate, isShopHours } = params;

  let job: { id: string; customer_name: string | null } | null = null;

  // 1. Per-job ticket start time (highest precedence)
  try {
    const { data: jobs } = await supabaseAdmin
      .from('job_orders')
      .select('id, customer_name, arrival_time, shop_arrival_time')
      .eq('tenant_id', tenantId)
      .eq('assigned_to', operatorId)
      .eq('scheduled_date', localDate)
      .in('status', ACTIVE_JOB_STATUSES)
      .limit(1);

    if (jobs && jobs.length > 0) {
      const j = jobs[0];
      job = { id: j.id, customer_name: j.customer_name ?? null };
      const t: string | null = isShopHours ? j.shop_arrival_time : j.arrival_time;
      if (t) return { startTime: t, source: 'job', job };
    }
  } catch {
    // fall through — late detection is non-critical
  }

  // 2. Per-day override — most specific match wins (operator > role > all)
  try {
    const { data: ovs } = await supabaseAdmin
      .from('timecard_day_overrides')
      .select('start_time, scope, role, operator_id')
      .eq('tenant_id', tenantId)
      .eq('override_date', localDate);

    if (ovs && ovs.length > 0) {
      const byOperator = ovs.find((o) => o.scope === 'operator' && o.operator_id === operatorId);
      if (byOperator) return { startTime: byOperator.start_time, source: 'day_override', job };

      const byRole = role ? ovs.find((o) => o.scope === 'role' && o.role === role) : undefined;
      if (byRole) return { startTime: byRole.start_time, source: 'day_override', job };

      const forAll = ovs.find((o) => o.scope === 'all');
      if (forAll) return { startTime: forAll.start_time, source: 'day_override', job };
    }
  } catch {
    // fall through
  }

  // 3. Tenant standard start time
  try {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('default_start_time')
      .eq('id', tenantId)
      .maybeSingle();

    if (tenant?.default_start_time) {
      return { startTime: tenant.default_start_time, source: 'standard', job };
    }
  } catch {
    // fall through
  }

  return { startTime: null, source: null, job };
}
