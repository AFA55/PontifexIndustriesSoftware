/**
 * Hiring module — shared balance-settlement engine.
 *
 * settleHiringBalance() is the ONE place that charges a hiring tenant's saved
 * card. It was extracted verbatim from app/api/hiring/billing/charge/route.ts
 * (the guardian-hardened B1/B2 money path) so the manual charge route AND the
 * daily billing cron run the exact same sequence. Do not fork this logic.
 *
 * Concurrency model (guardian B1/B2 — preserved exactly):
 *  1. Snapshot the uninvoiced ledger row ids + the amount to charge.
 *  2. CLAIM the balance first via compare-and-set (balance_owed -> 0 only if
 *     it still equals the value we read) — a concurrent charge gets 'conflict'.
 *  3. Record the claim ('billing_charge_claimed', AWAITED) before any money
 *     moves — a claimed balance must never exist without an audit record.
 *     If that insert fails, the claim is rolled back and we return 'error'.
 *  4. Create the PaymentIntent with a PER-ATTEMPT idempotencyKey
 *     (tenantId + snapshot hash + fresh UUID). The CAS claim is the real
 *     double-charge guard; the key only covers network retries WITHIN one
 *     attempt. A stable key would make Stripe replay a cached decline for
 *     ~24h, which would break the "update the card and try again" remediation.
 *  5. Settle ONLY the snapshotted ledger rows; never re-zero balance_owed at
 *     settle time (spend recorded mid-charge stays owed for the next cycle).
 *  6. Failure handling by certainty:
 *     - DEFINITIVE failure (card declined, invalid request): restore the
 *       claimed amount via increment_hiring_balance and return 'declined' /
 *       'error' with an actionable message.
 *     - UNKNOWN outcome (StripeConnectionError / StripeAPIError, or status
 *       'processing'): KEEP the claim, persist 'billing_charge_pending' for
 *       manual reconciliation, and return 'pending' — never invite a retry
 *       that could double-charge.
 *
 * Trigger semantics (plan §5.1: charge on the 1st / at threshold / when all
 * jobs pause):
 *  - 'manual'       — the charge route. Threshold is ENFORCED unless
 *                     opts.force (route restricts force to super_admin).
 *  - 'monthly_cron' — the daily billing cron. Threshold IGNORED (collect
 *                     whatever is owed; the cron gates non-1st days itself).
 *  - 'jobs_paused'  — last active job paused/closed. Threshold IGNORED.
 *  In non-manual contexts a definitive decline additionally records a
 *  'billing_charge_declined' hiring_events row and bell-notifies the tenant's
 *  admins to update their card (there is no human watching the response).
 *
 * SERVER-ONLY — touches supabaseAdmin and Stripe.
 */

