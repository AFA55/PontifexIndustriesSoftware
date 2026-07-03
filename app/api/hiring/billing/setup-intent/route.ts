export const dynamic = 'force-dynamic';

/**
 * POST /api/hiring/billing/setup-intent — start card-on-file collection.
 * Creates (or reuses) the tenant's Stripe customer, stores stripe_customer_id
 * on hiring_billing, and returns a SetupIntent client_secret for Stripe.js
 * Elements to confirm on the client.
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
    const billing = await ensureBillingRow(tenantId);
    const stripe = getStripe();

    let customerId = billing.stripe_customer_id;
    if (!customerId) {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('name, billing_email')
        .eq('id', tenantId)
        .maybeSingle();

      const customer = await stripe.customers.create({
        name: (tenant?.name as string | undefined) ?? undefined,
        email: ((tenant?.billing_email as string | null) || auth.userEmail) ?? undefined,
        metadata: { tenant_id: tenantId, module: 'hiring' },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from('hiring_billing')
        .update({ stripe_customer_id: customerId })
        .eq('tenant_id', tenantId);
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session', // we charge the saved card later without the user present
      payment_method_types: ['card'],
      metadata: { tenant_id: tenantId, module: 'hiring' },
    });

    return NextResponse.json({
      success: true,
      data: { clientSecret: setupIntent.client_secret },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
