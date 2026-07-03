export const dynamic = 'force-dynamic';

/**
 * GET /api/hiring/billing — the tenant's billing snapshot for the job-board module.
 *
 * Returns { billing, unbilledSpend, recentLedger, hasPaymentMethod }.
 * IMPORTANT: the response NEVER includes raw_cost, ad_spend_markup, or Stripe
 * ids — the customer must never see our cost basis (plan §5.2), and Stripe ids
 * are server-side plumbing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, resolveBillingTenant } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureBillingRow, roundMoney } from '@/lib/hiring/billing';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const scope = await resolveBillingTenant(request, auth);
  if ('response' in scope) return scope.response;
  const tenantId = scope.tenantId;

  try {
    const billing = await ensureBillingRow(tenantId);

    // Sum of not-yet-invoiced billed amounts (should track balance_owed; the
    // ledger sum is the source of truth shown alongside it).
    const { data: unbilledRows, error: unbilledError } = await supabaseAdmin
      .from('hiring_spend_ledger')
      .select('billed_amount')
      .eq('tenant_id', tenantId)
      .eq('invoiced', false);
    if (unbilledError) {
      return NextResponse.json({ error: unbilledError.message }, { status: 500 });
    }
    const unbilledSpend = roundMoney(
      (unbilledRows ?? []).reduce((sum, r) => sum + Number(r.billed_amount || 0), 0)
    );

    // Last 20 ledger entries — billed_amount only, raw_cost is stripped.
    const { data: ledger, error: ledgerError } = await supabaseAdmin
      .from('hiring_spend_ledger')
      .select('id, job_id, spend_date, channel, billed_amount, invoiced, note, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (ledgerError) {
      return NextResponse.json({ error: ledgerError.message }, { status: 500 });
    }

    // Attach job titles for display.
    const jobIds = Array.from(
      new Set((ledger ?? []).map((r) => r.job_id).filter((id): id is string => !!id))
    );
    const jobTitles: Record<string, string> = {};
    if (jobIds.length > 0) {
      const { data: jobs } = await supabaseAdmin
        .from('hiring_jobs')
        .select('id, title')
        .in('id', jobIds);
      for (const j of jobs ?? []) jobTitles[j.id as string] = j.title as string;
    }

    const recentLedger = (ledger ?? []).map((r) => ({
      id: r.id,
      job_id: r.job_id,
      job_title: r.job_id ? (jobTitles[r.job_id] ?? null) : null,
      spend_date: r.spend_date,
      channel: r.channel,
      billed_amount: Number(r.billed_amount),
      invoiced: r.invoiced,
      note: r.note,
      created_at: r.created_at,
    }));

    return NextResponse.json({
      success: true,
      data: {
        // sans Stripe ids and sans ad_spend_markup (cost basis stays private)
        billing: {
          threshold: Number(billing.threshold),
          lifetime_billed: Number(billing.lifetime_billed),
          balance_owed: Number(billing.balance_owed),
        },
        unbilledSpend,
        recentLedger,
        hasPaymentMethod: !!billing.default_payment_method,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
