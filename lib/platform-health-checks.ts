/**
 * Platform health-check routines — read-only analysis over tenant data that
 * surfaces findings as rows in `platform_health_alerts`. Each check function
 * ONLY ever reads from tenant tables (job_orders, invoices, timecards, tenants)
 * and writes exclusively to `platform_health_alerts` via supabaseAdmin. No
 * check may mutate job_orders/invoices/timecards/profiles/etc — see
 * `runHealthChecks` in the cron route for the only write path.
 *
 * Stale-alert resolution: each check computes a fresh candidate set, then
 * closes any existing open alert of its own check_type that isn't in that set
 * (job completed, invoice paid, tenant became active again) and inserts only
 * alerts that don't already have a matching open row — so re-running the cron
 * never duplicates or accumulates stale rows.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import { toLocalYMD } from '@/lib/dates';

export type Severity = 'info' | 'warning' | 'critical';

export interface AlertCandidate {
  tenantId: string | null;
  checkType: string;
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
  /** Stable identifier (e.g. job id, invoice id) used to key open/stale resolution. */
  key: string;
}

export interface CheckResult {
  checkType: string;
  ran: boolean;
  candidates: AlertCandidate[];
  skippedReason?: string;
}

const STUCK_JOB_DAYS = 7;
const OVERDUE_INVOICE_CRITICAL_DAYS = 30;
const INACTIVE_TENANT_DAYS = 14;
const NON_TERMINAL_JOB_STATUSES = ['scheduled', 'assigned'];
const TERMINAL_INVOICE_STATUSES = ['paid', 'cancelled'];

function daysAgoYMD(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toLocalYMD(d);
}

function daysBetweenYMD(pastYMD: string, todayYMD: string): number {
  const past = new Date(pastYMD + 'T00:00:00').getTime();
  const today = new Date(todayYMD + 'T00:00:00').getTime();
  return Math.floor((today - past) / (24 * 60 * 60 * 1000));
}

/**
 * Stuck jobs: job_orders still scheduled/assigned more than STUCK_JOB_DAYS
 * past their scheduled_date. One alert per job, but the message surfaces the
 * tenant-wide stuck count so a 50-stuck-job tenant reads as one glance, not
 * 50 opaque rows.
 */
export async function checkStuckJobs(): Promise<CheckResult> {
  const checkType = 'stuck_job';
  const cutoff = daysAgoYMD(STUCK_JOB_DAYS);
  const today = toLocalYMD();

  const { data, error } = await supabaseAdmin
    .from('job_orders')
    .select('id, title, tenant_id, status, scheduled_date')
    .in('status', NON_TERMINAL_JOB_STATUSES)
    .lt('scheduled_date', cutoff)
    .not('scheduled_date', 'is', null)
    .not('tenant_id', 'is', null);

  if (error) {
    return { checkType, ran: false, candidates: [], skippedReason: error.message };
  }

  const rows = data ?? [];
  const countByTenant = new Map<string, number>();
  for (const row of rows) {
    countByTenant.set(row.tenant_id, (countByTenant.get(row.tenant_id) ?? 0) + 1);
  }

  const candidates: AlertCandidate[] = rows.map((row) => {
    const daysStuck = daysBetweenYMD(row.scheduled_date as string, today);
    const tenantStuckCount = countByTenant.get(row.tenant_id) ?? 1;
    return {
      tenantId: row.tenant_id,
      checkType,
      severity: 'warning',
      message: `Job "${row.title || row.id}" has been ${row.status} for ${daysStuck} days past its scheduled date${tenantStuckCount > 1 ? ` (${tenantStuckCount} stuck jobs on this tenant)` : ''}`,
      details: { jobOrderId: row.id, status: row.status, scheduledDate: row.scheduled_date, daysStuck, tenantStuckCount },
      key: row.id,
    };
  });

  return { checkType, ran: true, candidates };
}

/**
 * Overdue invoices: any invoice not paid/cancelled with a due_date in the
 * past. Warning under OVERDUE_INVOICE_CRITICAL_DAYS, critical beyond it.
 */
export async function checkOverdueInvoices(): Promise<CheckResult> {
  const checkType = 'overdue_invoice';
  const today = toLocalYMD();

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, tenant_id, status, due_date')
    .not('status', 'in', `(${TERMINAL_INVOICE_STATUSES.join(',')})`)
    .lt('due_date', today)
    .not('due_date', 'is', null)
    .not('tenant_id', 'is', null);

  if (error) {
    return { checkType, ran: false, candidates: [], skippedReason: error.message };
  }

  const rows = data ?? [];
  const candidates: AlertCandidate[] = rows.map((row) => {
    const daysOverdue = daysBetweenYMD(row.due_date as string, today);
    const severity: Severity = daysOverdue > OVERDUE_INVOICE_CRITICAL_DAYS ? 'critical' : 'warning';
    return {
      tenantId: row.tenant_id,
      checkType,
      severity,
      message: `Invoice ${row.invoice_number || row.id} is ${daysOverdue} days overdue (status: ${row.status})`,
      details: { invoiceId: row.id, status: row.status, dueDate: row.due_date, daysOverdue },
      key: row.id,
    };
  });

  return { checkType, ran: true, candidates };
}

