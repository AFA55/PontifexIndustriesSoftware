export const dynamic = 'force-dynamic';

/**
 * POST /api/hiring/billing/charge — charge the tenant's saved card for
 * balance_owed. Allowed when balance_owed ≥ threshold, or with force=true
 * (super_admin only — used for the 1st-of-month and all-jobs-paused triggers
 * until the crons land).
 *
 * Concurrency model (guardian B1/B2):
 *  1. Snapshot the uninvoiced ledger row ids + the amount to charge.
 *  2. CLAIM the balance first via compare-and-set (balance_owed -> 0 only if
 *     it still equals the value we read) — a second concurrent charge gets 409.
 *  3. Record the claim ('billing_charge_claimed', AWAITED) before any money
 *     moves — a claimed balance must never exist without an audit record.
 *     If that insert fails, the claim is rolled back and the request 500s.
 *  4. Create the PaymentIntent with a PER-ATTEMPT idempotencyKey
 *     (tenantId + snapshot hash + fresh UUID). The CAS claim is the real
 *     double-charge guard; the key only covers network retries WITHIN one
 *     attempt. A stable key would make Stripe replay a cached decline for
 *     ~24h, which would break the "update the card and try again" remediation.
 *  5. Settle ONLY the snapshotted ledger rows; never re-zero balance_owed at
 *     settle time (spend recorded mid-charge stays owed for the next cycle).
 *  6. Failure handling by certainty:
 *     - DEFINITIVE failure (card declined, invalid request): restore the
 *       claimed amount via increment_hiring_balance and return an actionable
 *       error.
 *     - UNKNOWN outcome (StripeConnectionError / StripeAPIError, or status
 *       'processing'): KEEP the claim, persist 'billing_charge_pending' for
 *       manual reconciliation, and return pending:true — never invite a retry
 *       that could double-charge.
 */

