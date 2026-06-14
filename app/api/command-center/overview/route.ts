export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/command-center/overview
 *
 * Phase 1 of the Jarvis Command Center (docs/plans/JARVIS_COMMAND_CENTER_PLAN.md).
 * Powers the live right-rail HUD: a small set of tenant-scoped, read-only counts.
 * NO AI / NO voice — just live numbers, refreshed by the client on an interval.
 *
 * Auth:   requireAuth + role ∈ COMMAND_CENTER_ROLES (all office/management roles;
 *         worker tier excluded). The HUD returns only low-sensitivity tenant-scoped
 *         counts, so management-wide read is acceptable.
 *         Tenant resolved via resolveTenantScope — super_admin may pass
 *         ?tenantId=<uuid> (mirrors the invite route); everyone else is pinned
 *         to their own tenant.
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       clockedIn:        number,  // open timecards today (no clock-out)
 *       rosterCount:      number,  // active field crew (the "/N" denominator)
 *       todaysJobs:       number,  // job_orders scheduled for today
 *       pendingApprovals: number,  // pending time-off + pending completion requests
 *       unreadAlerts:     number,  // unread notifications for this tenant
 *       asOf:             string,  // ISO timestamp the snapshot was taken
 *     }
 *   }
 *
 * Fail-soft contract: EVERY sub-count is wrapped independently. A single failing
 * query yields 0 for that one metric and NEVER 500s the whole endpoint — the HUD
 * must always render. Only an auth/tenant-resolution failure short-circuits.
 *
 * Tenant isolation: every sub-query carries .eq('tenant_id', tenantId). Treat this
 * as a platform-write invariant — do not relax it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, resolveTenantScope } from '@/lib/api-auth';
import { COMMAND_CENTER_ROLES } from '@/lib/rbac';
import { toLocalYMD } from '@/lib/dates';

/** Run a count query, returning 0 on ANY error so one metric can't sink the HUD. */
async function safeCount(
  label: string,
  fn: () => PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  try {
    const { count, error } = await fn();
    if (error) {
      console.error(`[command-center/overview] ${label} query error:`, error);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error(`[command-center/overview] ${label} unexpected error:`, err);
    return 0;
  }
}

export async function GET(request: NextRequest) {
  // Auth + role + tenant scope are the only hard gates. Everything past here is fail-soft.
  // Broadened from requireAdmin to all office/management roles (COMMAND_CENTER_ROLES):
  // the HUD only returns low-sensitivity tenant-scoped COUNTS, so management-wide read
  // is fine. Worker tier (operator / apprentice) stays out.
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  if (!COMMAND_CENTER_ROLES.includes(auth.role)) {
    return NextResponse.json(
      { error: 'Forbidden. Command Center access required.' },
      { status: 403 }
    );
  }

  const scope = await resolveTenantScope(request, auth);
  if ('response' in scope) return scope.response;
  const tenantId = scope.tenantId; // guaranteed non-null

  // Local calendar date (NEVER toISOString — that's UTC and shifts a day in US zones).
  const today = toLocalYMD();

  // clockedIn — team members with an open timecard for today (no clock-out).
  // Mirrors getCrewUtilization in app/api/admin/dashboard-summary/route.ts.
  const clockedInP = safeCount('clockedIn', () =>
    supabaseAdmin
      .from('timecards')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('date', today)
      .is('clock_out_time', null)
  );

  // rosterCount — active field crew (operator + apprentice). This is the "/N"
  // denominator the HUD shows next to clockedIn, so it matches the same crew
  // population that dashboard-summary's crew_utilization counts.
  const rosterCountP = safeCount('rosterCount', () =>
    supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('role', ['operator', 'apprentice'])
      .eq('active', true)
      .is('deleted_at', null)
  );

  // todaysJobs — job_orders scheduled for today, excluding soft-deleted.
  // Mirrors the scheduled_date filter used across app/api/admin/active-jobs &
  // dashboard-summary; counted off the base table for a clean head count.
  const todaysJobsP = safeCount('todaysJobs', () =>
    supabaseAdmin
      .from('job_orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('scheduled_date', today)
      .is('deleted_at', null)
  );

  // pendingApprovals — sum of two independent pending queues, each fail-soft on
  // its own (one missing table can't zero the other):
  //   1. operator_time_off status='pending'   (time-off rebuild + dashboard-summary)
  //   2. job_completion_requests status='pending' (completion-request route)
  const pendingTimeOffP = safeCount('pendingTimeOff', () =>
    supabaseAdmin
      .from('operator_time_off')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
  );
  const pendingCompletionsP = safeCount('pendingCompletions', () =>
    supabaseAdmin
      .from('job_completion_requests')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
  );

  // unreadAlerts — unread notifications for this tenant. The notifications table
  // carries both tenant_id and is_read, so a clean tenant-wide unread count is
  // supported directly (no approximation). Note: notifications are per-user rows,
  // so this is the tenant's total unread volume across all recipients — the HUD's
  // "alerts in flight" number, NOT a single viewer's inbox count.
  const unreadAlertsP = safeCount('unreadAlerts', () =>
    supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_read', false)
  );

  const [clockedIn, rosterCount, todaysJobs, pendingTimeOff, pendingCompletions, unreadAlerts] =
    await Promise.all([
      clockedInP,
      rosterCountP,
      todaysJobsP,
      pendingTimeOffP,
      pendingCompletionsP,
      unreadAlertsP,
    ]);

  return NextResponse.json({
    success: true,
    data: {
      clockedIn,
      rosterCount,
      todaysJobs,
      pendingApprovals: pendingTimeOff + pendingCompletions,
      unreadAlerts,
      asOf: new Date().toISOString(),
    },
  });
}
