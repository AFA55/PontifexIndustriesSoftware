export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/webhook
 *
 * Receives Stripe webhook events, verifies the signature, and keeps
 * public.tenants in sync with the subscription state.
 *
 * Handled events:
 *   checkout.session.completed      → activate subscription
 *   customer.subscription.updated   → sync status / plan / period
 *   customer.subscription.deleted   → mark cancelled
 *   invoice.payment_failed          → mark past_due
 *
 * All other events return 200 immediately (Stripe retries on non-2xx).
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Price IDs are safe at module level — they have hard-coded fallbacks.
const BIANNUAL_PRICE_ID = process.env.STRIPE_PRICE_ID_BIANNUAL ?? 'price_1TbV2E0WWq11qMKimnEXVElP';
const ANNUAL_PRICE_ID = process.env.STRIPE_PRICE_ID_ANNUAL ?? 'price_1TbV2E0WWq11qMKidsCGCrl8';

function derivePlanType(priceId: string): string {
  if (priceId === ANNUAL_PRICE_ID) return 'annual';
  if (priceId === BIANNUAL_PRICE_ID) return 'biannual';
  return 'unknown';
}

async function updateTenantByCustomer(
  stripeCustomerId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('tenants')
    .update(fields)
    .eq('stripe_customer_id', stripeCustomerId);

  if (error) {
    console.error('[stripe-webhook] Failed to update tenant:', error, { stripeCustomerId, fields });
  }
}

function fireAuditLog(eventType: string, stripeCustomerId: string, payload: Record<string, unknown>): void {
  Promise.resolve(
    supabaseAdmin.from('audit_logs').insert({
      action: `stripe.${eventType}`,
      table_name: 'tenants',
      record_id: stripeCustomerId,
      new_values: payload,
    })
  ).catch(() => {});
}

export async function POST(request: NextRequest) {
  // Initialise Stripe inside the handler so the module can be imported at
  // build time without STRIPE_SECRET_KEY being present in the build env.
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set.');
    return NextResponse.json({ error: 'Webhook secret not configured.' }, { status: 500 });
  }

  // Read raw body — must use text() before any json() attempt
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stripe-webhook] Signature verification failed:', message);
    return NextResponse.json({ error: `Webhook signature invalid: ${message}` }, { status: 400 });
  }

  // ── Event handlers ──────────────────────────────────────────────────────────

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.mode !== 'subscription' || !session.customer || !session.subscription) {
      return NextResponse.json({ received: true });
    }

    const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription.id;

    // Expand subscription to get price + period details
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const firstItem = subscription.items.data[0];
    const priceId = firstItem?.price?.id ?? '';
    const planType = derivePlanType(priceId);
    // In Stripe v21+, current_period_end lives on SubscriptionItem, not Subscription
    const currentPeriodEnd = firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000).toISOString()
      : null;

    const fields = {
      stripe_subscription_id: subscriptionId,
      subscription_status: 'active',
      plan_type: planType,
      current_period_end: currentPeriodEnd,
    };

    await updateTenantByCustomer(customerId, fields);
    fireAuditLog('checkout.session.completed', customerId, { subscriptionId, planType, currentPeriodEnd });
  }

  else if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

    const firstItem = subscription.items.data[0];
    const priceId = firstItem?.price?.id ?? '';
    const planType = derivePlanType(priceId);
    // In Stripe v21+, current_period_end lives on SubscriptionItem, not Subscription
    const currentPeriodEnd = firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000).toISOString()
      : null;

    // Map Stripe status to our internal status
    const statusMap: Record<string, string> = {
      active: 'active',
      past_due: 'past_due',
      canceled: 'cancelled',
      unpaid: 'past_due',
      trialing: 'active',
      paused: 'paused',
      incomplete: 'incomplete',
      incomplete_expired: 'cancelled',
    };
    const subscriptionStatus = statusMap[subscription.status] ?? subscription.status;

    const fields = {
      subscription_status: subscriptionStatus,
      plan_type: planType,
      current_period_end: currentPeriodEnd,
    };

    await updateTenantByCustomer(customerId, fields);
    fireAuditLog('customer.subscription.updated', customerId, { subscriptionStatus, planType, currentPeriodEnd });
  }

  else if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

    await updateTenantByCustomer(customerId, { subscription_status: 'cancelled' });
    fireAuditLog('customer.subscription.deleted', customerId, { subscription_status: 'cancelled' });
  }

  else if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === 'string'
      ? invoice.customer
      : (invoice.customer as Stripe.Customer | null)?.id ?? '';

    if (customerId) {
      await updateTenantByCustomer(customerId, { subscription_status: 'past_due' });
      fireAuditLog('invoice.payment_failed', customerId, { subscription_status: 'past_due' });
    }
  }

  // Always return 200 for unhandled events — Stripe retries on non-2xx
  return NextResponse.json({ received: true });
}
