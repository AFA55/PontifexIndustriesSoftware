export const dynamic = 'force-dynamic';

/**
 * POST /api/hiring/billing/charge — charge the tenant's saved card for
 * balance_owed. Allowed when balance_owed ≥ threshold, or with force=true
 * (super_admin only — used for the 1st-of-month and all-jobs-paused triggers
 * until the crons land).
 *
 * On success: uninvoiced ledger rows → invoiced, balance_owed → 0,
 * lifetime_billed += amount, threshold recomputed (25 → 50 → 250 escalation),
 * hiring_events row 'billing_charged' logged.
 * On decline: balance stays as-is and the caller gets an actionable error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, resolveBillingTenant } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import { computeThreshold, ensureBillingRow, isStripeConfigured, roundMoney } from '@/lib/hiring/billing';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const body = (await request.json().catch(() => ({}))) as { force?: unknown };
  const force = body?.force === true;
  if (force && auth.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'Forbidden. Only a super admin can force a charge below the threshold.' },
      { status: 403 }
    );
  }

  const scope = await resolveBillingTenant(request, auth);
  if ('response' in scope) return scope.response;
  const tenantId = scope.tenantId;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  try {
    const billing = await ensureBillingRow(tenantId);
    const balance = roundMoney(Number(billing.balance_owed));
    const threshold = Number(billing.threshold);

    if (balance <= 0) {
      return NextResponse.json({ error: 'No balance owed.' }, { status: 400 });
    }
    if (balance < threshold && !force) {
      return NextResponse.json(
        {
          error: `Balance ($${balance.toFixed(2)}) is below the $${threshold.toFixed(0)} billing threshold. It will be charged on the 1st of the month, when it reaches the threshold, or when all jobs are paused.`,
        },
        { status: 400 }
      );
    }
    if (!billing.stripe_customer_id || !billing.default_payment_method) {
      return NextResponse.json(
        { error: 'No payment method on file. Add a card before charging.' },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const amountCents = Math.round(balance * 100);

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        customer: billing.stripe_customer_id,
        payment_method: billing.default_payment_method,
        off_session: true,
        confirm: true,
        description: 'Pontifex Industries Job Board — ad spend',
        metadata: { tenant_id: tenantId, module: 'hiring' },
      });
    } catch (err) {
      // Card declined / authentication required: leave the balance untouched
      // and tell the customer exactly what to do next.
      const stripeErr = err as { type?: string; code?: string; message?: string };
      if (
        stripeErr?.type === 'StripeCardError' ||
        stripeErr?.code === 'card_declined' ||
        stripeErr?.code === 'authentication_required' ||
        stripeErr?.code === 'expired_card'
      ) {
        return NextResponse.json(
          {
            error: `Your card was declined${stripeErr.message ? ` (${stripeErr.message})` : ''}. Your balance is still due — update the card on file and try again.`,
          },
          { status: 402 }
        );
      }
      throw err;
    }

    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json(
        {
          error: `Payment did not complete (status: ${paymentIntent.status}). Your balance is still due — update the card on file and try again.`,
        },
        { status: 402 }
      );
    }

    // ── success: settle the ledger + roll the counters ───────────────────
    await supabaseAdmin
      .from('hiring_spend_ledger')
      .update({ invoiced: true })
      .eq('tenant_id', tenantId)
      .eq('invoiced', false);

    const newLifetime = roundMoney(Number(billing.lifetime_billed) + balance);
    const newThreshold = computeThreshold(newLifetime);

    const { error: settleError } = await supabaseAdmin
      .from('hiring_billing')
      .update({
        balance_owed: 0,
        lifetime_billed: newLifetime,
        threshold: newThreshold,
      })
      .eq('tenant_id', tenantId);
    if (settleError) {
      // The charge went through — surface the bookkeeping failure loudly.
      return NextResponse.json(
        { error: `Charge succeeded (${paymentIntent.id}) but updating billing records failed: ${settleError.message}` },
        { status: 500 }
      );
    }

    // Fire-and-forget history event.
    Promise.resolve(
      supabaseAdmin.from('hiring_events').insert({
        tenant_id: tenantId,
        event_type: 'billing_charged',
        meta: { amount: balance, payment_intent: paymentIntent.id },
        actor_id: auth.userId,
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        charged: balance,
        paymentIntentId: paymentIntent.id,
        lifetimeBilled: newLifetime,
        newThreshold,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
