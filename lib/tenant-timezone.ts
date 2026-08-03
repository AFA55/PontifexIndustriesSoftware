/**
 * The tenant's wall-clock date, for server code.
 *
 * WHY THIS EXISTS: Vercel runs the API in UTC, so `new Date().toISOString()`
 * (and even `toLocalYMD()` on the server) rolls over to TOMORROW at 8pm ET.
 * Anything that stamps a CALENDAR date an operator will recognise — a helper's
 * log_date, a daily log, a reminder key — has to use the tenant's timezone or
 * an evening submission lands on the wrong day and the office sees work filed
 * for a day nobody worked.
 *
 * Falls back to America/New_York (Patriot) when the tenant has no timezone set,
 * matching the cron jobs (app/api/cron/*).
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { todayInTz } from '@/lib/reminder-timing';

export const DEFAULT_TENANT_TZ = 'America/New_York';

export async function getTenantTimezone(tenantId: string | null | undefined): Promise<string> {
  if (!tenantId) return DEFAULT_TENANT_TZ;
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('timezone')
    .eq('id', tenantId)
    .maybeSingle();
  return data?.timezone || DEFAULT_TENANT_TZ;
}

/** Today's YYYY-MM-DD in the tenant's timezone. */
export async function tenantToday(tenantId: string | null | undefined): Promise<string> {
  return todayInTz(await getTenantTimezone(tenantId));
}