import { createHash, randomUUID } from 'crypto';
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
    const readBalance = Number(billing.balance_owed); // exact value for the compare-and-set
    const amount = roundMoney(readBalance); // what we actually charge
    const threshold = Number(billing.threshold);

    if (amount <= 0) {
      return NextResponse.json({ error: 'No balance owed.' }, { status: 400 });
    }
    if (amount < threshold && !force) {
      return NextResponse.json(
        {
          error: `Balance ($${amount.toFixed(2)}) is below the $${threshold.toFixed(0)} billing threshold. It will be charged on the 1st of the month, when it reaches the threshold, or when all jobs are paused.`,
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

    // ── 1. snapshot the uninvoiced ledger rows we are settling ───────────
    const { data: uninvoiced, error: snapshotError } = await supabaseAdmin
      .from('hiring_spend_ledger')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('invoiced', false);
    if (snapshotError) {
      return NextResponse.json({ error: snapshotError.message }, { status: 500 });
    }
    const ledgerIds = (uninvoiced ?? []).map((r) => r.id as string).sort();

    // Per-attempt idempotency key (minted BEFORE the claim so the audit
    // record can carry it): snapshot hash ties it to this ledger set, the
    // UUID makes every attempt fresh — a prior decline is never replayed
    // from Stripe's idempotency cache.
    const snapshotHash = createHash('sha256')
      .update(ledgerIds.join(','))
      .digest('hex')
      .slice(0, 40);
    const idempotencyKey = `hiring-charge-${tenantId}-${snapshotHash}-${randomUUID()}`;

    // ── 2. claim the balance BEFORE charging (compare-and-set) ───────────
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('hiring_billing')
      .update({ balance_owed: 0 })
      .eq('tenant_id', tenantId)
      .eq('balance_owed', readBalance)
      .select('tenant_id');
    if (claimError) {
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }
    if (!claimed || claimed.length === 0) {
      // Balance changed since we read it — another charge (or new spend) is in flight.
      return NextResponse.json(
        { error: 'Another charge is already in progress for this account. Refresh in a moment.' },
        { status: 409 }
      );
    }

    // Restores the claimed amount if the charge doesn't go through.
    const restoreBalance = async (): Promise<string | null> => {
      const { error: restoreError } = await supabaseAdmin.rpc('increment_hiring_balance', {
        p_tenant_id: tenantId,
        p_amount: readBalance,
      });
      return restoreError ? restoreError.message : null;
    };

    // ── 3. record the claim BEFORE any money moves (AWAITED — this is the
    // crash-window audit trail; a claimed balance with no record is never
    // acceptable). If it fails, roll the claim back and bail. ──────────────
    const { error: claimEventError } = await supabaseAdmin.from('hiring_events').insert({
      tenant_id: tenantId,
      event_type: 'billing_charge_claimed',
      meta: { amount, ledger_ids: ledgerIds, idempotency_key: idempotencyKey },
      actor_id: auth.userId,
    });
    if (claimEventError) {
      const restoreFailure = await restoreBalance();
      const restoreNote = restoreFailure
        ? ` (Additionally, restoring the balance failed: ${restoreFailure} — contact support.)`
        : '';
      return NextResponse.json(
        { error: `Could not record the charge attempt: ${claimEventError.message}. No charge was made.${restoreNote}` },
        { status: 500 }
      );
    }

    // ── 4. charge with the per-attempt idempotency key ───────────────────
    const stripe = getStripe();
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: Math.round(amount * 100),
          currency: 'usd',
          customer: billing.stripe_customer_id,
          payment_method: billing.default_payment_method,
          off_session: true,
          confirm: true,
          description: 'Pontifex Industries Job Board — ad spend',
          metadata: { tenant_id: tenantId, module: 'hiring' },
        },
        { idempotencyKey }
      );
    } catch (err) {
      const stripeErr = err as { type?: string; name?: string; code?: string; message?: string };

      // UNKNOWN outcome (network dropped mid-request / Stripe 5xx): the charge
      // may or may not have gone through. KEEP the claim and record it for
      // manual reconciliation — a retry here is what double-charges people.
      const errType = stripeErr?.type || stripeErr?.name || '';
      if (errType === 'StripeConnectionError' || errType === 'StripeAPIError') {
        const { error: pendingError } = await supabaseAdmin.from('hiring_events').insert({
          tenant_id: tenantId,
          event_type: 'billing_charge_pending',
          meta: {
            amount,
            ledger_ids: ledgerIds,
            idempotency_key: idempotencyKey,
            error_type: errType,
            error_message: stripeErr?.message ?? null,
          },
          actor_id: auth.userId,
        });
        if (pendingError) {
          console.error('hiring billing: failed to record billing_charge_pending', pendingError);
        }
        return NextResponse.json({
          success: true,
          data: {
            pending: true,
            amount,
            message:
              'We could not confirm whether your payment completed. Do not retry — our team will verify the payment and your balance will update automatically. Contact support if it has not updated within one business day.',
          },
        });
      }

      // DEFINITIVE failure (card declined, invalid request, ...): give the
      // claimed balance back and tell the customer exactly what to do next.
      const restoreFailure = await restoreBalance();
      const restoreNote = restoreFailure
        ? ` (Additionally, restoring your balance failed: ${restoreFailure} — contact support.)`
        : '';
      if (
        stripeErr?.type === 'StripeCardError' ||
        stripeErr?.code === 'card_declined' ||
        stripeErr?.code === 'authentication_required' ||
        stripeErr?.code === 'expired_card'
      ) {
        return NextResponse.json(
          {
            error: `Your card was declined${stripeErr.message ? ` (${stripeErr.message})` : ''}. Your balance is still due — update the card on file and try again.${restoreNote}`,
          },
          { status: 402 }
        );
      }
      return NextResponse.json(
        { error: `${stripeErr?.message || 'Payment failed.'}${restoreNote}` },
        { status: 500 }
      );
    }

    // ── S2: 'processing' — money may still land; keep the claim, record the
    // PI for reconciliation, and do NOT invite a retry. ────────────────────
    if (paymentIntent.status === 'processing') {
      const { error: pendingError } = await supabaseAdmin.from('hiring_events').insert({
        tenant_id: tenantId,
        event_type: 'billing_charge_pending',
        meta: {
          payment_intent: paymentIntent.id,
          amount,
          ledger_ids: ledgerIds,
          idempotency_key: idempotencyKey,
        },
        actor_id: auth.userId,
      });
      if (pendingError) {
        // The pending record is our reconciliation trail — surface loudly.
        console.error('hiring billing: failed to record billing_charge_pending', pendingError);
      }
      return NextResponse.json({
        success: true,
        data: {
          pending: true,
          paymentIntentId: paymentIntent.id,
          amount,
          message:
            'Your payment is processing. No action needed — this page will show it as paid once it completes. Do not retry the charge.',
        },
      });
    }

    if (paymentIntent.status !== 'succeeded') {
      // Definitive non-success (requires_payment_method, canceled, ...) —
      // release the claim so the balance is owed again.
      const restoreFailure = await restoreBalance();
      const restoreNote = restoreFailure
        ? ` (Additionally, restoring your balance failed: ${restoreFailure} — contact support.)`
        : '';
      return NextResponse.json(
        {
          error: `Payment did not complete (status: ${paymentIntent.status}). Your balance is still due — update the card on file and try again.${restoreNote}`,
        },
        { status: 402 }
      );
    }

    // ── 5. success: settle EXACTLY the snapshotted ledger rows. The balance
    // was already claimed to 0; spend recorded mid-charge remains owed. ────
    if (ledgerIds.length > 0) {
      const { error: ledgerSettleError } = await supabaseAdmin
        .from('hiring_spend_ledger')
        .update({ invoiced: true })
        .eq('tenant_id', tenantId)
        .in('id', ledgerIds);
      if (ledgerSettleError) {
        // The charge went through — surface the bookkeeping failure loudly.
        return NextResponse.json(
          {
            error: `Charge succeeded (${paymentIntent.id}) but marking ledger entries as paid failed: ${ledgerSettleError.message}`,
          },
          { status: 500 }
        );
      }
    }

    const newLifetime = roundMoney(Number(billing.lifetime_billed) + amount);
    const newThreshold = computeThreshold(newLifetime);

    const { error: settleError } = await supabaseAdmin
      .from('hiring_billing')
      .update({
        // deliberately NOT touching balance_owed here (claimed pre-charge)
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
        meta: { amount, payment_intent: paymentIntent.id, ledger_ids: ledgerIds },
        actor_id: auth.userId,
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        charged: amount,
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
