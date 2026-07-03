export const dynamic = 'force-dynamic';

/**
 * POST /api/hiring/billing/confirm-payment-method — after the client confirms
 * the SetupIntent, attach the payment method to the tenant's Stripe customer,
 * set it as the customer default, and store it in hiring_billing.
 * Body: { payment_method_id }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, resolveBillingTenant } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import { ensureBillingRow, isStripeConfigured } from '@/lib/hiring/billing';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const scope = await resolveBillingTenant(request, auth);
  if ('response' in scope) return scope.response;
  const tenantId = scope.tenantId;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { payment_method_id?: unknown };
    const paymentMethodId =
      typeof body.payment_method_id === 'string' ? body.payment_method_id.trim() : '';
    if (!paymentMethodId) {
      return NextResponse.json({ error: 'payment_method_id is required' }, { status: 400 });
    }

    const billing = await ensureBillingRow(tenantId);
    if (!billing.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing customer yet. Start card setup first.' },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    // Attach — tolerate "already attached" (SetupIntent confirmation attaches it),
    // but never accept a payment method that belongs to a DIFFERENT customer.
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: billing.stripe_customer_id,
      });
    } catch {
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
      const owner = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id;
      if (owner !== billing.stripe_customer_id) {
        return NextResponse.json(
          { error: 'Payment method could not be attached to this account.' },
          { status: 400 }
        );
      }
    }

    await stripe.customers.update(billing.stripe_customer_id, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    await supabaseAdmin
      .from('hiring_billing')
      .update({ default_payment_method: paymentMethodId })
      .eq('tenant_id', tenantId);

    // Card summary for the UI (brand + last4 only).
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

    return NextResponse.json({
      success: true,
      data: {
        brand: pm.card?.brand ?? null,
        last4: pm.card?.last4 ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
