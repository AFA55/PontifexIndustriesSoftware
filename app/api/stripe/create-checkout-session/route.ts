export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/create-checkout-session
 *
 * Creates (or retrieves) a Stripe Customer for the tenant, then opens a
 * hosted Checkout Session for a subscription purchase.
 *
 * Body: { priceId, tenantId, email, companyCode }
 * Returns: { success: true, data: { url: string } }
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  let body: { priceId?: string; tenantId?: string; email?: string; companyCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { priceId, tenantId, email, companyCode } = body;

  if (!priceId || !tenantId || !email) {
    return NextResponse.json(
      { error: 'Missing required fields: priceId, tenantId, email.' },
      { status: 400 }
    );
  }

  // Validate the price ID against known plans
  const validPriceIds = [
    process.env.STRIPE_PRICE_ID_BIANNUAL,
    process.env.STRIPE_PRICE_ID_ANNUAL,
  ].filter(Boolean);

  if (!validPriceIds.includes(priceId)) {
    return NextResponse.json({ error: 'Invalid price ID.' }, { status: 400 });
  }

  // Fetch tenant — verify it exists and get existing stripe_customer_id
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, name, stripe_customer_id')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });
  }

  // Create or retrieve Stripe Customer
  let stripeCustomerId = tenant.stripe_customer_id as string | null;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email,
      name: tenant.name ?? undefined,
      metadata: {
        tenant_id: tenantId,
        company_code: companyCode ?? '',
      },
    });

    stripeCustomerId = customer.id;

    // Persist the new customer ID back to the tenant record
    const { error: updateError } = await supabaseAdmin
      .from('tenants')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('id', tenantId);

    if (updateError) {
      console.error('[create-checkout-session] Failed to save stripe_customer_id:', updateError);
      // Non-fatal — proceed; customer was created in Stripe
    }
  }

  // Create Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: 'https://www.pontifexindustries.com/company-login?activated=true',
    cancel_url: 'https://www.pontifexindustries.com/patriot',
    metadata: {
      tenant_id: tenantId,
      company_code: companyCode ?? '',
    },
    subscription_data: {
      metadata: {
        tenant_id: tenantId,
        company_code: companyCode ?? '',
      },
    },
  });

  return NextResponse.json({ success: true, data: { url: session.url } });
}
