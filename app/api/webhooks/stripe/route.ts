import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import Stripe from 'stripe';

// Do NOT let Next.js parse the body — we need the raw text for Stripe signature verification
export const dynamic = 'force-dynamic';

async function updateTenantByCustomerOrMeta(
  customerId: string | null,
  metaTenantId: string | null,
  updates: Record<string, unknown>
) {
  if (customerId) {
    const { error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('stripe_customer_id', customerId);
    if (!error) return;
  }
  if (metaTenantId) {
    await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', metaTenantId);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook verification failed';
    console.error('[Stripe Webhook] Signature verification failed:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
        const metaTenantId = session.metadata?.tenant_id ?? null;
        const plan = session.metadata?.plan ?? 'starter';

        await updateTenantByCustomerOrMeta(customerId, metaTenantId, {
          subscription_status: 'active',
          stripe_subscription_id: subscriptionId,
          subscription_plan: plan,
        });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
        const metaTenantId = sub.metadata?.tenant_id ?? null;
        const plan = sub.metadata?.plan ?? null;

        // current_period_end was removed in Stripe API 2024-12-18.acacia
        // Use billing_cycle_anchor as a proxy for the next billing date
        const anchorTs = (sub as unknown as Record<string, unknown>).billing_cycle_anchor as number | null | undefined;
        const periodEnd = anchorTs ? new Date(anchorTs * 1000).toISOString() : null;

        const updates: Record<string, unknown> = {
          subscription_status: sub.status,
          subscription_period_end: periodEnd,
        };
        if (plan) updates.subscription_plan = plan;

        await updateTenantByCustomerOrMeta(customerId, metaTenantId, updates);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
        const metaTenantId = sub.metadata?.tenant_id ?? null;

        await updateTenantByCustomerOrMeta(customerId, metaTenantId, {
          subscription_status: 'canceled',
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;

        await updateTenantByCustomerOrMeta(customerId, null, {
          subscription_status: 'past_due',
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;

        await updateTenantByCustomerOrMeta(customerId, null, {
          subscription_status: 'active',
        });
        break;
      }

      default:
        // Unhandled event type — ignore
        break;
    }
  } catch (err) {
    // Log but always return 200 so Stripe doesn't retry indefinitely
    console.error('[Stripe Webhook] Handler error:', err);
  }

  return NextResponse.json({ received: true });
}