import { createHash, randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import {
  computeThreshold,
  ensureBillingRow,
  isStripeConfigured,
  roundMoney,
} from '@/lib/hiring/billing';

export type SettleTrigger = 'manual' | 'monthly_cron' | 'jobs_paused';

export interface SettleOptions {
  trigger: SettleTrigger;
  /** Bypass the threshold check (manual super_admin only — enforced by the route). */
  force?: boolean;
  /** Who initiated the charge; null for cron/system triggers. */
  actorId?: string | null;
}

/**
 * Discriminated result. `error` strings and `httpStatus` values are composed
 * here so the charge route can return byte-identical responses to the
 * pre-refactor behavior.
 */
export type SettleResult =
  | {
      kind: 'charged';
      amount: number;
      paymentIntentId: string;
      lifetimeBilled: number;
      newThreshold: number;
    }
  | {
      /** Unknown outcome — claim kept, 'billing_charge_pending' recorded. */
      kind: 'pending';
      amount: number;
      paymentIntentId: string | null;
      message: string;
    }
  | {
      kind: 'skipped';
      reason: 'not_configured' | 'no_balance' | 'below_threshold' | 'no_payment_method';
      error: string;
      httpStatus: 503 | 400;
    }
  | {
      /** CAS claim lost — another charge (or new spend) is in flight. */
      kind: 'conflict';
      error: string;
      httpStatus: 409;
    }
  | {
      /** Definitive card failure — balance restored, card must be updated. */
      kind: 'declined';
      error: string;
      httpStatus: 402;
    }
  | {
      kind: 'error';
      error: string;
      httpStatus: 500;
    };

export async function settleHiringBalance(
  tenantId: string,
  opts: SettleOptions
): Promise<SettleResult> {
  const { trigger, force = false } = opts;
  const actorId = opts.actorId ?? null;

  if (!isStripeConfigured()) {
    return {
      kind: 'skipped',
      reason: 'not_configured',
      error: 'Billing not configured',
      httpStatus: 503,
    };
  }

  const billing = await ensureBillingRow(tenantId);
  const readBalance = Number(billing.balance_owed); // exact value for the compare-and-set
  const amount = roundMoney(readBalance); // what we actually charge
  const threshold = Number(billing.threshold);

  if (amount <= 0) {
    return { kind: 'skipped', reason: 'no_balance', error: 'No balance owed.', httpStatus: 400 };
  }
  // Threshold rule: only the manual path enforces it (plan §5.1 — the monthly
  // sweep and the all-jobs-paused settle collect whatever is owed).
  if (trigger === 'manual' && amount < threshold && !force) {
    return {
      kind: 'skipped',
      reason: 'below_threshold',
      error: `Balance ($${amount.toFixed(2)}) is below the $${threshold.toFixed(0)} billing threshold. It will be charged on the 1st of the month, when it reaches the threshold, or when all jobs are paused.`,
      httpStatus: 400,
    };
  }
  if (!billing.stripe_customer_id || !billing.default_payment_method) {
    return {
      kind: 'skipped',
      reason: 'no_payment_method',
      error: 'No payment method on file. Add a card before charging.',
      httpStatus: 400,
    };
  }

  // ── 1. snapshot the uninvoiced ledger rows we are settling ───────────
  const { data: uninvoiced, error: snapshotError } = await supabaseAdmin
    .from('hiring_spend_ledger')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('invoiced', false);
  if (snapshotError) {
    return { kind: 'error', error: snapshotError.message, httpStatus: 500 };
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
    return { kind: 'error', error: claimError.message, httpStatus: 500 };
  }
  if (!claimed || claimed.length === 0) {
    // Balance changed since we read it — another charge (or new spend) is in flight.
    return {
      kind: 'conflict',
      error: 'Another charge is already in progress for this account. Refresh in a moment.',
      httpStatus: 409,
    };
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
    meta: { amount, ledger_ids: ledgerIds, idempotency_key: idempotencyKey, trigger },
    actor_id: actorId,
  });
  if (claimEventError) {
    const restoreFailure = await restoreBalance();
    const restoreNote = restoreFailure
      ? ` (Additionally, restoring the balance failed: ${restoreFailure} — contact support.)`
      : '';
    return {
      kind: 'error',
      error: `Could not record the charge attempt: ${claimEventError.message}. No charge was made.${restoreNote}`,
      httpStatus: 500,
    };
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
          trigger,
        },
        actor_id: actorId,
      });
      if (pendingError) {
        console.error('hiring billing: failed to record billing_charge_pending', pendingError);
      }
      return {
        kind: 'pending',
        amount,
        paymentIntentId: null,
        message:
          'We could not confirm whether your payment completed. Do not retry — our team will verify the payment and your balance will update automatically. Contact support if it has not updated within one business day.',
      };
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
      const declined: SettleResult = {
        kind: 'declined',
        error: `Your card was declined${stripeErr.message ? ` (${stripeErr.message})` : ''}. Your balance is still due — update the card on file and try again.${restoreNote}`,
        httpStatus: 402,
      };
      await recordSystemDecline(tenantId, trigger, amount, declined.error, stripeErr?.code ?? null);
      return declined;
    }
    return {
      kind: 'error',
      error: `${stripeErr?.message || 'Payment failed.'}${restoreNote}`,
      httpStatus: 500,
    };
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
        trigger,
      },
      actor_id: actorId,
    });
    if (pendingError) {
      // The pending record is our reconciliation trail — surface loudly.
      console.error('hiring billing: failed to record billing_charge_pending', pendingError);
    }
    return {
      kind: 'pending',
      amount,
      paymentIntentId: paymentIntent.id,
      message:
        'Your payment is processing. No action needed — this page will show it as paid once it completes. Do not retry the charge.',
    };
  }

  if (paymentIntent.status !== 'succeeded') {
    // Definitive non-success (requires_payment_method, canceled, ...) —
    // release the claim so the balance is owed again.
    const restoreFailure = await restoreBalance();
    const restoreNote = restoreFailure
      ? ` (Additionally, restoring your balance failed: ${restoreFailure} — contact support.)`
      : '';
    const declined: SettleResult = {
      kind: 'declined',
      error: `Payment did not complete (status: ${paymentIntent.status}). Your balance is still due — update the card on file and try again.${restoreNote}`,
      httpStatus: 402,
    };
    await recordSystemDecline(tenantId, trigger, amount, declined.error, paymentIntent.status);
    return declined;
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
      return {
        kind: 'error',
        error: `Charge succeeded (${paymentIntent.id}) but marking ledger entries as paid failed: ${ledgerSettleError.message}`,
        httpStatus: 500,
      };
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
    return {
      kind: 'error',
      error: `Charge succeeded (${paymentIntent.id}) but updating billing records failed: ${settleError.message}`,
      httpStatus: 500,
    };
  }

  // Fire-and-forget history event.
  Promise.resolve(
    supabaseAdmin.from('hiring_events').insert({
      tenant_id: tenantId,
      event_type: 'billing_charged',
      meta: { amount, payment_intent: paymentIntent.id, ledger_ids: ledgerIds, trigger },
      actor_id: actorId,
    })
  ).then(() => {}).catch(() => {});

  return {
    kind: 'charged',
    amount,
    paymentIntentId: paymentIntent.id,
    lifetimeBilled: newLifetime,
    newThreshold,
  };
}

