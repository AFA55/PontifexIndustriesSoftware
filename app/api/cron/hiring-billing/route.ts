export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/hiring-billing
 *
 * Daily hiring-billing sweep (vercel.json: 0 12 * * * — 12:00 UTC = morning US).
 * Implements two of the three billing triggers from HIRELINE_MODULE_PLAN §5.1
 * (the third — all jobs paused — fires inline from the jobs PATCH route):
 *
 *   - On the 1ST OF THE MONTH (evaluated in each tenant's timezone,
 *     tenants.timezone, fallback 'America/New_York' — same convention as
 *     clock-in-reminders): charge EVERY tenant with a balance, regardless of
 *     threshold.
 *   - On every other day: charge only tenants whose balance_owed has reached
 *     their threshold (this cron IS the threshold-collector — spend accrual
 *     doesn't charge inline).
 *
 * All money movement goes through settleHiringBalance() (lib/hiring/settle.ts)
 * — the guardian-hardened CAS/idempotency path shared with the manual charge
 * route. Declines are recorded + admins bell-notified inside the helper; no
 * retry here (the next daily run retries naturally).
 *
 * Sequential per-tenant processing (small N) with per-tenant try/catch so one
 * failure never halts the sweep. Response summarizes
 * { charged, pending, declined, skipped, errors } for get_logs visibility.
 *
 * Authorization: Bearer ${CRON_SECRET}  (fail-closed if env var unset)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isStripeConfigured } from '@/lib/hiring/billing';
import { settleHiringBalance } from '@/lib/hiring/settle';
import { todayInTz } from '@/lib/reminder-timing';

export async function GET(request: NextRequest) {
  // Auth — fail closed
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    // Nothing can be charged — report cleanly instead of erroring per tenant.
    return NextResponse.json({
      success: true,
      data: { charged: 0, pending: 0, declined: 0, skipped: 0, errors: 0, note: 'Stripe not configured' },
    });
  }

  const summary = { charged: 0, pending: 0, declined: 0, skipped: 0, errors: 0 };
  const details: Array<{ tenantId: string; outcome: string; amount?: number; note?: string }> = [];

  try {
    // Candidates: owe money AND have a card on file. (settleHiringBalance
    // re-reads + CAS-claims, so this read is only a filter, not the source
    // of truth — a stale balance here can't double-charge.)
    const { data: rows, error } = await supabaseAdmin
      .from('hiring_billing')
      .select('tenant_id, balance_owed, threshold')
      .gt('balance_owed', 0)
      .not('stripe_customer_id', 'is', null)
      .not('default_payment_method', 'is', null);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const billingRows = (rows ?? []) as Array<{
      tenant_id: string;
      balance_owed: number;
      threshold: number;
    }>;

    if (billingRows.length === 0) {
      return NextResponse.json({ success: true, data: { ...summary, details } });
    }

    // Tenant timezones for the "1st of the month" check.
    const tenantIds = billingRows.map((r) => r.tenant_id);
    const { data: tenants } = await supabaseAdmin
      .from('tenants')
      .select('id, timezone')
      .in('id', tenantIds);
    const tzByTenant = new Map<string, string>(
      ((tenants ?? []) as Array<{ id: string; timezone: string | null }>).map((t) => [
        t.id,
        t.timezone || 'America/New_York',
      ])
    );

    for (const row of billingRows) {
      try {
        const tz = tzByTenant.get(row.tenant_id) || 'America/New_York';
        const isFirstOfMonth = todayInTz(tz).endsWith('-01'); // YYYY-MM-DD

        // Non-1st days: this run only collects balances at/over threshold.
        // (The settle helper ignores the threshold for 'monthly_cron' — the
        // day-based gate lives HERE so the 1st sweeps everything.)
        if (!isFirstOfMonth && Number(row.balance_owed) < Number(row.threshold)) {
          summary.skipped++;
          details.push({ tenantId: row.tenant_id, outcome: 'skipped', note: 'below threshold' });
          continue;
        }

        const result = await settleHiringBalance(row.tenant_id, {
          trigger: 'monthly_cron',
          actorId: null,
        });

        switch (result.kind) {
          case 'charged':
            summary.charged++;
            details.push({ tenantId: row.tenant_id, outcome: 'charged', amount: result.amount });
            break;
          case 'pending':
            summary.pending++;
            details.push({ tenantId: row.tenant_id, outcome: 'pending', amount: result.amount });
            break;
          case 'declined':
            summary.declined++;
            details.push({ tenantId: row.tenant_id, outcome: 'declined', note: result.error });
            break;
          case 'skipped':
          case 'conflict':
            // conflict = another charge in flight — that charge owns the money path.
            summary.skipped++;
            details.push({ tenantId: row.tenant_id, outcome: result.kind, note: result.error });
            break;
          case 'error':
            summary.errors++;
            details.push({ tenantId: row.tenant_id, outcome: 'error', note: result.error });
            console.error(`[hiring-billing] tenant ${row.tenant_id}:`, result.error);
            break;
        }
      } catch (err) {
        summary.errors++;
        const note = err instanceof Error ? err.message : String(err);
        details.push({ tenantId: row.tenant_id, outcome: 'error', note });
        console.error(`[hiring-billing] tenant ${row.tenant_id} threw:`, err);
      }
    }

    return NextResponse.json({ success: true, data: { ...summary, details } });
  } catch (error) {
    console.error('[hiring-billing] error:', error);
    return NextResponse.json(
      { success: false, data: summary, error: String(error) },
      { status: 500 }
    );
  }
}
