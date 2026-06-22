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

/**
 * Recompute the late columns for a timecard whose clock-in time was EDITED.
 *
 * Convenience wrapper for the admin edit routes: it fetches the same inputs
 * clock-in uses — the configurable grace (`timecard_settings_v2.late_grace_minutes`,
 * default 7), the tenant timezone (`tenants.timezone`), and the resolved effective
 * start for the timecard's OWN local date (NOT today — edits are usually for past
 * days) — then runs the pure `computeLate`.
 *
 * Returns the exact columns to merge into the timecards UPDATE payload:
 *   { is_late, late_minutes, scheduled_start_time, late_source }
 * It is notification-free by design: an edit must NEVER re-alert admins.
 *
 * Fail-open: any lookup failure returns the cleared/on-time shape so an edit is
 * never blocked and a missing baseline never false-flags.
 */
export async function recomputeLateForEdit(params: {
  supabaseAdmin: SupabaseClient;
  tenantId: string;
  operatorId: string;
  role: string | null;
  /** The corrected clock-in instant (ISO string). */
  clockInIso: string;
  /** The timecard's stored bare date 'YYYY-MM-DD' (tenant-local calendar day). */
  localDate: string;
  isShopHours: boolean;
}): Promise<{
  is_late: boolean;
  late_minutes: number;
  scheduled_start_time: string | null;
  late_source: StartSource | null;
}> {
  const { supabaseAdmin, tenantId, operatorId, role, clockInIso, localDate, isShopHours } = params;

  // Configurable grace — same read clock-in does (aliased column name).
  let graceMinutes = 7;
  try {
    const { data: v2 } = await supabaseAdmin
      .from('timecard_settings_v2')
      .select('late_grace_minutes')
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();
    if (v2?.late_grace_minutes != null) graceMinutes = v2.late_grace_minutes;
  } catch {
    // fall back to default 7
  }

  // Tenant timezone — same default clock-in uses.
  let tenantTz = 'America/New_York';
  try {
    const { data: tenantRow } = await supabaseAdmin
      .from('tenants')
      .select('timezone')
      .eq('id', tenantId)
      .maybeSingle();
    if (tenantRow?.timezone) tenantTz = tenantRow.timezone;
  } catch {
    // fall back to default
  }

  const eff = await resolveEffectiveStart({
    supabaseAdmin,
    tenantId,
    operatorId,
    role,
    localDate,
    isShopHours,
  });

  const late = computeLate({
    clockInIso,
    effectiveStart: { startTime: eff.startTime, source: eff.source },
    graceMinutes,
    tenantTz,
    localDate,
  });

  return {
    is_late: late.isLate,
    late_minutes: late.lateMinutes,
    scheduled_start_time: late.scheduledStartTime,
    late_source: late.lateSource,
  };
}

/** Result of a late-arrival computation. Notification-free / pure. */
export interface LateResult {
  isLate: boolean;
  /** Whole minutes past the resolved start (>= 0; 0 when on-time/early). */
  lateMinutes: number;
  /** The wall-clock scheduled start ('HH:MM'[:SS]) the comparison used, or null. */
  scheduledStartTime: string | null;
  lateSource: StartSource | null;
}

/**
 * Decide whether a clock-in is LATE, computed in the TENANT's timezone.
 *
 * THE RULE (founder-approved): late === the clock-in is STRICTLY MORE THAN the
 * grace window past the resolved scheduled start. Use `>`, never `>=` — a clock-in
 * exactly `grace` minutes late is still ON TIME.
 *
 * This is the single source of truth shared by clock-in AND every admin edit path,
 * so editing a timecard recomputes late identically to the original clock-in (the
 * "I fixed their time but it still says late" bug). It is PURE — it never writes a
 * row or sends a notification; callers persist the returned columns themselves.
 *
 * Timezone correctness: the scheduled start is a bare wall-clock 'HH:MM' for the
 * tenant-local calendar day. A naive `new Date().setHours()` would use the server
 * tz (UTC on Vercel) and mis-flag on-time operators by the whole offset (~4-5h for
 * America/New_York). We resolve the expected-arrival INSTANT via the same
 * Intl.DateTimeFormat round-trip clock-in uses.
 */
export function computeLate(params: {
  /** The (possibly corrected) clock-in instant as an ISO string. */
  clockInIso: string;
  /** Resolved effective start: { startTime, source } from resolveEffectiveStart. */
  effectiveStart: { startTime: string | null; source: StartSource | null };
  /** Late grace window in minutes (default 7 when unset). */
  graceMinutes: number;
  /** IANA tz of the tenant (e.g. 'America/New_York'). */
  tenantTz: string;
  /** Tenant-local calendar date 'YYYY-MM-DD' the timecard belongs to. */
  localDate: string;
}): LateResult {
  const { clockInIso, effectiveStart, graceMinutes, tenantTz, localDate } = params;
  const expectedTimeStr = effectiveStart.startTime;

  // No baseline → fail-open: never flag late.
  if (!expectedTimeStr) {
    return { isLate: false, lateMinutes: 0, scheduledStartTime: null, lateSource: null };
  }

  const clockInMs = Date.parse(clockInIso);
  if (Number.isNaN(clockInMs)) {
    return { isLate: false, lateMinutes: 0, scheduledStartTime: expectedTimeStr, lateSource: effectiveStart.source };
  }

  const [hours, minutes] = expectedTimeStr.split(':').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  // Treat HH:MM on localDate as UTC, then ask what that instant looks like in the
  // tenant tz; the delta back-corrects to the true tenant-local instant.
  const wallUtcMs = Date.parse(`${localDate}T${pad(hours)}:${pad(minutes)}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tenantTz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(wallUtcMs));
  const tp: Record<string, string> = {};
  for (const p of parts) { if (p.type !== 'literal') tp[p.type] = p.value; }
  const seenAsTzMs = Date.UTC(+tp.year, +tp.month - 1, +tp.day, +tp.hour, +tp.minute, +tp.second);
  const expectedMs = wallUtcMs - (seenAsTzMs - wallUtcMs);

  const minutesPast = Math.floor((clockInMs - expectedMs) / 60000);
  // STRICTLY more than grace → late. (e.g. grace 7: 7 min = on-time, 8 min = late.)
  const isLate = minutesPast > graceMinutes;

  return {
    isLate,
    lateMinutes: isLate ? minutesPast : 0,
    scheduledStartTime: expectedTimeStr,
    lateSource: effectiveStart.source,
  };
}
