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

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  // Public endpoint — no auth required. This is called from the /patriot
  // sales page by prospective customers who don't have a session yet.

  let body: { priceId?: string; tenantId?: string; email?: string; companyCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { priceId, companyCode, email, tenantId } = body;

  if (!priceId) {
    return NextResponse.json({ error: 'Missing required field: priceId.' }, { status: 400 });
  }

  // Validate the price ID against known plans
  const validPriceIds = [
    process.env.STRIPE_PRICE_ID_BIANNUAL,
    process.env.STRIPE_PRICE_ID_ANNUAL,
  ].filter(Boolean);

  if (!validPriceIds.includes(priceId)) {
    return NextResponse.json({ error: 'Invalid price ID.' }, { status: 400 });
  }

  // Resolve tenant — by tenantId if provided, otherwise by companyCode
  const tenantQuery = tenantId
    ? supabaseAdmin.from('tenants').select('id, name, stripe_customer_id').eq('id', tenantId).maybeSingle()
    : companyCode
    ? supabaseAdmin.from('tenants').select('id, name, stripe_customer_id').eq('company_code', companyCode.toUpperCase()).maybeSingle()
    : null;

  if (!tenantQuery) {
    return NextResponse.json({ error: 'Must provide tenantId or companyCode.' }, { status: 400 });
  }

  const { data: tenant, error: tenantError } = await tenantQuery;

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });
  }

  // Create or retrieve Stripe Customer
  let stripeCustomerId = tenant.stripe_customer_id as string | null;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      ...(email ? { email } : {}),
      name: tenant.name ?? undefined,
      metadata: {
        tenant_id: tenant.id,
        company_code: companyCode ?? '',
      },
    });

    stripeCustomerId = customer.id;

    // Persist the new customer ID back to the tenant record
    const { error: updateError } = await supabaseAdmin
      .from('tenants')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('id', tenant.id);

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
      tenant_id: tenant.id,
      company_code: companyCode ?? '',
    },
    subscription_data: {
      metadata: {
        tenant_id: tenant.id,
        company_code: companyCode ?? '',
      },
    },
  });

  return NextResponse.json({ success: true, data: { url: session.url } });
}