/**
 * Inactive tenant: no timecards in the last INACTIVE_TENANT_DAYS, excluding
 * tenants created within that same window (a new tenant naturally has none
 * yet — that's not unhealthy). One alert per tenant.
 */
export async function checkInactiveTenants(): Promise<CheckResult> {
  const checkType = 'inactive_tenant';
  const cutoffYMD = daysAgoYMD(INACTIVE_TENANT_DAYS);
  const cutoffTimestamp = new Date(cutoffYMD + 'T00:00:00').toISOString();

  const { data: tenants, error: tenantsError } = await supabaseAdmin
    .from('tenants')
    .select('id, name, created_at')
    .lt('created_at', cutoffTimestamp);

  if (tenantsError) {
    return { checkType, ran: false, candidates: [], skippedReason: tenantsError.message };
  }

  const eligibleTenants = tenants ?? [];
  if (eligibleTenants.length === 0) {
    return { checkType, ran: true, candidates: [] };
  }

  const { data: recentTimecards, error: timecardsError } = await supabaseAdmin
    .from('timecards')
    .select('tenant_id')
    .gte('date', cutoffYMD)
    .not('tenant_id', 'is', null);

  if (timecardsError) {
    return { checkType, ran: false, candidates: [], skippedReason: timecardsError.message };
  }

  const activeTenantIds = new Set((recentTimecards ?? []).map((t) => t.tenant_id));

  const candidates: AlertCandidate[] = eligibleTenants
    .filter((t) => !activeTenantIds.has(t.id))
    .map((t) => ({
      tenantId: t.id,
      checkType,
      severity: 'info' as Severity,
      message: `${t.name} has had no clocked time in the last ${INACTIVE_TENANT_DAYS} days`,
      details: { tenantId: t.id, tenantName: t.name, windowDays: INACTIVE_TENANT_DAYS },
      key: t.id,
    }));

  return { checkType, ran: true, candidates };
}

export const HEALTH_CHECKS: Array<() => Promise<CheckResult>> = [
  checkStuckJobs,
  checkOverdueInvoices,
  checkInactiveTenants,
];

/**
 * Reconciles one check's fresh candidates against existing open alerts of the
 * same check_type: inserts genuinely new ones (keyed on a stable detail id so
 * re-runs don't duplicate), resolves rows whose key no longer appears in the
 * fresh set. Returns counts for the cron response.
 */
export async function reconcileAlerts(result: CheckResult): Promise<{ inserted: number; resolved: number }> {
  if (!result.ran) return { inserted: 0, resolved: 0 };

  const { data: openAlerts, error } = await supabaseAdmin
    .from('platform_health_alerts')
    .select('id, tenant_id, details')
    .eq('check_type', result.checkType)
    .eq('resolved', false);

  if (error) {
    return { inserted: 0, resolved: 0 };
  }

  const existing = openAlerts ?? [];
  const freshKeys = new Set(result.candidates.map((c) => c.key));

  const keyOfExisting = (row: { details: unknown }): string | null => {
    const d = row.details as Record<string, unknown> | null;
    if (!d) return null;
    const v = d.jobOrderId ?? d.invoiceId ?? d.tenantId;
    return typeof v === 'string' ? v : null;
  };

  const staleIds = existing
    .filter((row) => {
      const key = keyOfExisting(row);
      return key === null || !freshKeys.has(key);
    })
    .map((row) => row.id);

  let resolved = 0;
  if (staleIds.length > 0) {
    const { error: resolveError } = await supabaseAdmin
      .from('platform_health_alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .in('id', staleIds);
    if (!resolveError) resolved = staleIds.length;
  }

  const existingKeys = new Set(
    existing.map((row) => keyOfExisting(row)).filter((k): k is string => k !== null)
  );
  const toInsert = result.candidates.filter((c) => !existingKeys.has(c.key));

  let inserted = 0;
  if (toInsert.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from('platform_health_alerts')
      .insert(
        toInsert.map((c) => ({
          tenant_id: c.tenantId,
          check_type: c.checkType,
          severity: c.severity,
          message: c.message,
          details: c.details ?? {},
        }))
      );
    if (!insertError) inserted = toInsert.length;
  }

  return { inserted, resolved };
}