/**
 * System-context (cron / jobs-paused) decline follow-up: there is no human
 * looking at an HTTP response, so persist a 'billing_charge_declined' event
 * and bell-notify the tenant's admins to update their card. Fire-and-forget
 * semantics — a logging failure must never mask the decline result — but
 * AWAITED so serverless doesn't kill the writes mid-flight. No retry storm:
 * the next daily cron run retries the charge naturally.
 *
 * Manual charges skip this entirely (identical pre-refactor behavior: the
 * admin clicking "Charge now" sees the 402 in the UI).
 */
async function recordSystemDecline(
  tenantId: string,
  trigger: SettleTrigger,
  amount: number,
  errorMessage: string,
  declineCode: string | null
): Promise<void> {
  if (trigger === 'manual') return;
  try {
    await supabaseAdmin.from('hiring_events').insert({
      tenant_id: tenantId,
      event_type: 'billing_charge_declined',
      meta: { amount, trigger, decline_code: declineCode, error_message: errorMessage },
      actor_id: null,
    });
  } catch (err) {
    console.error('hiring billing: failed to record billing_charge_declined', err);
  }
  try {
    const { data: adminProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'super_admin', 'operations_manager'])
      .eq('tenant_id', tenantId);
    if (adminProfiles && adminProfiles.length > 0) {
      await supabaseAdmin.from('notifications').insert(
        adminProfiles.map((p: { id: string }) => ({
          user_id: p.id,
          type: 'billing_charge_declined',
          notification_type: 'billing_charge_declined',
          title: 'Job Board payment declined',
          message: `We could not charge your card on file for $${amount.toFixed(2)} of ad spend. Please update your payment method — we'll retry automatically.`,
          tenant_id: tenantId,
          read: false,
          is_read: false,
          action_url: '/dashboard/hiring/billing',
          metadata: { amount, trigger, decline_code: declineCode },
        }))
      );
    }
  } catch (err) {
    console.error('hiring billing: failed to notify admins of declined charge', err);
  }
}
