export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import { PLANS, type PlanId } from '@/lib/billing-plans';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json() as { planId: string };
    const { planId } = body;

    if (!planId || !(planId in PLANS)) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    const plan = PLANS[planId as PlanId];

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, name, billing_email, stripe_customer_id')
      .eq('id', auth.tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const stripe = getStripe();
    let stripeCustomerId = tenant.stripe_customer_id as string | null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: tenant.name,
        email: (tenant.billing_email || auth.userEmail) ?? undefined,
        metadata: { tenant_id: auth.tenantId },
      });
      stripeCustomerId = customer.id;
      await supabaseAdmin
        .from('tenants')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', auth.tenantId);
    }

    const origin = request.headers.get('origin') || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${origin}/dashboard/admin/subscription?success=true`,
      cancel_url: `${origin}/dashboard/admin/subscription?canceled=true`,
      subscription_data: {
        trial_period_days: 14,
        metadata: { tenant_id: auth.tenantId, plan: planId },
      },
      metadata: { tenant_id: auth.tenantId, plan: planId },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ success: true, data: { url: session.url } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
