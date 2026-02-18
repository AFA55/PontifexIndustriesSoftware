/**
 * API Route: GET /api/admin/finance/dashboard
 * Financial dashboard aggregates (admin only)
 *
 * Returns high-level metrics, AR aging buckets, current pay period,
 * recent invoices, and recent payments.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Default AR aging shape when the view is empty or missing
const DEFAULT_AR_AGING = {
  current: 0,
  '1_30_days': 0,
  '31_60_days': 0,
  '61_90_days': 0,
  over_90_days: 0,
  total: 0,
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // ---- 1. Financial dashboard metrics (single aggregate row) ----
    const { data: metricsRows, error: metricsError } = await supabaseAdmin
      .from('financial_dashboard')
      .select('*')
      .limit(1);

    if (metricsError) {
      console.error('Error fetching financial_dashboard:', metricsError);
    }

    const metrics = metricsRows?.[0] ?? {};

    // ---- 2. AR aging buckets ----
    const { data: agingRows, error: agingError } = await supabaseAdmin
      .from('ar_aging')
      .select('*');

    if (agingError) {
      console.error('Error fetching ar_aging:', agingError);
    }

    let arAging = { ...DEFAULT_AR_AGING };

    if (agingRows && agingRows.length > 0) {
      let total = 0;
      for (const row of agingRows) {
        const bucket = (row.bucket ?? row.aging_bucket ?? '').toLowerCase();
        const amount = Number(row.total_amount ?? row.amount ?? 0);

        if (bucket.includes('current') || bucket === '0' || bucket.includes('not due')) {
          arAging.current += amount;
        } else if (bucket.includes('1') && bucket.includes('30')) {
          arAging['1_30_days'] += amount;
        } else if (bucket.includes('31') && bucket.includes('60')) {
          arAging['31_60_days'] += amount;
        } else if (bucket.includes('61') && bucket.includes('90')) {
          arAging['61_90_days'] += amount;
        } else if (bucket.includes('90') || bucket.includes('over')) {
          arAging.over_90_days += amount;
        }

        total += amount;
      }
      arAging.total = total;
    }

    // ---- 3. Current open pay period ----
    const { data: payPeriodRows, error: payPeriodError } = await supabaseAdmin
      .from('pay_periods')
      .select('*')
      .eq('status', 'open')
      .order('period_start', { ascending: false })
      .limit(1);

    if (payPeriodError) {
      console.error('Error fetching open pay period:', payPeriodError);
    }

    const currentPayPeriod = payPeriodRows?.[0] ?? null;

    // ---- 4. Recent invoices ----
    const { data: recentInvoices, error: invoicesError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (invoicesError) {
      console.error('Error fetching recent invoices:', invoicesError);
    }

    // ---- 5. Recent payments (joined with invoice for invoice_number) ----
    const { data: recentPayments, error: paymentsError } = await supabaseAdmin
      .from('payments')
      .select('*, invoice:invoices(invoice_number)')
      .order('created_at', { ascending: false })
      .limit(5);

    if (paymentsError) {
      console.error('Error fetching recent payments:', paymentsError);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          metrics,
          arAging,
          currentPayPeriod,
          recentInvoices: recentInvoices ?? [],
          recentPayments: recentPayments ?? [],
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Unexpected error in finance dashboard route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
