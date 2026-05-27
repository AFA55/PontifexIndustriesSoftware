export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/create-portal-session
 *
 * Creates a Stripe Billing Portal session so admin users can manage their
 * subscription (update payment method, cancel, download invoices, etc.).
 *
 * Returns: { success: true, data: { url: string } }
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  // Resolve tenant ID (super_admin has null tenantId — they'd need ?tenantId= but for portal
  // they should always be acting as a specific tenant's admin)
  const tenantId = auth.tenantId;
  if (!tenantId) {
    return NextResponse.json(
      { error: 'Tenant context required for billing portal.' },
      { status: 400 }
    );
  }

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('stripe_customer_id')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });
  }

  const stripeCustomerId = tenant.stripe_customer_id as string | null;

  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: 'No Stripe customer found for this tenant. Please complete a subscription checkout first.' },
      { status: 400 }
    );
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: 'https://www.pontifexindustries.com/dashboard/admin/settings',
  });

  return NextResponse.json({ success: true, data: { url: portalSession.url } });
}
